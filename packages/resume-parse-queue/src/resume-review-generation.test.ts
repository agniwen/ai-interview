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
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        poolItemId: "pool-1",
        resumeRecordId: "resume-1",
        source: "resume_pool_import",
      }),
    ).toEqual({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      poolItemId: "pool-1",
      resumeRecordId: "resume-1",
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
        source: "reassess",
      }),
    ).toEqual({
      force: true,
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      reassessToken: "token-1",
      resumeRecordId: "resume-1",
      source: "reassess",
    });
  });

  it("builds stable BullMQ-compatible job ids", () => {
    expect(
      buildResumeReviewGenerationJobId({
        jobDescriptionId: "jd:1",
        resumeRecordId: "resume:1",
      }),
    ).toBe("resume-review-resume-1-jd-1");
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

  it("defaults review worker concurrency to 9", () => {
    expect(resolveResumeReviewGenerationWorkerConcurrency({})).toBe(9);
    expect(
      resolveResumeReviewGenerationWorkerConcurrency({
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
