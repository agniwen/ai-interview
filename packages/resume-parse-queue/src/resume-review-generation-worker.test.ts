import { afterEach, describe, expect, it, vi } from "vitest";
import { createResumeReviewGenerationWorkerLogHandlers } from "./resume-review-generation";
import type { ResumeReviewGenerationJobData } from "./resume-review-generation";

describe("resume review generation worker logs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the complete job lifecycle with traceable identifiers", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const handlers = createResumeReviewGenerationWorkerLogHandlers();
    expect(Object.keys(handlers)).toEqual(["active", "completed", "error", "failed", "ready"]);

    const data: ResumeReviewGenerationJobData = {
      jobDescriptionId: "job-1",
      organizationId: "org-1",
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "reassess",
    };
    const job = {
      attemptsMade: 1,
      data,
      finishedOn: 1250,
      id: "queue-job-1",
      processedOn: 1000,
    };
    const jobError = new Error("model failed");
    const workerError = new Error("redis failed");

    handlers.active(job);
    handlers.completed(job);
    handlers.failed(job, jobError);
    handlers.error(workerError);

    const context = {
      attemptsMade: 1,
      jobDescriptionId: "job-1",
      jobId: "queue-job-1",
      organizationId: "org-1",
      poolItemId: undefined,
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "reassess",
    };
    expect(info).toHaveBeenCalledWith("[resume-review-generation-worker] job active", context);
    expect(info).toHaveBeenCalledWith("[resume-review-generation-worker] job completed", {
      ...context,
      durationMs: 250,
    });
    expect(error).toHaveBeenCalledWith("[resume-review-generation-worker] job failed", {
      ...context,
      error: jobError,
    });
    expect(error).toHaveBeenCalledWith(
      "[resume-review-generation-worker] worker error",
      workerError,
    );
  });
});
