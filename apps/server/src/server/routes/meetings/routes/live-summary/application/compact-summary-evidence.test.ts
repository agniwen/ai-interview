import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { MeetingLiveSummaryRequest } from "@app/shared/meeting-live-summary";
import { compactSummaryEvidence } from "./compact-summary-evidence";
import {
  generateLiveMeetingSummary,
  meetingLiveSummaryCandidateSchema,
} from "./generate-live-meeting-summary";

const id = "d973ea74-f0d0-4545-b34f-6a2d4a760b13:microphone:5:226:199";
const request: MeetingLiveSummaryRequest = {
  baseSnapshot: null,
  captureId: "d973ea74-f0d0-4545-b34f-6a2d4a760b13",
  template: "general",
  turns: [
    {
      endMs: 2000,
      final: true,
      id,
      speakerDisplayName: null,
      speakerKey: "local",
      startMs: 0,
      text: "最早到岗日期可以手动填写。",
      track: "microphone",
    },
  ],
};
const alias = `e${createHash("sha256").update(id).digest("hex").slice(0, 16)}`;
const candidate = {
  activeTopicId: "new-topic-1",
  summary: "讨论到岗日期。",
  topics: [
    {
      evidenceTurnIds: [alias],
      id: "new-topic-1",
      points: [
        {
          evidenceTurnIds: [alias],
          id: "new-point-1",
          kind: "fact" as const,
          text: "最早到岗日期可以手动填写。",
        },
      ],
      summary: "可以填写到岗日期。",
      title: "到岗日期",
    },
  ],
};
const metadata = {
  getGeneratorSnapshot: () => ({ model: "test", provider: "test" }),
  now: () => new Date("2026-09-08T00:00:00Z"),
};

describe("compact live-summary evidence", () => {
  it("avoids echoing long transcript IDs and restores original evidence before saving", async () => {
    const compact = compactSummaryEvidence(request);
    expect(compact.request.turns[0]?.id).toBe(alias);
    expect(JSON.stringify(candidate).length).toBeLessThan(
      JSON.stringify(compact.restore(candidate)).length,
    );
    const result = await generateLiveMeetingSummary(request, {
      ...metadata,
      generateCandidate: () => Promise.resolve(compact.restore(candidate)),
    });
    expect(result.topics[0]?.points[0]?.evidenceTurnIds).toEqual([id]);
    expect(result.coveredThroughTurnId).toBe(id);
    const next = compactSummaryEvidence({ ...request, baseSnapshot: result });
    expect(next.request.baseSnapshot?.topics[0]?.points[0]?.evidenceTurnIds).toEqual([
      next.request.turns[0]?.id,
    ]);
    expect(next.request.baseSnapshot?.topics[0]?.id).toBe(result.topics[0]?.id);
  });

  it("rejects invented aliases instead of persisting false evidence", () => {
    const compact = compactSummaryEvidence(request);
    expect(() =>
      compact.restore({
        ...candidate,
        topics: [{ ...candidate.topics[0], evidenceTurnIds: ["e999"] }],
      }),
    ).toThrow("不属于输入字幕");
  });

  it("continues rejecting truncated output with the reported missing topic fields", () => {
    const parsed = meetingLiveSummaryCandidateSchema.safeParse({
      ...candidate,
      topics: [{ evidenceTurnIds: [alias] }],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.path.at(-1))).toEqual(
        expect.arrayContaining(["id", "points", "summary", "title"]),
      );
    }
  });
});
