import { beforeEach, describe, expect, it, vi } from "vitest";
import { processResumeReviewGenerationJob } from "./review-worker";
import type { ResumeReviewWorkerDependencies } from "./review-worker";

const JOB = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  resumeRecordId: "resume-1",
  runId: "run-1",
  source: "resume_pool_import" as const,
};

const mocks = {
  processResumePoolReviewGeneration:
    vi.fn<ResumeReviewWorkerDependencies["processResumePoolReviewGeneration"]>(),
  resolveRecordJobDescription:
    vi.fn<ResumeReviewWorkerDependencies["resolveRecordJobDescription"]>(),
  runAssessmentLifecycle: vi.fn<ResumeReviewWorkerDependencies["runAssessmentLifecycle"]>(),
};

const dependencies: ResumeReviewWorkerDependencies = mocks;

describe("processResumeReviewGenerationJob", () => {
  beforeEach(() => {
    mocks.processResumePoolReviewGeneration.mockReset();
    mocks.resolveRecordJobDescription.mockReset();
    mocks.runAssessmentLifecycle.mockReset();
    mocks.resolveRecordJobDescription.mockResolvedValue("jd-1");
    mocks.runAssessmentLifecycle.mockResolvedValue({ status: "ready" });
  });

  it("starts the assessment lifecycle with the resolved job binding", async () => {
    await processResumeReviewGenerationJob(JOB, dependencies);

    expect(mocks.resolveRecordJobDescription).toHaveBeenCalledWith(JOB);
    expect(mocks.runAssessmentLifecycle).toHaveBeenCalledWith(
      {
        expectedJobDescriptionId: "jd-1",
        expectedRunId: "run-1",
        force: false,
        organizationId: "org-1",
        resumeRecordId: "resume-1",
      },
      expect.any(Object),
    );
  });

  it("preserves the lifecycle result for an already-generated review", async () => {
    mocks.runAssessmentLifecycle.mockResolvedValue({ reason: "already_ready", status: "skipped" });

    await expect(processResumeReviewGenerationJob(JOB, dependencies)).resolves.toEqual({
      reason: "already_ready",
      status: "skipped",
    });
  });

  it("propagates lifecycle generation failures", async () => {
    mocks.runAssessmentLifecycle.mockRejectedValue(new Error("model unavailable"));

    await expect(processResumeReviewGenerationJob(JOB, dependencies)).rejects.toThrow(
      "model unavailable",
    );
  });

  it("forces reassess jobs", async () => {
    await processResumeReviewGenerationJob(
      {
        ...JOB,
        force: true,
        reassessToken: "token-1",
        source: "reassess",
      },
      dependencies,
    );

    expect(mocks.runAssessmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ force: true }),
      expect.any(Object),
    );
  });

  it("routes resume-pool uploads to the dedicated worker", async () => {
    await processResumeReviewGenerationJob(
      {
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        poolItemId: "pool-1",
        source: "resume_pool_upload",
      },
      dependencies,
    );

    expect(mocks.processResumePoolReviewGeneration).toHaveBeenCalledWith({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      poolItemId: "pool-1",
      source: "resume_pool_upload",
    });
    expect(mocks.runAssessmentLifecycle).not.toHaveBeenCalled();
  });

  it("uses the automatically matched JD for resume uploads", async () => {
    mocks.resolveRecordJobDescription.mockResolvedValue("jd-auto");

    await processResumeReviewGenerationJob(
      {
        autoMatchJobDescription: true,
        jobDescriptionId: null,
        organizationId: "org-1",
        resumeRecordId: "resume-1",
        runId: "run-1",
        source: "resume_upload",
      },
      dependencies,
    );

    expect(mocks.runAssessmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ expectedJobDescriptionId: "jd-auto" }),
      expect.any(Object),
    );
  });
});
