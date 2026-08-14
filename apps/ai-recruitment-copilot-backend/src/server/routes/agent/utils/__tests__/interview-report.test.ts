import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import {
  applyQuestionOutcomesToEvaluation,
  formatCandidateFormSubmissions,
  generateInterviewReport,
} from "../interview-report";
import type { InterviewEvaluationQuestion } from "../interview-report";

const mocks = vi.hoisted(() => ({
  generateStructuredWithMastraAgent: vi.fn(),
  generateTextWithMastraAgent: vi.fn(),
  interviewReportEvaluationAgent: { id: "interview-report-evaluation-agent" },
  interviewReportSummaryAgent: { id: "interview-report-summary-agent" },
}));

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: mocks.generateStructuredWithMastraAgent,
    generateTextWithMastraAgent: mocks.generateTextWithMastraAgent,
    interviewReportEvaluationAgent: mocks.interviewReportEvaluationAgent,
    interviewReportSummaryAgent: mocks.interviewReportSummaryAgent,
  }),
);

const TRANSCRIPT: InterviewTranscriptTurn[] = [
  { message: "请介绍你的项目。", role: "agent", timeInCallSecs: 1 },
  { message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 },
];

const QUESTIONS: InterviewEvaluationQuestion[] = [
  { difficulty: "easy", order: 1, question: "请介绍你的项目。", questionId: "question-1" },
];

const EVALUATION = {
  hrEvaluation: {
    availability: "目前在职，预计一个月内到岗。",
    careerProgression: "上一家公司晋升一次，最近绩效为 A。",
    compensationExpectations: "目前年包 50 万，期望年包 60 万。",
    jobMotivation: "希望承担更完整的系统架构职责。",
    overseasTravel: "已婚，可接受每次两周以内的海外出差。",
    projectHighlights: "主导招聘系统从零到一建设。",
    recentWork: "最近两家公司均为约 200 人规模，主要担任项目主导者。",
  },
  overallAssessment: "候选人表达清晰。",
  overallScore: 82,
  questions: [
    {
      assessment: "回答覆盖项目背景。",
      evidence: [{ quote: "我负责招聘系统前端。", timeInCallSecs: 6, turnIndex: 2 }],
      maxScore: 10,
      order: 1,
      question: "请介绍你的项目。",
      questionId: "question-1",
      score: 8,
    },
  ],
  recommendation: "建议进入下一轮" as const,
};

describe("generateInterviewReport", () => {
  beforeEach(() => {
    mocks.generateStructuredWithMastraAgent.mockReset();
    mocks.generateTextWithMastraAgent.mockReset();
  });

  it("returns empty report when transcript is empty", async () => {
    await expect(
      generateInterviewReport({ candidateFormResponses: "", questions: QUESTIONS, transcript: [] }),
    ).resolves.toEqual({
      evaluation: null,
      summary: null,
    });
    expect(mocks.generateTextWithMastraAgent).not.toHaveBeenCalled();
    expect(mocks.generateStructuredWithMastraAgent).not.toHaveBeenCalled();
  });

  it("generates summary and structured evaluation with Mastra agents", async () => {
    mocks.generateTextWithMastraAgent.mockResolvedValue(" 面试摘要 ");
    mocks.generateStructuredWithMastraAgent.mockResolvedValue(EVALUATION);

    await expect(
      generateInterviewReport({
        candidateFormResponses: "当前求职状态：在职，一个月内到岗",
        questions: QUESTIONS,
        transcript: TRANSCRIPT,
      }),
    ).resolves.toEqual({
      evaluation: EVALUATION,
      summary: "面试摘要",
    });

    expect(mocks.generateTextWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.interviewReportSummaryAgent,
        temperature: 0.2,
      }),
    );
    expect(mocks.generateStructuredWithMastraAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: mocks.interviewReportEvaluationAgent,
        prompt: expect.stringMatching(
          /当前求职状态：在职，一个月内到岗[\s\S]*年龄、成家情况、是否可以接受短期海外出差及周期[\s\S]*hrEvaluation\.projectHighlights：候选人分享的亮点项目/,
        ),
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
  });

  it("preserves partial success when evaluation fails", async () => {
    mocks.generateTextWithMastraAgent.mockResolvedValue("摘要");
    mocks.generateStructuredWithMastraAgent.mockRejectedValue(new Error("evaluation failed"));

    await expect(
      generateInterviewReport({
        candidateFormResponses: "",
        questions: QUESTIONS,
        transcript: TRANSCRIPT,
      }),
    ).resolves.toEqual({
      evaluation: null,
      evaluationError: "evaluation failed",
      summary: "摘要",
    });
  });

  it("formats candidate form answers with option labels for HR extraction", () => {
    expect(
      formatCandidateFormSubmissions([
        {
          answers: {
            availability: "one_month",
            travel: ["short_term", "overseas"],
          },
          snapshot: {
            description: null,
            jobDescriptionIds: [],
            questions: [
              {
                displayMode: "select",
                helperText: null,
                id: "availability",
                label: "最快到岗时间",
                options: [{ label: "一个月内", value: "one_month" }],
                required: true,
                sortOrder: 1,
                type: "single",
              },
              {
                displayMode: "checkbox",
                helperText: null,
                id: "travel",
                label: "可接受出差情况",
                options: [
                  { label: "短期", value: "short_term" },
                  { label: "海外", value: "overseas" },
                ],
                required: true,
                sortOrder: 2,
                type: "multi",
              },
            ],
            scope: "global",
            templateId: "form-1",
            title: "候选人信息",
          },
          submittedAt: "2026-07-20T10:00:00.000Z",
          templateId: "form-1",
          version: 1,
          versionId: "version-1",
        },
      ]),
    ).toBe("【候选人信息】\n最快到岗时间：一个月内\n可接受出差情况：短期、海外");
  });

  it("derives scores only from scorable V2 question outcomes", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: "回答完整",
          difficulty: "easy",
          endedAtSecs: 20,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目一",
          questionId: "q1",
          reason: null,
          revision: 1,
          startedAtSecs: 1,
          status: "answered",
        },
        {
          answerSummary: "信息有限",
          difficulty: "medium",
          endedAtSecs: 40,
          evaluationFocus: "验证技术深度",
          followUpCount: 2,
          followUpDirections: null,
          question: "题目二",
          questionId: "q2",
          reason: null,
          revision: 1,
          startedAtSecs: 21,
          status: "insufficient",
        },
        {
          answerSummary: null,
          difficulty: "easy",
          endedAtSecs: 50,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目三",
          questionId: "q3",
          reason: null,
          revision: 1,
          startedAtSecs: 41,
          status: "skipped",
        },
        {
          answerSummary: null,
          difficulty: "hard",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目四",
          questionId: "q4",
          reason: "time_limit",
          revision: 1,
          startedAtSecs: 51,
          status: "interrupted",
        },
        {
          answerSummary: null,
          difficulty: "hard",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目五",
          questionId: "q5",
          reason: "time_limit",
          revision: 1,
          startedAtSecs: 60,
          status: "unasked",
        },
      ],
      schemaVersion: 2,
    };
    const evaluation = {
      ...EVALUATION,
      questions: [
        { ...EVALUATION.questions[0], order: 1, question: "题目一", questionId: "q1", score: 8 },
        { ...EVALUATION.questions[0], order: 2, question: "题目二", questionId: "q2", score: 4 },
        { ...EVALUATION.questions[0], order: 3, question: "题目三", questionId: "q3", score: 7 },
        { ...EVALUATION.questions[0], order: 4, question: "题目四", questionId: "q4", score: 9 },
        { ...EVALUATION.questions[0], order: 5, question: "题目五", questionId: "q5", score: 9 },
      ],
    };

    const result = applyQuestionOutcomesToEvaluation(evaluation, outcomes);

    expect(result.overallScore).toBe(40);
    expect(result.questions.map((question) => question.score)).toEqual([8, 4, 0, null, null]);
    expect(result.questions[2]?.evidence).toEqual(evaluation.questions[2]?.evidence);
    expect(result.questions[3]?.evidence).toEqual(evaluation.questions[3]?.evidence);
    expect(result.questions[4]?.evidence).toEqual([]);
    expect(result.recommendation).toBe("建议进入下一轮");
  });

  it("forces a pending recommendation when fewer than half the required questions are scorable", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: "回答完整",
          difficulty: "easy",
          endedAtSecs: 20,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目一",
          questionId: "q1",
          reason: null,
          revision: 1,
          startedAtSecs: 1,
          status: "answered",
        },
        ...["q2", "q3"].map((questionId, index) => ({
          answerSummary: null,
          difficulty: "easy" as const,
          endedAtSecs: 30 + index,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: `题目${index + 2}`,
          questionId,
          reason: "time_limit" as const,
          revision: 1,
          startedAtSecs: 20 + index,
          status: "unasked" as const,
        })),
      ],
      schemaVersion: 2,
    };

    const result = applyQuestionOutcomesToEvaluation(
      {
        ...EVALUATION,
        questions: [
          { ...EVALUATION.questions[0], questionId: "q1" },
          { ...EVALUATION.questions[0], order: 2, questionId: "q2" },
          { ...EVALUATION.questions[0], order: 3, questionId: "q3" },
        ],
      },
      outcomes,
    );

    expect(result.overallScore).toBe(80);
    expect(result.recommendation).toBe("待定");
  });
});
