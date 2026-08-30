import { describe, expect, it } from "vitest";
import { evaluationSummarySchema, extractQuestionScores } from "../feishu-interview-notifications";

describe("partial interview summary notifications", () => {
  it("accepts unanswered questions and only includes numeric scores in the card", () => {
    const evaluation = evaluationSummarySchema.parse({
      overallAssessment: "候选人主动结束，本次仅完成部分问题。",
      overallScore: 72,
      questions: [
        {
          maxScore: 10,
          question: "请介绍最近负责的项目。",
          score: 7,
        },
        {
          maxScore: 10,
          question: "请说明项目中的技术难点。",
          score: null,
        },
      ],
      recommendation: "待定",
    });

    expect(extractQuestionScores(evaluation)).toEqual([
      {
        maxScore: 10,
        question: "请介绍最近负责的项目。",
        score: 7,
      },
    ]);
  });

  it("accepts a completed interview without any scorable answers", () => {
    const evaluation = evaluationSummarySchema.parse({
      overallAssessment: "候选人在进入正式问题前结束面试。",
      overallScore: null,
      questions: [
        {
          maxScore: 10,
          question: "请介绍最近负责的项目。",
          score: null,
        },
      ],
      recommendation: "待定",
    });

    expect(evaluation.overallScore).toBeNull();
    expect(extractQuestionScores(evaluation)).toEqual([]);
  });
});
