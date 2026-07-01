import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  composeInterviewReport: vi.fn(),
  generateInterviewEvaluation: vi.fn(),
  generateInterviewSummary: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report", () => ({
  composeInterviewReport: mocks.composeInterviewReport,
  generateInterviewEvaluation: mocks.generateInterviewEvaluation,
  generateInterviewSummary: mocks.generateInterviewSummary,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { runInterviewReportWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/interview-report-workflow";

describe("runInterviewReportWorkflow", () => {
  it("generates an interview report through the workflow runner", async () => {
    mocks.generateInterviewSummary.mockResolvedValue("面试摘要");
    mocks.generateInterviewEvaluation.mockResolvedValue({
      overallAssessment: "候选人表达清晰。",
      overallScore: 82,
      questions: [],
      recommendation: "建议进入下一轮",
    });
    mocks.composeInterviewReport.mockReturnValue({
      evaluation: { overallScore: 82 },
      summary: "面试摘要",
    });

    const result = await runInterviewReportWorkflow({
      questions: [{ difficulty: "easy", order: 1, question: "请介绍项目。" }],
      transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
    });

    expect(mocks.generateInterviewSummary).toHaveBeenCalledWith({
      transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
    });
    expect(mocks.generateInterviewEvaluation).toHaveBeenCalledWith({
      questions: [{ difficulty: "easy", order: 1, question: "请介绍项目。" }],
      transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
    });
    expect(result).toEqual({
      evaluation: { overallScore: 82 },
      summary: "面试摘要",
    });
  });
});
