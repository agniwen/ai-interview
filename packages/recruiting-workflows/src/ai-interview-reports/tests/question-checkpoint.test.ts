import { describe, expect, it } from "vitest";
import { parseQuestionCheckpoint } from "../question-checkpoint";

const OUTCOME = {
  answerSummary: "说明了项目职责",
  difficulty: "easy" as const,
  endedAtSecs: 30,
  evaluationFocus: null,
  followUpCount: 0,
  followUpDirections: null,
  question: "请介绍一个项目。",
  questionId: "question-1",
  reason: null,
  revision: 1,
  startedAtSecs: 10,
  status: "answered" as const,
};

describe("question checkpoint payload", () => {
  it("accepts one versioned question outcome", () => {
    expect(
      parseQuestionCheckpoint({
        conversationId: "room-1",
        interviewRecordId: "record-1",
        outcome: OUTCOME,
        scheduleEntryId: "round-1",
      }),
    ).toEqual({
      conversationId: "room-1",
      interviewRecordId: "record-1",
      outcome: OUTCOME,
      scheduleEntryId: "round-1",
    });
  });

  it("rejects a status without the required interruption reason", () => {
    expect(() =>
      parseQuestionCheckpoint({
        conversationId: "room-1",
        interviewRecordId: "record-1",
        outcome: { ...OUTCOME, status: "interrupted" },
        scheduleEntryId: "round-1",
      }),
    ).toThrow();
  });
});
