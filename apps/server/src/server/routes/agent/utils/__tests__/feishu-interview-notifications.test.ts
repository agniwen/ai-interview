import { describe, expect, it } from "vitest";
import { evaluationSummarySchema, extractQuestionScores } from "../feishu-interview-notifications";
import { extractNotificationCardSupplement } from "../feishu-interview-notification-card";

const qualitativeResumeEvaluation = {
  conciseOverall: "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
  detailedOverall: {
    judgment: "候选人整体匹配。",
    matchingEvidence: "具备相关项目经验。",
    risks: "管理规模仍需确认。",
  },
  dimensions: Object.fromEntries(
    [
      "educationBackground",
      "experienceRelevance",
      "potential",
      "projectMatch",
      "skillMatch",
      "stability",
    ].map((key) => [
      key,
      {
        basis: "both",
        evaluation: "简历事实与岗位要求基本一致。",
        level: "recommended",
      },
    ]),
  ),
  recommendationLevel: "recommended",
  schemaVersion: 2,
  seniorityRecommendation: null,
  teamPositioning: null,
};

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

  it("extracts an optional resume evaluation and the first three ordered candidate questions", () => {
    expect(
      extractNotificationCardSupplement({
        interviewQuestions: [
          { difficulty: "hard", order: 4, question: "第四题" },
          { difficulty: "medium", order: 2, question: "第二题" },
          { difficulty: "medium", order: 1, question: "第一题" },
          { difficulty: "hard", order: 3, question: "第三题" },
        ],
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "qualitative",
      }),
    ).toEqual({
      interviewQuestions: ["第一题", "第二题", "第三题"],
      resumeEvaluation: "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
    });
  });

  it("keeps each optional card section independent when the other data is unavailable", () => {
    expect(
      extractNotificationCardSupplement({
        interviewQuestions: [{ difficulty: "medium", order: 1, question: "保留的面试题" }],
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "structured",
      }),
    ).toEqual({ interviewQuestions: ["保留的面试题"], resumeEvaluation: null });

    expect(
      extractNotificationCardSupplement({
        interviewQuestions: null,
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "qualitative",
      }),
    ).toEqual({
      interviewQuestions: [],
      resumeEvaluation: "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
    });
  });
});
