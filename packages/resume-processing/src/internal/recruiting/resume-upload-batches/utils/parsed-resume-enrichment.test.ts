import { describe, expect, it, vi } from "vitest";
import {
  completeParsedResumeEnrichment,
  defaultParsedResumeEnrichmentDependencies,
} from "./parsed-resume-enrichment";

const input = {
  autoMatchJobDescription: false,
  generationToken: "upload-item",
  jobDescriptionId: null,
  organizationId: "org",
  succeededPoolItemId: null,
  succeededRecordId: "record",
};

function dependencies() {
  return {
    ...defaultParsedResumeEnrichmentDependencies,
    enqueueResumeSemanticIndexJobBestEffort: vi.fn().mockResolvedValue(true),
    markParsedResumeRecordReady: vi.fn().mockResolvedValue(null),
    scheduleResumeEvaluationForRecord: vi.fn().mockResolvedValue({
      errorMessage: "No published job",
      status: "failed",
    }),
  };
}

describe("parsed resume enrichment", () => {
  it("finishes an explicitly unbound upload while still indexing its resume", async () => {
    const deps = dependencies();
    await expect(completeParsedResumeEnrichment(input, deps)).resolves.toBeUndefined();
    expect(deps.scheduleResumeEvaluationForRecord).not.toHaveBeenCalled();
    expect(deps.enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalledWith({
      organizationId: "org",
      sourceId: "record",
      sourceType: "studio_interview",
    });
  });

  it.each([
    { autoMatchJobDescription: false, jobDescriptionId: "job" },
    { autoMatchJobDescription: true, jobDescriptionId: null },
  ])("still requires evaluation scheduling when requested: %j", async (selection) => {
    const deps = dependencies();
    await expect(completeParsedResumeEnrichment({ ...input, ...selection }, deps)).rejects.toThrow(
      "简历后续分析任务入队失败。",
    );
    expect(deps.scheduleResumeEvaluationForRecord).toHaveBeenCalled();
  });
});
