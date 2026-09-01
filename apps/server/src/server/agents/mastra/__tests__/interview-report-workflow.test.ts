import { describe, expect, it, vi } from "vitest";
import {
  createInterviewReportWorkflow,
  runInterviewReportWorkflow,
} from "../workflows/interview-report-workflow";

describe("runInterviewReportWorkflow", () => {
  it("generates an interview report through the workflow runner", async () => {
    const generateSummary = vi.fn().mockResolvedValue("面试摘要");
    const generateEvaluation = vi.fn().mockResolvedValue({
      hrEvaluation: {
        availability: null,
        careerProgression: null,
        compensationExpectations: null,
        jobMotivation: null,
        overseasTravel: null,
        projectHighlights: null,
        recentWork: null,
      },
      overallAssessment: "候选人表达清晰。",
      overallScore: 82,
      questions: [],
      recommendation: "建议进入下一轮",
    });
    const composeReport = vi.fn().mockReturnValue({
      evaluation: { overallScore: 82 },
      summary: "面试摘要",
    });
    const workflow = createInterviewReportWorkflow({
      composeReport,
      generateEvaluation,
      generateSummary,
    });

    const result = await runInterviewReportWorkflow(
      {
        candidateFormResponses: "最快到岗时间：一个月内",
        dataCollectionResults: null,
        questions: [
          {
            difficulty: "easy",
            order: 1,
            question: "请介绍项目。",
            questionId: "question-1",
          },
        ],
        transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
      },
      workflow,
    );

    expect(generateSummary).toHaveBeenCalledWith({
      transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
    });
    expect(generateEvaluation).toHaveBeenCalledWith({
      candidateFormResponses: "最快到岗时间：一个月内",
      dataCollectionResults: null,
      questions: [
        {
          difficulty: "easy",
          order: 1,
          question: "请介绍项目。",
          questionId: "question-1",
        },
      ],
      transcript: [{ message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 }],
    });
    expect(result).toEqual({
      evaluation: { overallScore: 82 },
      summary: "面试摘要",
    });
  });
});
