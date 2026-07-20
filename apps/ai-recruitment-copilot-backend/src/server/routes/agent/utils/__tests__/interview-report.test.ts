import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";

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

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { formatCandidateFormSubmissions, generateInterviewReport } from "../interview-report";

const TRANSCRIPT: InterviewTranscriptTurn[] = [
  { message: "请介绍你的项目。", role: "agent", timeInCallSecs: 1 },
  { message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 },
];

const QUESTIONS: InterviewQuestion[] = [
  { difficulty: "easy", order: 1, question: "请介绍你的项目。" },
];

const EVALUATION = {
  hrEvaluation: {
    availability: "目前在职，预计一个月内到岗。",
    careerProgression: "上一家公司晋升一次，最近绩效为 A。",
    compensationExpectations: "目前年包 50 万，期望年包 60 万。",
    jobMotivation: "希望承担更完整的系统架构职责。",
    overseasTravel: "已婚，可接受每次两周以内的海外出差。",
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
        prompt: expect.stringContaining("当前求职状态：在职，一个月内到岗"),
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
});
