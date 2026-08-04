import { describe, expect, it } from "vitest";
import {
  buildResumeReviewGenerationJobId,
  getResumeReviewGenerationQueueOverview,
  resolveResumeReviewGenerationWorkerConcurrency,
  resumeReviewGenerationJobSchema,
} from "./resume-review-generation";

describe("resume review generation queue", () => {
  it("validates resume review generation jobs", () => {
    expect(
      resumeReviewGenerationJobSchema.parse({
        autoMatchJobDescription: true,
        jobDescriptionId: null,
        organizationId: "org-1",
        poolItemId: "pool-2",
        source: "resume_pool_upload",
      }),
    ).toMatchObject({
      autoMatchJobDescription: true,
      jobDescriptionId: null,
      poolItemId: "pool-2",
      source: "resume_pool_upload",
    });
    expect(
      resumeReviewGenerationJobSchema.parse({
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        poolItemId: "pool-1",
        resumeRecordId: "resume-1",
        runId: "run-1",
        source: "resume_pool_import",
      }),
    ).toEqual({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      poolItemId: "pool-1",
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "resume_pool_import",
    });
  });

  it("validates reassess jobs with force and reassess token", () => {
    expect(
      resumeReviewGenerationJobSchema.parse({
        force: true,
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        reassessToken: "token-1",
        resumeRecordId: "resume-1",
        runId: "run-1",
        source: "reassess",
      }),
    ).toEqual({
      force: true,
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      reassessToken: "token-1",
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "reassess",
    });
  });

  it("validates upload jobs for resume library and resume pool targets", () => {
    expect(
      resumeReviewGenerationJobSchema.parse({
        jobDescriptionId: null,
        organizationId: "org-1",
        resumeRecordId: "resume-1",
        runId: "run-1",
        source: "resume_upload",
      }),
    ).toMatchObject({
      jobDescriptionId: null,
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "resume_upload",
    });
    expect(
      resumeReviewGenerationJobSchema.parse({
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        poolItemId: "pool-1",
        source: "resume_pool_upload",
      }),
    ).toMatchObject({
      jobDescriptionId: "jd-1",
      poolItemId: "pool-1",
      source: "resume_pool_upload",
    });
  });

  it("builds stable BullMQ-compatible job ids", () => {
    expect(
      buildResumeReviewGenerationJobId({
        jobDescriptionId: null,
        poolItemId: "pool:2",
        source: "resume_pool_upload",
      }),
    ).toBe("resume-pool-review-pool-2-no-jd");
    expect(
      buildResumeReviewGenerationJobId({
        jobDescriptionId: "jd:1",
        resumeRecordId: "resume:1",
      }),
    ).toBe("resume-review-resume-1-jd-1");
  });

  it("builds one stable upload job id per parsed target", () => {
    expect(
      buildResumeReviewGenerationJobId({
        jobDescriptionId: null,
        resumeRecordId: "resume:1",
        source: "resume_upload",
      }),
    ).toBe("resume-review-resume-1-no-jd");
    expect(
      buildResumeReviewGenerationJobId({
        jobDescriptionId: "jd:1",
        poolItemId: "pool:1",
        source: "resume_pool_upload",
      }),
    ).toBe("resume-pool-review-pool-1-jd-1");
  });

  it("builds one upload job id per parse generation", () => {
    expect(
      buildResumeReviewGenerationJobId({
        generationToken: "item:1",
        jobDescriptionId: null,
        resumeRecordId: "resume:1",
        source: "resume_upload",
      }),
    ).toBe("resume-review-resume-1-no-jd-parse-item-1");
    expect(
      buildResumeReviewGenerationJobId({
        generationToken: "item:1",
        jobDescriptionId: "jd:1",
        poolItemId: "pool:1",
        source: "resume_pool_upload",
      }),
    ).toBe("resume-pool-review-pool-1-jd-1-parse-item-1");
  });

  it("builds unique reassess job ids", () => {
    expect(
      buildResumeReviewGenerationJobId({
        force: true,
        jobDescriptionId: "jd:1",
        reassessToken: "token:1",
        resumeRecordId: "resume:1",
      }),
    ).toBe("resume-review-resume-1-jd-1-reassess-token-1");
  });

  it("defaults review concurrency to 16 unless explicitly configured", () => {
    expect(resolveResumeReviewGenerationWorkerConcurrency({})).toBe(16);
    expect(
      resolveResumeReviewGenerationWorkerConcurrency({
        RESUME_PARSE_WORKER_CONCURRENCY: "4",
      }),
    ).toBe(16);
    expect(
      resolveResumeReviewGenerationWorkerConcurrency({
        RESUME_PARSE_WORKER_CONCURRENCY: "4",
        RESUME_REVIEW_GENERATION_WORKER_CONCURRENCY: "3",
      }),
    ).toBe(3);
  });

  it("returns an empty overview when Redis is not configured", async () => {
    const overview = await getResumeReviewGenerationQueueOverview({});

    expect(overview).toMatchObject({
      counts: {
        active: 0,
        completed: 0,
        delayed: 0,
        failed: 0,
        paused: 0,
        prioritized: 0,
        waiting: 0,
        "waiting-children": 0,
      },
      displayName: "AI分析",
      name: "resume-review-generation",
      redis: null,
      workers: [],
      workersCount: 0,
    });
  });
});
