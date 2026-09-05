import { describe, expect, it } from "vitest";
import {
  meetingLiveSummaryRequestSchema,
  meetingLiveSummarySnapshotSchema,
} from "./meeting-live-summary";

const turn = {
  endMs: 8000,
  final: true as const,
  id: "turn-1",
  speakerDisplayName: "说话人1",
  speakerKey: "remote-1",
  startMs: 2000,
  text: "我们先讨论支付系统重构。",
  track: "system" as const,
};

describe("meeting live summary contracts", () => {
  it("accepts a bounded evidence-backed incremental request", () => {
    expect(
      meetingLiveSummaryRequestSchema.parse({
        baseSnapshot: null,
        captureId: "00000000-0000-4000-8000-000000000072",
        template: "general",
        turns: [turn],
      }),
    ).toMatchObject({ turns: [{ final: true, id: "turn-1" }] });
  });

  it("rejects duplicate nodes and evidence outside a topic", () => {
    const parsed = meetingLiveSummarySnapshotSchema.safeParse({
      captureId: "00000000-0000-4000-8000-000000000072",
      coveredThroughMs: 8000,
      coveredThroughTurnId: "turn-1",
      generatedAt: "2026-09-04T03:00:00.000Z",
      model: "test-model",
      provider: "test-provider",
      revision: 1,
      summary: "讨论支付系统。",
      template: "general",
      topics: [
        {
          endMs: 8000,
          evidenceTurnIds: ["turn-1"],
          id: "topic-1",
          points: [
            {
              endMs: 8000,
              evidenceTurnIds: ["turn-2"],
              id: "topic-1",
              kind: "fact",
              startMs: 2000,
              text: "无效证据",
            },
          ],
          startMs: 2000,
          status: "active",
          summary: "讨论重构方案。",
          title: "支付系统",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a valid-shaped snapshot that would overflow the model context", () => {
    const topics = Array.from({ length: 12 }, (_topicValue, topicIndex) => {
      const evidenceTurnIds = Array.from(
        { length: 8 },
        (_pointValue, pointIndex) => `turn-${topicIndex}-${pointIndex}`,
      );
      return {
        endMs: 8000,
        evidenceTurnIds,
        id: `topic-${topicIndex}`,
        points: evidenceTurnIds.map((evidenceTurnId, pointIndex) => ({
          endMs: 8000,
          evidenceTurnIds: [evidenceTurnId],
          id: `point-${topicIndex}-${pointIndex}`,
          kind: "fact",
          startMs: 2000,
          text: "长".repeat(1000),
        })),
        startMs: 2000,
        status: "completed",
        summary: "摘要".repeat(1000),
        title: `主题 ${topicIndex}`,
      };
    });
    const parsed = meetingLiveSummaryRequestSchema.safeParse({
      baseSnapshot: {
        captureId: "00000000-0000-4000-8000-000000000072",
        coveredThroughMs: 8000,
        coveredThroughTurnId: "turn-1",
        generatedAt: "2026-09-04T03:00:00.000Z",
        model: "test-model",
        provider: "test-provider",
        revision: 1,
        summary: "总结",
        template: "general",
        topics,
      },
      captureId: "00000000-0000-4000-8000-000000000072",
      template: "general",
      turns: [turn],
    });

    expect(parsed.success).toBe(false);
  });
});
