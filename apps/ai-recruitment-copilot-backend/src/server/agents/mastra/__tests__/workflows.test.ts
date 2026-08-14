import { describe, expect, it, vi } from "vitest";

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/processor",
  () => ({ processBatchItem: vi.fn() }),
);

vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  buildHardFilterRejectReview: vi.fn(),
  composeResumeReviewResult: vi.fn(),
  generateInterviewQuestionsForProfile: vi.fn(),
  generateResumeQualitativeReview: vi.fn(),
  generateResumeReviewScoring: vi.fn(),
  parseResumeBytesToProfile: vi.fn(),
  runResumeReviewHardFilter: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for correct hoisting
import { recruitmentWorkflows } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows";

function stepIds(workflow: { serializedStepGraph: unknown[] }) {
  const ids: string[] = [];
  const visit = (entries: unknown[]) => {
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null || !("type" in entry)) {
        continue;
      }
      if (entry.type === "step" && "step" in entry) {
        ids.push((entry as { step: { id: string } }).step.id);
      }
      if (entry.type === "parallel" && "steps" in entry && Array.isArray(entry.steps)) {
        visit(entry.steps);
      }
    }
  };
  visit(workflow.serializedStepGraph);
  return ids;
}

function parallelStepIds(workflow: { serializedStepGraph: unknown[] }) {
  return workflow.serializedStepGraph
    .filter(
      (entry): entry is { steps: { step: { id: string }; type: "step" }[]; type: "parallel" } =>
        typeof entry === "object" &&
        entry !== null &&
        "type" in entry &&
        entry.type === "parallel" &&
        "steps" in entry &&
        Array.isArray(entry.steps),
    )
    .map((entry) => entry.steps.map((stepEntry) => stepEntry.step.id));
}

describe("Mastra recruitment workflows", () => {
  it("registers the non-chat workflows with stable ids", () => {
    expect(Object.keys(recruitmentWorkflows).toSorted()).toEqual([
      "bulkResumeUploadWorkflow",
      "interviewQuestionsWorkflow",
      "interviewReportWorkflow",
      "resumeAnalysisWorkflow",
      "resumeParseWorkflow",
      "resumeReviewWorkflow",
      "structuredResumeReviewWorkflow",
    ]);
  });

  it("models resume parsing as hash, text extraction, structuring, and composition", () => {
    expect(recruitmentWorkflows.resumeParseWorkflow.id).toBe("resume-parse-workflow");
    expect(stepIds(recruitmentWorkflows.resumeParseWorkflow)).toEqual([
      "hash-resume",
      "extract-resume-text",
      "structure-resume",
      "compose-resume-parse-result",
    ]);
  });

  it("models resume analysis as parse then question generation", () => {
    expect(recruitmentWorkflows.resumeAnalysisWorkflow.id).toBe("resume-analysis-workflow");
    expect(stepIds(recruitmentWorkflows.resumeAnalysisWorkflow)).toEqual([
      "run-resume-parse-workflow",
      "generate-interview-questions",
    ]);
  });

  it("models interview question generation as a standalone workflow", () => {
    expect(recruitmentWorkflows.interviewQuestionsWorkflow.id).toBe("interview-questions-workflow");
    expect(stepIds(recruitmentWorkflows.interviewQuestionsWorkflow)).toEqual([
      "generate-interview-questions",
    ]);
  });

  it("models resume review as explicit hard filter, review, scoring, and composition steps", () => {
    expect(recruitmentWorkflows.resumeReviewWorkflow.id).toBe("resume-review-workflow");
    expect(stepIds(recruitmentWorkflows.resumeReviewWorkflow)).toEqual([
      "qualitative-review",
      "scoring",
      "compose-review",
    ]);
  });

  it("models interview reporting as explicit load, summary, evaluation, and composition steps", () => {
    expect(recruitmentWorkflows.interviewReportWorkflow.id).toBe("interview-report-workflow");
    expect(stepIds(recruitmentWorkflows.interviewReportWorkflow)).toEqual([
      "load-interview-conversation",
      "summary",
      "evaluation",
      "compose-interview-report",
    ]);
    expect(parallelStepIds(recruitmentWorkflows.interviewReportWorkflow)).toContainEqual([
      "summary",
      "evaluation",
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
