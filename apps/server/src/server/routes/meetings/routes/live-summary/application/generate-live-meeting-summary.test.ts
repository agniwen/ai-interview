import { describe, expect, it, vi } from "vitest";
import type { MeetingLiveSummaryRequest } from "@app/shared/meeting-live-summary";
import { generateLiveMeetingSummary } from "./generate-live-meeting-summary";

const baseRequest: MeetingLiveSummaryRequest = {
  baseSnapshot: null,
  captureId: "00000000-0000-4000-8000-000000000072",
  template: "general",
  turns: [
    {
      endMs: 8000,
      final: true,
      id: "turn-1",
      speakerDisplayName: "说话人1",
      speakerKey: "remote-1",
      startMs: 2000,
      text: "我们先讨论支付系统重构。",
      track: "system",
    },
    {
      endMs: 14_000,
      final: true,
      id: "turn-2",
      speakerDisplayName: "说话人2",
      speakerKey: "local",
      startMs: 9000,
      text: "重点是缓存一致性和性能。",
      track: "microphone",
    },
  ],
};

const candidate = {
  activeTopicId: "new-topic-1",
  summary: "正在讨论支付系统重构。",
  topics: [
    {
      evidenceTurnIds: ["turn-1", "turn-2"],
      id: "new-topic-1",
      points: [
        {
          evidenceTurnIds: ["turn-2"],
          id: "new-point-1",
          kind: "fact" as const,
          text: "重点关注缓存一致性和性能。",
        },
      ],
      summary: "讨论重构重点。",
      title: "支付系统重构",
    },
  ],
};

describe("generateLiveMeetingSummary", () => {
  it("creates deterministic evidence-backed node ids and time ranges", async () => {
    const generateCandidate = vi.fn().mockResolvedValue(candidate);
    const dependencies = {
      generateCandidate,
      getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
      now: () => new Date("2026-09-04T03:00:00.000Z"),
    };

    const first = await generateLiveMeetingSummary(baseRequest, dependencies);
    const replay = await generateLiveMeetingSummary(baseRequest, dependencies);

    expect(first.topics[0]).toMatchObject({
      endMs: 14_000,
      startMs: 2000,
      status: "active",
    });
    expect(first.topics[0]?.points[0]).toMatchObject({ endMs: 14_000, startMs: 9000 });
    expect(replay.topics[0]?.id).toBe(first.topics[0]?.id);
    expect(replay.topics[0]?.points[0]?.id).toBe(first.topics[0]?.points[0]?.id);
    expect(first).toMatchObject({
      coveredThroughMs: 14_000,
      coveredThroughTurnId: "turn-2",
      revision: 1,
    });
  });

  it("preserves omitted historical topics and rejects unknown evidence", async () => {
    const first = await generateLiveMeetingSummary(baseRequest, {
      generateCandidate: vi.fn().mockResolvedValue(candidate),
      getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
      now: () => new Date("2026-09-04T03:00:00.000Z"),
    });
    const nextRequest: MeetingLiveSummaryRequest = {
      baseSnapshot: first,
      captureId: baseRequest.captureId,
      template: "general",
      turns: [
        {
          ...baseRequest.turns[1],
          endMs: 20_000,
          id: "turn-3",
          startMs: 15_000,
          text: "接下来讨论上线计划。",
        },
      ],
    };
    const nextCandidate = {
      activeTopicId: "new-topic-2",
      summary: "开始讨论上线计划。",
      topics: [
        {
          evidenceTurnIds: ["turn-3"],
          id: "new-topic-2",
          points: [],
          summary: "讨论上线节奏。",
          title: "上线计划",
        },
      ],
    };
    const next = await generateLiveMeetingSummary(nextRequest, {
      generateCandidate: vi.fn().mockResolvedValue(nextCandidate),
      getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
      now: () => new Date("2026-09-04T03:01:00.000Z"),
    });

    expect(next.topics.map((topic) => [topic.title, topic.status])).toEqual([
      ["支付系统重构", "completed"],
      ["上线计划", "active"],
    ]);
    const corrected = await generateLiveMeetingSummary(
      {
        baseSnapshot: next,
        captureId: baseRequest.captureId,
        template: "general",
        turns: [{ ...baseRequest.turns[0], text: "我们先讨论支付系统的增量重构。" }],
      },
      {
        generateCandidate: vi.fn().mockResolvedValue({
          activeTopicId: next.topics[0]?.id ?? null,
          summary: next.summary,
          topics: [
            {
              evidenceTurnIds: ["turn-1"],
              id: next.topics[0]?.id,
              points: [],
              summary: "讨论增量重构。",
              title: "支付系统重构",
            },
          ],
        }),
        getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
        now: () => new Date("2026-09-04T03:02:00.000Z"),
      },
    );
    expect(corrected).toMatchObject({
      coveredThroughMs: 20_000,
      coveredThroughTurnId: "turn-3",
      revision: 3,
    });
    await expect(
      generateLiveMeetingSummary(nextRequest, {
        generateCandidate: vi.fn().mockResolvedValue({
          ...nextCandidate,
          topics: [{ ...nextCandidate.topics[0], evidenceTurnIds: ["invented-turn"] }],
        }),
        getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
        now: () => new Date("2026-09-04T03:01:00.000Z"),
      }),
    ).rejects.toThrow("不属于输入字幕");
  });

  it("bounds accumulated evidence while retaining the first and latest turns", async () => {
    const first = await generateLiveMeetingSummary(baseRequest, {
      generateCandidate: vi.fn().mockResolvedValue(candidate),
      getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
      now: () => new Date("2026-09-04T03:00:00.000Z"),
    });
    const historicalEvidence = [
      "turn-1",
      "turn-2",
      ...Array.from({ length: 28 }, (_, index) => `historical-${index}`),
    ];
    const [existingTopic] = first.topics;
    if (!existingTopic) {
      throw new Error("expected generated topic");
    }
    const request: MeetingLiveSummaryRequest = {
      baseSnapshot: {
        ...first,
        topics: [{ ...existingTopic, evidenceTurnIds: historicalEvidence }],
      },
      captureId: baseRequest.captureId,
      template: "general",
      turns: [{ ...baseRequest.turns[1], id: "latest-turn", text: "补充最新事实。" }],
    };
    const result = await generateLiveMeetingSummary(request, {
      generateCandidate: vi.fn().mockResolvedValue({
        activeTopicId: existingTopic.id,
        summary: "补充了最新事实。",
        topics: [
          {
            evidenceTurnIds: ["latest-turn"],
            id: existingTopic.id,
            points: [],
            summary: "主题获得补充。",
            title: existingTopic.title,
          },
        ],
      }),
      getGeneratorSnapshot: () => ({ model: "test-model", provider: "test-provider" }),
      now: () => new Date("2026-09-04T03:03:00.000Z"),
    });

    expect(result.topics[0]?.evidenceTurnIds).toHaveLength(30);
    expect(result.topics[0]?.evidenceTurnIds).toContain("turn-1");
    expect(result.topics[0]?.evidenceTurnIds).toContain("latest-turn");
  });
});
