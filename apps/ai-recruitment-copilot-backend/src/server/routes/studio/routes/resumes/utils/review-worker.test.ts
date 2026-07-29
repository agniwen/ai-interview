import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateLegacyResumeReviewBestEffort: vi.fn(),
  generateResumeReviewBestEffort: vi.fn(),
  listAllJobDescriptions: vi.fn(),
  loadRecruitingJobDescriptionById: vi.fn(),
  matchJobDescriptionForResume: vi.fn(),
  record: null as null | Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => {
        const query = {
          where: () => ({
            limit: () => Promise.resolve(mocks.record ? [mocks.record] : []),
          }),
        };
        return {
          ...query,
          leftJoin: () => query,
        };
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => {
        mocks.updates.push(patch);
        if (mocks.record && "jobDescriptionId" in patch) {
          mocks.record.jobDescriptionId = patch.jobDescriptionId;
        }
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: "resume-1" }]) }),
        };
      },
    }),
  },
}));
vi.mock("./review-generation", () => ({
  generateLegacyResumeReviewBestEffort: mocks.generateLegacyResumeReviewBestEffort,
  generateResumeReviewBestEffort: mocks.generateResumeReviewBestEffort,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent", () => ({
  matchJobDescriptionForResume: mocks.matchJobDescriptionForResume,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({
    listRecruitingJobDescriptions: mocks.listAllJobDescriptions,
    loadRecruitingJobDescriptionById: mocks.loadRecruitingJobDescriptionById,
  }),
);

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { processResumeReviewGenerationJob } from "./review-worker";

const JOB = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  resumeRecordId: "resume-1",
  runId: "run-1",
  source: "resume_pool_import" as const,
};

function assessmentRecord(overrides: Record<string, unknown>) {
  return {
    evaluationMode: "legacy",
    jobDescriptionId: JOB.jobDescriptionId,
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeContentHash: "content-hash",
    resumeParseStatus: "ready",
    resumeProfile: { name: "候选人" },
    resumeReview: null,
    resumeReviewQueuedAt: new Date("2026-07-29T00:00:00.000Z"),
    resumeReviewRunId: JOB.runId,
    resumeScreeningResult: null,
    resumeText: "简历原文",
    structuredResumeEvaluation: null,
    ...overrides,
  };
}

describe("processResumeReviewGenerationJob", () => {
  beforeEach(() => {
    mocks.record = null;
    mocks.updates.length = 0;
    mocks.generateResumeReviewBestEffort.mockReset();
    mocks.generateLegacyResumeReviewBestEffort.mockReset();
    mocks.listAllJobDescriptions.mockReset();
    mocks.loadRecruitingJobDescriptionById.mockReset();
    mocks.loadRecruitingJobDescriptionById.mockResolvedValue({
      evaluationMode: "legacy",
      id: "jd-1",
    });
    mocks.matchJobDescriptionForResume.mockReset();
  });

  it("treats a previously generated review as an idempotent success", async () => {
    mocks.record = assessmentRecord({
      resumeReview: { overall: { baseScore: 85 } },
    });

    await processResumeReviewGenerationJob(JOB);

    expect(mocks.generateResumeReviewBestEffort).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
  });

  it("moves a new review through processing to ready", async () => {
    mocks.record = assessmentRecord({});
    mocks.generateResumeReviewBestEffort.mockResolvedValue({
      mode: "legacy",
      resumeReview: { overall: { baseScore: 85 } },
      review: "AI 分析",
      screeningResult: { recommendation: "pass" },
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

  it("force reassess regenerates even when a review already exists", async () => {
    mocks.record = assessmentRecord({
      resumeReview: { overall: { baseScore: 70 } },
      resumeScreeningResult: { recommendation: "flag" },
    });
    mocks.generateResumeReviewBestEffort.mockResolvedValue({
      mode: "legacy",
      resumeReview: { overall: { baseScore: 90 } },
      review: "重新评估结果",
      screeningResult: { recommendation: "pass" },
    });

    await processResumeReviewGenerationJob({
      ...JOB,
      force: true,
      reassessToken: "token-1",
      source: "reassess",
    });

    expect(mocks.generateResumeReviewBestEffort).toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(2);
    expect(mocks.updates[0]).toMatchObject({
      resumeReviewStatus: "processing",
      resumeScreeningStatus: "processing",
    });
    expect(mocks.updates[1]).toMatchObject({
      resumeReview: { overall: { baseScore: 90 } },
      resumeReviewStatus: "ready",
      resumeScreeningResult: { recommendation: "pass" },
      resumeScreeningStatus: "ready",
    });
  });

  it("generates a bound resume-pool review without changing parse readiness", async () => {
    mocks.record = {
      jobDescriptionId: "jd-1",
      resumeParseStatus: "ready",
      resumeProfile: { name: "人才库候选人" },
      resumeText: "人才库简历原文",
    };
    mocks.generateLegacyResumeReviewBestEffort.mockResolvedValue({
      resumeReview: { overall: { baseScore: 88 } },
      review: "人才库 AI 评价",
      screeningResult: { recommendation: "pass" },
    });

    await processResumeReviewGenerationJob({
      jobDescriptionId: "jd-1",
      organizationId: "org-1",
      poolItemId: "pool-1",
      source: "resume_pool_upload",
    });

    expect(mocks.generateLegacyResumeReviewBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        jobDescriptionId: "jd-1",
        resumeProfile: { name: "人才库候选人" },
      }),
    );
    expect(mocks.updates).toEqual([expect.objectContaining({ notes: "人才库 AI 评价" })]);
  });

  it("matches an automatic JD in the review worker after parse readiness", async () => {
    mocks.record = assessmentRecord({ jobDescriptionId: null });
    mocks.listAllJobDescriptions.mockResolvedValue([{ id: "jd-auto" }]);
    mocks.matchJobDescriptionForResume.mockResolvedValue({ jobDescriptionId: "jd-auto" });
    mocks.generateResumeReviewBestEffort.mockResolvedValue({
      mode: "legacy",
      resumeReview: { overall: { baseScore: 86 } },
      review: "自动岗位评价",
      screeningResult: { recommendation: "pass" },
    });

    await processResumeReviewGenerationJob({
      autoMatchJobDescription: true,
      jobDescriptionId: null,
      organizationId: "org-1",
      resumeRecordId: "resume-1",
      runId: "run-1",
      source: "resume_upload",
    });

    expect(mocks.matchJobDescriptionForResume).toHaveBeenCalled();
    expect(mocks.updates).toContainEqual(expect.objectContaining({ jobDescriptionId: "jd-auto" }));
    expect(mocks.generateResumeReviewBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({ jobDescriptionId: "jd-auto" }),
    );
  });
});
