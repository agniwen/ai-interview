import { describe, expect, it } from "vitest";
import { recruitmentWorkflows } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows";

function stepIds(workflow: { serializedStepGraph: unknown[] }) {
  return workflow.serializedStepGraph
    .filter(
      (entry): entry is { step: { id: string }; type: "step" } =>
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        entry.type === "step" &&
        "step" in entry,
    )
    .map((entry) => entry.step.id);
}

describe("Mastra recruitment workflows", () => {
  it("registers the non-chat workflows with stable ids", () => {
    expect(Object.keys(recruitmentWorkflows).toSorted()).toEqual([
      "bulkResumeUploadWorkflow",
      "interviewReportWorkflow",
      "resumeAnalysisWorkflow",
      "resumeReviewWorkflow",
    ]);
  });

  it("models resume analysis as parse then question generation", () => {
    expect(recruitmentWorkflows.resumeAnalysisWorkflow.id).toBe("resume-analysis-workflow");
    expect(stepIds(recruitmentWorkflows.resumeAnalysisWorkflow)).toEqual([
      "parse-resume-profile",
      "generate-interview-questions",
    ]);
  });

  it("models bulk upload as one claimed-item processing workflow", () => {
    expect(recruitmentWorkflows.bulkResumeUploadWorkflow.id).toBe(
      "bulk-resume-upload-item-workflow",
    );
    expect(stepIds(recruitmentWorkflows.bulkResumeUploadWorkflow)).toEqual([
      "process-bulk-upload-item",
    ]);
  });
});
