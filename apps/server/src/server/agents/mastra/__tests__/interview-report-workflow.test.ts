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

  it("uses a factual fallback without calling the summary model when no question collected candidate evidence", async () => {
    const generateSummary = vi.fn().mockResolvedValue("编造的候选人表现摘要");
    const generateEvaluation = vi.fn().mockRejectedValue(new Error("invalid structured output"));
    const composeReport = vi.fn(({ evaluationResult, summaryResult }) => ({
      evaluation: evaluationResult.status === "fulfilled" ? evaluationResult.value : null,
      evaluationError: evaluationResult.status === "rejected" ? evaluationResult.reason : undefined,
      summary: summaryResult.status === "fulfilled" ? summaryResult.value : null,
    }));
    const workflow = createInterviewReportWorkflow({
      composeReport,
      generateEvaluation,
      generateSummary,
    });

    const result = await runInterviewReportWorkflow(
      {
        candidateFormResponses: "",
        dataCollectionResults: {
          questions: [
            {
              answerSummary: null,
              difficulty: "easy",
              endedAtSecs: 8,
              evaluationFocus: null,
              followUpCount: 0,
              followUpDirections: null,
              question: "请介绍你自己。",
              questionId: "question-1",
              reason: "system_shutdown",
              revision: 1,
              startedAtSecs: 8,
              status: "unasked",
            },
          ],
          schemaVersion: 2,
        },
        questions: [
          {
            difficulty: "easy",
            order: 1,
            question: "请介绍你自己。",
            questionId: "question-1",
          },
        ],
        transcript: [{ message: "您好，候选人！在", role: "agent", timeInCallSecs: 0 }],
      },
      workflow,
    );

    expect(generateSummary).not.toHaveBeenCalled();
    expect(result.summary).toBe(
      "本次面试未收集到候选人的有效回答，无法基于对话记录评价其表现、能力、亮点或不足，请人工复核。",
    );
  });
});
