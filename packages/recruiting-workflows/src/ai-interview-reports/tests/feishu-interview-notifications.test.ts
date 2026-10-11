import { describe, expect, it } from "vitest";
import { evaluationSummarySchema } from "../feishu-interview-notifications";
import { extractNotificationCardSupplement } from "../feishu-interview-notification-card";

const qualitativeResumeEvaluation = {
  conciseOverall: "候选人的企业软件经验与岗位核心要求相符，建议进入下一轮。",
  detailedOverall: {
    judgment:
      "候选人具备多年企业软件交付经验，近期项目职责与岗位核心要求相符，并能提供较完整的技术决策与业务结果证据，整体建议进入下一轮。",
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

function answeredQuestion(index: number, answerSummary: string | null) {
  return {
    answerSummary,
    difficulty: "medium",
    endedAtSecs: index * 10,
    evaluationFocus: null,
    followUpCount: 0,
    followUpDirections: null,
    question: `回答题目 ${index}`,
    questionId: `answer-question-${index}`,
    reason: null,
    revision: 1,
    startedAtSecs: index * 10 - 5,
    status: "answered",
  };
}

describe("partial interview summary notifications", () => {
  it("accepts evaluation results that contain unanswered questions", () => {
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

    expect(evaluation.questions).toHaveLength(2);
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
    expect(evaluation.questions?.[0]?.score).toBeNull();
  });

  it("extracts up to four candidate answers in interview order", () => {
    expect(
      extractNotificationCardSupplement({
        dataCollectionResults: {
          questions: [
            answeredQuestion(1, "第一道题的候选人回答。"),
            answeredQuestion(2, null),
            answeredQuestion(3, "第三道题的候选人回答。"),
            answeredQuestion(4, "第四道题的候选人回答。"),
            answeredQuestion(5, "第五道题的候选人回答。"),
            answeredQuestion(6, "超过卡片容量的回答。"),
          ],
          schemaVersion: 2,
        },
        interviewQuestions: [],
        qualitativeResumeEvaluation: null,
        resumeEvaluationArtifactMode: null,
      }),
    ).toMatchObject({
      questionAnswers: [
        { answer: "第一道题的候选人回答。", question: "回答题目 1" },
        { answer: "第三道题的候选人回答。", question: "回答题目 3" },
        { answer: "第四道题的候选人回答。", question: "回答题目 4" },
        { answer: "第五道题的候选人回答。", question: "回答题目 5" },
      ],
    });
  });

  it("extracts the detailed resume judgment and the first three ordered candidate questions", () => {
    expect(
      extractNotificationCardSupplement({
        dataCollectionResults: null,
        interviewQuestions: [
          { difficulty: "hard", dimension: "team_management", order: 4, question: "第四题" },
          { difficulty: "medium", dimension: "ai_application", order: 2, question: "第二题" },
          { difficulty: "medium", dimension: "business", order: 1, question: "第一题" },
          { difficulty: "hard", dimension: "project_management", order: 3, question: "第三题" },
        ],
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "qualitative",
      }),
    ).toEqual({
      interviewQuestions: ["第一题（业务水平）", "第二题（AI应用）", "第三题（项目管理）"],
      questionAnswers: [],
      resumeEvaluation:
        "候选人具备多年企业软件交付经验，近期项目职责与岗位核心要求相符，并能提供较完整的技术决策与业务结果证据，整体建议进入下一轮。",
    });
  });

  it("keeps each optional card section independent when the other data is unavailable", () => {
    expect(
      extractNotificationCardSupplement({
        dataCollectionResults: null,
        interviewQuestions: [{ difficulty: "medium", order: 1, question: "保留的面试题" }],
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "structured",
      }),
    ).toEqual({
      interviewQuestions: ["保留的面试题（业务水平）"],
      questionAnswers: [],
      resumeEvaluation: null,
    });

    expect(
      extractNotificationCardSupplement({
        dataCollectionResults: null,
        interviewQuestions: null,
        qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: "qualitative",
      }),
    ).toEqual({
      interviewQuestions: [],
      questionAnswers: [],
      resumeEvaluation:
        "候选人具备多年企业软件交付经验，近期项目职责与岗位核心要求相符，并能提供较完整的技术决策与业务结果证据，整体建议进入下一轮。",
    });
  });
});
