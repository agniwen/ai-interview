import { beforeEach, describe, expect, it, vi } from "vitest";

// oxlint-disable promise/prefer-await-to-callbacks -- the fake transaction executes Drizzle's callback API.

const mocks = vi.hoisted(() => ({
  claimJob: null as null | {
    evaluationMode: "legacy" | "structured";
    id: string;
    lifecycleStatus: "draft" | "published";
  },
  enqueue: vi.fn(),
  job: null as null | { evaluationMode: "legacy" | "structured"; id: string },
  queueConfigured: true,
  record: null as null | Record<string, unknown>,
  updates: [] as Record<string, unknown>[],
}));

function updateBuilder() {
  return {
    set: (patch: Record<string, unknown>) => {
      mocks.updates.push(patch);
      return {
        where: () => ({
          returning: () =>
            Promise.resolve(
              "jobDescriptionId" in patch
                ? [{ jobDescriptionId: patch.jobDescriptionId }]
                : [{ id: "resume-1" }],
            ),
        }),
      };
    },
  };
}

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(mocks.record ? [mocks.record] : []),
        }),
      }),
    }),
    transaction: (callback: (tx: unknown) => unknown) =>
      callback({
        select: () => ({
          from: () => ({
            where: () => ({
              limit: () => ({
                for: () => Promise.resolve(mocks.claimJob ? [mocks.claimJob] : []),
              }),
            }),
          }),
        }),
        update: updateBuilder,
      }),
    update: updateBuilder,
  },
}));
vi.mock("@arc/resume-parse-queue/resume-review-generation", () => ({
  enqueueResumeReviewGenerationJobs: mocks.enqueue,
  isResumeReviewGenerationQueueConfigured: () => mocks.queueConfigured,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({
    listRecruitingJobDescriptions: vi.fn().mockResolvedValue([]),
    loadRecruitingJobDescriptionById: () => Promise.resolve(mocks.job),
  }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent", () => ({
  matchJobDescriptionForResume: vi.fn(),
}));

// oxlint-disable-next-line import/first -- mocks must be installed before module import.
import { scheduleResumeEvaluationForRecord } from "./review-queue";

const PROFILE = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [],
  workYears: null,
};

function setContext(mode: "legacy" | "structured") {
  mocks.job = { evaluationMode: mode, id: "jd-1" };
  mocks.claimJob = { evaluationMode: mode, id: "jd-1", lifecycleStatus: "published" };
  mocks.record = {
    jobDescriptionId: "jd-1",
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeEvaluationArtifactMode: null,
    resumeEvaluationAttemptMode: null,
    resumeParseStatus: "ready",
    resumeProfile: PROFILE,
    resumeReview: null,
    resumeReviewStatus: "idle",
    structuredCompositeScore: null,
    structuredGateSortRank: null,
    structuredGateStatus: null,
    structuredResumeEvaluation: null,
    structuredScoreGrade: null,
  };
}

const INPUT = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  resumeRecordId: "resume-1",
  source: "resume_upload" as const,
};

describe("scheduleResumeEvaluationForRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueConfigured = true;
    mocks.updates.length = 0;
    setContext("structured");
  });

  it("persists one run identity and carries it in the queue payload", async () => {
    const result = await scheduleResumeEvaluationForRecord(INPUT);
    expect(result.status).toBe("enqueued");
    const [queuedPatch] = mocks.updates;
    expect(queuedPatch).toMatchObject({
      resumeReviewStatus: "queued",
    });
    expect(queuedPatch).not.toHaveProperty("resumeScreeningStatus");
    expect(mocks.enqueue).toHaveBeenCalledWith([
      expect.objectContaining({
        runId: queuedPatch?.resumeReviewRunId,
      }),
    ]);
  });

  it("uses the same persisted run for the in-process fallback", async () => {
    mocks.queueConfigured = false;
    const result = await scheduleResumeEvaluationForRecord(INPUT);
    expect(result).toEqual({
      runId: mocks.updates[0]?.resumeReviewRunId,
      status: "fallback_sync",
    });
  });

  it("does not automatically replace a persisted legacy artifact after the job upgrades", async () => {
    mocks.record = {
      ...mocks.record,
      resumeEvaluationArtifactMode: "legacy",
      resumeReview: { overall: { baseScore: 82 } },
    };

    await expect(scheduleResumeEvaluationForRecord(INPUT)).resolves.toEqual({
      status: "already_current",
    });
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("keeps legacy screening lifecycle behavior", async () => {
    setContext("legacy");
    await scheduleResumeEvaluationForRecord(INPUT);
    expect(mocks.updates[0]).toMatchObject({
      resumeScreeningError: null,
      resumeScreeningStatus: "processing",
    });
  });

  it("marks a structured enqueue failure without touching legacy screening fields", async () => {
    mocks.enqueue.mockRejectedValueOnce(new Error("redis unavailable"));
    const result = await scheduleResumeEvaluationForRecord(INPUT);
    expect(result.status).toBe("failed");
    expect(mocks.updates[1]).toMatchObject({
      resumeReviewError: "redis unavailable",
      resumeReviewStatus: "failed",
    });
    expect(mocks.updates[1]).not.toHaveProperty("resumeScreeningStatus");
  });

  it("rejects an unpublished or stale job before writing queue state", async () => {
    mocks.job = null;
    const result = await scheduleResumeEvaluationForRecord(INPUT);
    expect(result.status).toBe("failed");
    expect(mocks.updates).toHaveLength(0);
  });

  it("does not persist or enqueue a legacy run after the job upgrades", async () => {
    setContext("legacy");
    mocks.claimJob = {
      evaluationMode: "structured",
      id: "jd-1",
      lifecycleStatus: "published",
    };

    const result = await scheduleResumeEvaluationForRecord(INPUT);

    expect(result.status).toBe("failed");
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });
});
