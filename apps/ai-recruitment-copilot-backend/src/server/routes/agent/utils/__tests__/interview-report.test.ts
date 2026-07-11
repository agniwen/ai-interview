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
import { generateInterviewReport } from "../interview-report";

const TRANSCRIPT: InterviewTranscriptTurn[] = [
  { message: "请介绍你的项目。", role: "agent", timeInCallSecs: 1 },
  { message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 },
];

const QUESTIONS: InterviewQuestion[] = [
  { difficulty: "easy", order: 1, question: "请介绍你的项目。" },
];

const EVALUATION = {
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
      generateInterviewReport({ questions: QUESTIONS, transcript: [] }),
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
      generateInterviewReport({ questions: QUESTIONS, transcript: TRANSCRIPT }),
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
        schema: expect.any(Object),
        temperature: 0,
      }),
    );
  });

  it("preserves partial success when evaluation fails", async () => {
    mocks.generateTextWithMastraAgent.mockResolvedValue("摘要");
    mocks.generateStructuredWithMastraAgent.mockRejectedValue(new Error("evaluation failed"));

    await expect(
      generateInterviewReport({ questions: QUESTIONS, transcript: TRANSCRIPT }),
    ).resolves.toEqual({
      evaluation: null,
      evaluationError: "evaluation failed",
      summary: "摘要",
    });
  });
});
