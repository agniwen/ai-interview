import { describe, expect, it } from "vitest";
import {
  mergeInterviewQuestionOutcome,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";

const OUTCOME = {
  answerSummary: "候选人说明了告警、根因和预防措施",
  difficulty: "medium" as const,
  endedAtSecs: 48,
  evaluationFocus: "确认候选人能够定位并复盘线上故障",
  followUpCount: 1,
  followUpDirections: "追问定位信号、根因和预防措施",
  question: "请介绍一次线上故障排查经历。",
  questionId: "question-1",
  reason: null,
  revision: 1,
  startedAtSecs: 12,
  status: "answered" as const,
};

describe("interview question outcomes", () => {
  it("parses V2 data collection results", () => {
    expect(
      parseInterviewDataCollectionResults({
        questions: [OUTCOME],
        schemaVersion: 2,
      }),
    ).toEqual({
      questions: [OUTCOME],
      schemaVersion: 2,
    });
  });

  it("treats old or malformed data as a legacy report without hiding it", () => {
    expect(parseInterviewDataCollectionResults({})).toBeNull();
    expect(
      parseInterviewDataCollectionResults({
        questions: [{ ...OUTCOME, status: "unknown" }],
        schemaVersion: 2,
      }),
    ).toBeNull();
  });

  it("keeps the latest revision when checkpoints are redelivered", () => {
    const revised = {
      ...OUTCOME,
      answerSummary: "候选人补充了完整复盘机制",
      revision: 2,
    };

    expect(
      mergeInterviewQuestionOutcome({ questions: [revised], schemaVersion: 2 }, OUTCOME),
    ).toEqual({ questions: [revised], schemaVersion: 2 });
    expect(
      mergeInterviewQuestionOutcome({ questions: [OUTCOME], schemaVersion: 2 }, revised),
    ).toEqual({ questions: [revised], schemaVersion: 2 });
  });
});
