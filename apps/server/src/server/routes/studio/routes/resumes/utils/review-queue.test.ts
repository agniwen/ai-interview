import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ResumeEvaluationRecord,
  ResumeEvaluationSchedulingContext,
  ResumeEvaluationSchedulingDependencies,
} from "./review-queue";
import { scheduleResumeEvaluationForRecord } from "./review-queue";

interface ReviewEvaluationUpdate {
  jobDescriptionId?: string;
  resumeReviewError?: string | null;
  resumeReviewRunId?: string;
  resumeReviewStatus?: string;
  resumeScreeningError?: string | null;
  resumeScreeningStatus?: string;
}

const mocks = {
  // SAFETY: The fixture state is intentionally absent until each test calls setContext.
  claimJob: null as null | {
    evaluationMode: "legacy" | "qualitative" | "structured";
    id: string;
    lifecycleStatus: "draft" | "published";
  },
  // SAFETY: The fixture state is intentionally absent until each test calls setContext.
  context: null as null | ResumeEvaluationSchedulingContext,
  enqueueReviewJobs: vi.fn<ResumeEvaluationSchedulingDependencies["enqueueReviewJobs"]>(),
  // SAFETY: The fixture state is intentionally absent until each test calls setContext.
  isQueueConfigured: vi.fn<ResumeEvaluationSchedulingDependencies["isQueueConfigured"]>(),
  loadSchedulingContext: vi.fn<ResumeEvaluationSchedulingDependencies["loadSchedulingContext"]>(),
  markQueueFailure: vi.fn<ResumeEvaluationSchedulingDependencies["markQueueFailure"]>(),
  persistQueuedRun: vi.fn<ResumeEvaluationSchedulingDependencies["persistQueuedRun"]>(),
  queueConfigured: true,
  // SAFETY: Every recorded patch is built with the exact fields asserted by this test suite.
  updates: [] as ReviewEvaluationUpdate[],
};

const dependencies: ResumeEvaluationSchedulingDependencies = {
  enqueueReviewJobs: mocks.enqueueReviewJobs,
  isQueueConfigured: mocks.isQueueConfigured,
  loadSchedulingContext: mocks.loadSchedulingContext,
  markQueueFailure: mocks.markQueueFailure,
  persistQueuedRun: mocks.persistQueuedRun,
};

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

const dimension = {
  basis: "job" as const,
  evaluation: "候选人事实与岗位要求一致。",
  level: "recommended" as const,
};
const qualitativeEvaluation = {
  conciseOverall: "候选人的核心经验与岗位要求匹配，建议进入下一轮。",
  detailedOverall: {
    judgment: "整体匹配。",
    matchingEvidence: "有相关项目经验。",
    risks: "需确认项目规模。",
  },
  dimensions: {
    educationBackground: dimension,
    experienceRelevance: dimension,
    potential: dimension,
    projectMatch: dimension,
    skillMatch: dimension,
    stability: dimension,
  },
  recommendationLevel: "recommended" as const,
  schemaVersion: 2 as const,
  seniorityRecommendation: null,
  teamPositioning: null,
};

function setContext(mode: "legacy" | "qualitative" | "structured") {
  mocks.claimJob = { evaluationMode: mode, id: "jd-1", lifecycleStatus: "published" };
  const record: ResumeEvaluationRecord = {
    jobDescriptionId: "jd-1",
    outcome: "in_pipeline",
    pipelineStage: "screening",
    qualitativeResumeEvaluation: null,
    resumeEvaluationArtifactMode: null,
    resumeEvaluationAttemptMode: null,
    resumeFileName: "resume.pdf",
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
  mocks.context = {
    job: { ...mocks.claimJob },
    record: { ...record, jobDescriptionId: "jd-1" },
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
    mocks.loadSchedulingContext.mockImplementation(() => Promise.resolve(mocks.context));
    mocks.isQueueConfigured.mockImplementation(() => mocks.queueConfigured);
    mocks.persistQueuedRun.mockImplementation((input) => {
      if (!mocks.claimJob || mocks.claimJob.lifecycleStatus !== "published") {
        return Promise.resolve(false);
      }
      const update: ReviewEvaluationUpdate = {
        resumeReviewRunId: input.runId,
        resumeReviewStatus: "queued",
      };
      mocks.updates.push(update);
      return Promise.resolve(true);
    });
    mocks.markQueueFailure.mockImplementation((input) => {
      const update: ReviewEvaluationUpdate = {
        resumeReviewError: input.errorMessage,
        resumeReviewStatus: "failed",
      };
      mocks.updates.push(update);
      return Promise.resolve();
    });
  });

  it("persists one run identity and carries it in the queue payload", async () => {
    const result = await scheduleResumeEvaluationForRecord(INPUT, dependencies);
    expect(result.status).toBe("enqueued");
    const [queuedPatch] = mocks.updates;
    expect(queuedPatch).toMatchObject({
      resumeReviewStatus: "queued",
    });
    expect(queuedPatch).not.toHaveProperty("resumeScreeningStatus");
    expect(mocks.enqueueReviewJobs).toHaveBeenCalledWith([
      expect.objectContaining({
        runId: queuedPatch?.resumeReviewRunId,
      }),
    ]);
  });

  it("uses the same persisted run for the in-process fallback", async () => {
    mocks.queueConfigured = false;
    const result = await scheduleResumeEvaluationForRecord(INPUT, dependencies);
    expect(result).toEqual({
      runId: mocks.updates[0]?.resumeReviewRunId,
      status: "fallback_sync",
    });
  });

  it("does not automatically replace a persisted legacy artifact after the job upgrades", async () => {
    const { context } = mocks;
    if (!context) {
      throw new Error("Test context was not initialized.");
    }
    mocks.context = {
      ...context,
      record: {
        ...context.record,
        resumeEvaluationArtifactMode: "legacy",
        resumeReview: { overall: { baseScore: 82 } },
      },
    };

    await expect(scheduleResumeEvaluationForRecord(INPUT, dependencies)).resolves.toEqual({
      status: "already_current",
    });
    expect(mocks.updates).toHaveLength(0);
    expect(mocks.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("does not enqueue a second evaluation after a same-job pool result is imported", async () => {
    const { context } = mocks;
    if (!context) {
      throw new Error("Test context was not initialized.");
    }
    mocks.context = {
      ...context,
      record: {
        ...context.record,
        qualitativeResumeEvaluation: qualitativeEvaluation,
        resumeEvaluationArtifactMode: "qualitative",
        resumeEvaluationAttemptMode: "qualitative",
      },
    };

    await expect(scheduleResumeEvaluationForRecord(INPUT, dependencies)).resolves.toEqual({
      status: "already_current",
    });
    expect(mocks.persistQueuedRun).not.toHaveBeenCalled();
    expect(mocks.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("uses the qualitative contract even for an existing legacy job", async () => {
    setContext("legacy");
    await scheduleResumeEvaluationForRecord(INPUT, dependencies);
    expect(mocks.persistQueuedRun).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "qualitative" }),
    );
    expect(mocks.updates[0]).not.toHaveProperty("resumeScreeningStatus");
  });

  it("marks a structured enqueue failure without touching legacy screening fields", async () => {
    mocks.enqueueReviewJobs.mockRejectedValueOnce(new Error("redis unavailable"));
    const result = await scheduleResumeEvaluationForRecord(INPUT, dependencies);
    expect(result.status).toBe("failed");
    expect(mocks.updates[1]).toMatchObject({
      resumeReviewError: "redis unavailable",
      resumeReviewStatus: "failed",
    });
    expect(mocks.updates[1]).not.toHaveProperty("resumeScreeningStatus");
  });

  it("rejects an unpublished or stale job before writing queue state", async () => {
    mocks.context = null;
    const result = await scheduleResumeEvaluationForRecord(INPUT, dependencies);
    expect(result.status).toBe("failed");
    expect(mocks.updates).toHaveLength(0);
  });

  it("continues with a qualitative run when an old job mode changes before persistence", async () => {
    setContext("legacy");
    mocks.claimJob = {
      evaluationMode: "structured",
      id: "jd-1",
      lifecycleStatus: "published",
    };

    const result = await scheduleResumeEvaluationForRecord(INPUT, dependencies);

    expect(result.status).toBe("enqueued");
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.enqueueReviewJobs).toHaveBeenCalledOnce();
  });
});
