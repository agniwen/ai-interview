import { describe, expect, it } from "vitest";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import {
  applyQuestionOutcomesToEvaluation,
  interviewEvaluationSchema,
  normalizeInterviewEvaluationOutput,
} from "./interview-report.js";

const baseEvaluation = interviewEvaluationSchema.parse({
  hrEvaluation: {
    availability: null,
    careerProgression: null,
    compensationExpectations: null,
    jobMotivation: null,
    overseasTravel: null,
    projectHighlights: null,
    recentWork: null,
  },
  overallAssessment: "待人工复核",
  overallScore: 80,
  questions: [
    {
      assessment: "回答充分",
      evidence: [{ quote: "候选人回答" }],
      maxScore: 10,
      order: 1,
      question: "原题",
      questionId: "q1",
      score: 8,
    },
  ],
  recommendation: "建议进入下一轮",
});

describe("interview report evaluation contract", () => {
  it("normalizes the legacy questionEvaluations alias and missing HR fields", () => {
    expect(
      normalizeInterviewEvaluationOutput(
        {
          overallAssessment: "ok",
          overallScore: 80,
          questionEvaluations: [{ questionId: "q1", score: 8 }],
          recommendation: "建议进入下一轮",
        },
        [
          {
            difficulty: "medium",
            order: 1,
            question: "原题",
            questionId: "q1",
          },
        ],
      ),
    ).toMatchObject({
      hrEvaluation: { availability: null, recentWork: null },
      questions: [{ order: 1, question: "原题", questionId: "q1", score: 8 }],
    });
  });

  it("clears evidence when the question prompt itself was interrupted", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: null,
          difficulty: "medium",
          endedAtSecs: 4,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "原题",
          questionId: "q1",
          reason: "question_prompt_interrupted",
          revision: 1,
          startedAtSecs: 1,
          status: "interrupted",
        },
      ],
      schemaVersion: 2,
    };
    const result = applyQuestionOutcomesToEvaluation(baseEvaluation, outcomes);
    expect(result.questions[0]).toMatchObject({
      assessment: "题目播报未完成，未获得有效回答，不参与评分。",
      evidence: [],
      score: null,
    });
    expect(result.overallScore).toBeNull();
    expect(result.recommendation).toBe("待定");
  });
});
