import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateResumeReviewBestEffort: vi.fn(),
  record: null as null | Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.record ? [mocks.record] : []),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        mocks.updates.push(patch);
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: "resume-1" }]) }),
        };
      },
    }),
  },
}));
vi.mock("./review-generation", () => ({
  generateResumeReviewBestEffort: mocks.generateResumeReviewBestEffort,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { processResumeReviewGenerationJob } from "./review-worker";

const JOB = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  resumeRecordId: "resume-1",
  source: "resume_pool_import" as const,
};

function assessmentRecord(overrides: Record<string, unknown>) {
  return {
    jobDescriptionId: JOB.jobDescriptionId,
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeParseStatus: "ready",
    resumeProfile: { name: "候选人" },
    resumeReview: null,
    resumeScreeningResult: null,
    resumeText: "简历原文",
    ...overrides,
  };
}

describe("processResumeReviewGenerationJob", () => {
  beforeEach(() => {
    mocks.record = null;
    mocks.updates.length = 0;
    mocks.generateResumeReviewBestEffort.mockReset();
  });

  it("treats a previously generated review as an idempotent success", async () => {
    mocks.record = assessmentRecord({
      resumeReview: { overall: { baseScore: 85 } },
    });

    await processResumeReviewGenerationJob(JOB);

    expect(mocks.generateResumeReviewBestEffort).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      resumeReviewError: null,
      resumeReviewStatus: "ready",
      resumeScreeningError: null,
      resumeScreeningStatus: "idle",
    });
  });

  it("moves a new review through processing to ready", async () => {
    mocks.record = assessmentRecord({});
    mocks.generateResumeReviewBestEffort.mockResolvedValue({
      review: "AI 分析",
      screeningResult: { recommendation: "pass" },
      structuredReview: { overall: { baseScore: 85 } },
    });

    await processResumeReviewGenerationJob(JOB);

    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates[0]).toMatchObject({
      resumeReviewStatus: "processing",
      resumeScreeningStatus: "processing",
    });
    expect(mocks.updates[1]).toMatchObject({
      resumeReview: { overall: { baseScore: 85 } },
      resumeReviewStatus: "ready",
      resumeScreeningResult: { recommendation: "pass" },
      resumeScreeningStatus: "ready",
    });
  });

  it("marks the record failed and rethrows a generation failure", async () => {
    mocks.record = assessmentRecord({
      resumeText: null,
    });
    mocks.generateResumeReviewBestEffort.mockRejectedValue(new Error("model unavailable"));

    await expect(processResumeReviewGenerationJob(JOB)).rejects.toThrow("model unavailable");

    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates[1]).toMatchObject({
      resumeReviewError: "model unavailable",
      resumeReviewStatus: "failed",
      resumeScreeningError: "model unavailable",
      resumeScreeningStatus: "failed",
    });
  });
});
