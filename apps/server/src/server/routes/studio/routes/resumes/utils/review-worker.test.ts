import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateResumePoolAssessment, processResumeReviewGenerationJob } from "./review-worker";
import type {
  ResumePoolAssessmentGenerationDependencies,
  ResumeReviewWorkerDependencies,
} from "./review-worker";

const JOB = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  resumeRecordId: "resume-1",
  runId: "run-1",
  source: "resume_pool_import" as const,
};

const mocks = {
  generateCandidateInterviewQuestions:
    vi.fn<ResumeReviewWorkerDependencies["generateCandidateInterviewQuestions"]>(),
  processResumePoolReviewGeneration:
    vi.fn<ResumeReviewWorkerDependencies["processResumePoolReviewGeneration"]>(),
  resolveRecordJobDescription:
    vi.fn<ResumeReviewWorkerDependencies["resolveRecordJobDescription"]>(),
  runAssessmentLifecycle: vi.fn<ResumeReviewWorkerDependencies["runAssessmentLifecycle"]>(),
};

const dependencies: ResumeReviewWorkerDependencies = mocks;

describe("processResumeReviewGenerationJob", () => {
  beforeEach(() => {
    mocks.generateCandidateInterviewQuestions.mockReset();
    mocks.processResumePoolReviewGeneration.mockReset();
    mocks.resolveRecordJobDescription.mockReset();
    mocks.runAssessmentLifecycle.mockReset();
    mocks.resolveRecordJobDescription.mockResolvedValue("jd-1");
    mocks.runAssessmentLifecycle.mockResolvedValue({ status: "ready" });
    mocks.generateCandidateInterviewQuestions.mockResolvedValue("generated");
  });

  it("starts the assessment lifecycle with the resolved job binding", async () => {
    await processResumeReviewGenerationJob(JOB, dependencies);

    expect(mocks.resolveRecordJobDescription).toHaveBeenCalledWith(JOB);
    expect(mocks.runAssessmentLifecycle).toHaveBeenCalledWith(
      {
        expectedJobDescriptionId: "jd-1",
        expectedRunId: "run-1",
        force: false,
        hasAttemptsRemaining: false,
        organizationId: "org-1",
        resumeRecordId: "resume-1",
      },
      expect.any(Object),
    );
  });

  it("keeps retryable queue failures out of the terminal lifecycle state", async () => {
    await processResumeReviewGenerationJob(JOB, dependencies, {
      hasAttemptsRemaining: true,
    });

    expect(mocks.runAssessmentLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ hasAttemptsRemaining: true }),
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

  it("routes resume-pool imports to asynchronous candidate question generation", async () => {
    await processResumeReviewGenerationJob(
      {
        organizationId: "org-1",
        resumeRecordId: "resume-1",
        source: "resume_pool_import_questions",
      },
      dependencies,
    );

    expect(mocks.generateCandidateInterviewQuestions).toHaveBeenCalledWith({
      organizationId: "org-1",
      resumeRecordId: "resume-1",
    });
    expect(mocks.resolveRecordJobDescription).not.toHaveBeenCalled();
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

describe("generateResumePoolAssessment", () => {
  it("uses the qualitative contract for a job-bound resume-pool item", async () => {
    const generateAssessment =
      vi.fn<ResumePoolAssessmentGenerationDependencies["generateAssessment"]>();
    // SAFETY: This stub only verifies contract routing; the production path parses the full
    // qualitative payload before persistence.
    generateAssessment.mockResolvedValue({
      evaluation: { schemaVersion: 2 } as never,
      jobDescriptionVersionId: "jd-version-1",
      mode: "qualitative",
    });

    // SAFETY: The generation stub does not inspect the profile body in this routing test.
    const resumeProfile = { name: "候选人" } as never;
    const assessment = await generateResumePoolAssessment(
      {
        evaluationAsOf: "2026-08-28",
        jobDescriptionId: "jd-1",
        jobDescriptionVersionId: "jd-version-1",
        organizationId: "org-1",
        resumeContentHash: "resume-hash",
        resumeInputHash: "input-hash",
        resumeProfile,
        resumeText: "候选人简历",
        runId: "run-1",
      },
      { generateAssessment },
    );

    expect(assessment?.mode).toBe("qualitative");
    expect(generateAssessment).toHaveBeenCalledWith(
      expect.objectContaining({ jobDescriptionVersionId: "jd-version-1" }),
    );
  });

  it("preserves the original generation failure for the queue error boundary", async () => {
    const generateAssessment =
      vi.fn<ResumePoolAssessmentGenerationDependencies["generateAssessment"]>();
    const providerError = Object.assign(new Error("response_format is not supported"), {
      statusCode: 400,
    });
    generateAssessment.mockRejectedValue(providerError);

    // SAFETY: The generation stub fails before inspecting the profile body.
    const resumeProfile = { name: "候选人" } as never;

    await expect(
      generateResumePoolAssessment(
        {
          evaluationAsOf: "2026-08-29",
          jobDescriptionId: "jd-1",
          jobDescriptionVersionId: "jd-version-1",
          organizationId: "org-1",
          resumeContentHash: "resume-hash",
          resumeInputHash: "input-hash",
          resumeProfile,
          resumeText: "候选人简历",
          runId: "run-1",
        },
        { generateAssessment },
      ),
    ).rejects.toBe(providerError);
  });
});
