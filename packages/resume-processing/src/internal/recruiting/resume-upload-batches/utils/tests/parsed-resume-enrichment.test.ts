import { describe, expect, it, vi } from "vitest";
import {
  completeParsedResumeEnrichment,
  defaultParsedResumeEnrichmentDependencies,
} from "../parsed-resume-enrichment";
import type { ResumeReviewSchedulingResult } from "../../../resumes/utils/review-queue";

const input = {
  autoMatchJobDescription: false,
  generationToken: "upload-item",
  jobDescriptionId: null,
  organizationId: "org",
  succeededPoolItemId: null,
  succeededRecordId: "record",
};

const enqueueFailure: ResumeReviewSchedulingResult = {
  errorMessage: "Redis unavailable",
  reason: "enqueue_failed",
  status: "failed",
};

function dependencies(scheduling: ResumeReviewSchedulingResult = enqueueFailure) {
  return {
    ...defaultParsedResumeEnrichmentDependencies,
    enqueueResumeSemanticIndexJobBestEffort: vi.fn().mockResolvedValue(true),
    markParsedResumeRecordReady: vi.fn().mockResolvedValue(null),
    scheduleResumeEvaluationForRecord: vi.fn().mockResolvedValue(scheduling),
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
  ])("fails with the queue error when evaluation enqueue fails: %j", async (selection) => {
    const deps = dependencies();
    await expect(completeParsedResumeEnrichment({ ...input, ...selection }, deps)).rejects.toThrow(
      "简历后续分析任务入队失败：AI 评估（Redis unavailable）。",
    );
    expect(deps.scheduleResumeEvaluationForRecord).toHaveBeenCalled();
  });

  it.each(["not_schedulable", "in_progress"] as const)(
    "finishes without retrying when evaluation scheduling is %s",
    async (reason) => {
      const deps = dependencies({ errorMessage: "skip", reason, status: "failed" });
      await expect(
        completeParsedResumeEnrichment(
          { ...input, autoMatchJobDescription: true, jobDescriptionId: null },
          deps,
        ),
      ).resolves.toBeUndefined();
      expect(deps.enqueueResumeSemanticIndexJobBestEffort).toHaveBeenCalled();
    },
  );

  it("names the semantic index when only indexing fails", async () => {
    const deps = dependencies({ runId: "run", status: "enqueued" });
    deps.enqueueResumeSemanticIndexJobBestEffort.mockResolvedValue(false);
    await expect(
      completeParsedResumeEnrichment({ ...input, jobDescriptionId: "job" }, deps),
    ).rejects.toThrow("简历后续分析任务入队失败：语义索引。");
  });
});
