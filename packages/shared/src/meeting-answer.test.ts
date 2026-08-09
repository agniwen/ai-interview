import { describe, expect, it } from "vitest";
import {
  createMeetingQuestionSchema,
  materializeMeetingAnswer,
  meetingAnswerModelOutputSchema,
} from "./meeting-answer";

describe("Meeting Answer contract", () => {
  it("requires a stable request id for an idempotent question", () => {
    expect(
      createMeetingQuestionSchema.safeParse({
        question: "候选人提到的主要项目是什么？",
        requestId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("materializes model citations from the authoritative transcript range", () => {
    const answer = materializeMeetingAnswer(
      meetingAnswerModelOutputSchema.parse({
        citationTurnIds: ["turn-2", "turn-2"],
        kind: "answer",
        text: "候选人负责了支付系统迁移。",
      }),
      [
        { endMs: 8000, id: "turn-1", startMs: 2000 },
        { endMs: 16_000, id: "turn-2", startMs: 9000 },
      ],
    );

    expect(answer).toEqual({
      citations: [{ endMs: 16_000, startMs: 9000, turnId: "turn-2" }],
      kind: "answer",
      text: "候选人负责了支付系统迁移。",
    });
  });

  it("rejects a factual answer with a citation outside the supplied transcript", () => {
    expect(() =>
      materializeMeetingAnswer(
        meetingAnswerModelOutputSchema.parse({
          citationTurnIds: ["other-meeting-turn"],
          kind: "answer",
          text: "会议决定下周发布。",
        }),
        [{ endMs: 8000, id: "turn-1", startMs: 2000 }],
      ),
    ).toThrow("Meeting Answer citation 不属于当前转录");
  });

  it("represents insufficient evidence without fabricated citations", () => {
    expect(
      materializeMeetingAnswer(
        meetingAnswerModelOutputSchema.parse({
          citationTurnIds: [],
          kind: "insufficient-evidence",
          text: "预算是 100 万元，但当前证据不足。",
        }),
        [],
      ),
    ).toEqual({
      citations: [],
      kind: "insufficient-evidence",
      text: "当前会议资料中没有足够证据回答这个问题。",
    });
  });
});
