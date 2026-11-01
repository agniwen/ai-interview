import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_RESUME_REVIEW_STALE_MS,
  LOST_RESUME_REVIEW_RUN_ERROR,
  recoverResumeReviewRun,
  recoverStaleResumeReviewRuns,
} from "../review-recovery";
import type { ResumeReviewRecoveryDependencies, ResumeReviewRunSnapshot } from "../review-recovery";
import { enqueueResumeReassessmentForRecord } from "../review-queue";
import type {
  ResumeEvaluationSchedulingContext,
  ResumeEvaluationSchedulingDependencies,
} from "../review-queue";

const NOW = new Date("2026-10-19T04:00:00.000Z");
const STALE_QUEUED_AT = new Date(NOW.getTime() - DEFAULT_RESUME_REVIEW_STALE_MS - 1000);

const run: ResumeReviewRunSnapshot = {
  jobDescriptionId: "jd-1",
  organizationId: "org-1",
  outcome: "in_pipeline",
  pipelineStage: "screening",
  queuedAt: STALE_QUEUED_AT,
  resumeRecordId: "record-1",
  runId: "run-1",
};
const runKey = { organizationId: "org-1", resumeRecordId: "record-1", runId: "run-1" };

function createDependencies(
  overrides: Partial<ResumeReviewRecoveryDependencies> = {},
): ResumeReviewRecoveryDependencies {
  return {
    enqueueReviewJobs: vi
      .fn<ResumeReviewRecoveryDependencies["enqueueReviewJobs"]>()
      .mockResolvedValue(),
    getRunQueueState: vi
      .fn<ResumeReviewRecoveryDependencies["getRunQueueState"]>()
      .mockResolvedValue("missing"),
    isQueueConfigured: vi.fn(() => true),
    isRunStillActive: vi
      .fn<ResumeReviewRecoveryDependencies["isRunStillActive"]>()
      .mockResolvedValue(true),
    listStaleRuns: vi
      .fn<ResumeReviewRecoveryDependencies["listStaleRuns"]>()
      .mockResolvedValue([run]),
    loadRun: vi.fn<ResumeReviewRecoveryDependencies["loadRun"]>().mockResolvedValue(run),
    markRunFailed: vi
      .fn<ResumeReviewRecoveryDependencies["markRunFailed"]>()
      .mockResolvedValue(true),
    now: () => NOW,
    ...overrides,
  };
}

describe("recoverResumeReviewRun", () => {
  it("re-enqueues a lost run with the same run id after confirming it is still active", async () => {
    const dependencies = createDependencies();

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("requeued");

    expect(dependencies.getRunQueueState).toHaveBeenCalledWith(run);
    expect(dependencies.isRunStillActive).toHaveBeenCalledWith(runKey);
    expect(dependencies.enqueueReviewJobs).toHaveBeenCalledWith([
      {
        force: true,
        jobDescriptionId: "jd-1",
        organizationId: "org-1",
        resumeRecordId: "record-1",
        runId: "run-1",
        source: "reassess",
      },
    ]);
    expect(dependencies.markRunFailed).not.toHaveBeenCalled();
  });

  it("leaves a run alone before the stale threshold without touching the queue", async () => {
    const dependencies = createDependencies();
    const freshRun = { ...run, queuedAt: new Date(NOW.getTime() - 1000) };

    await expect(recoverResumeReviewRun(freshRun, {}, dependencies)).resolves.toBe("not_stale");

    expect(dependencies.getRunQueueState).not.toHaveBeenCalled();
  });

  it("does nothing while the job is still waiting or running in the queue", async () => {
    const dependencies = createDependencies({
      getRunQueueState: vi.fn().mockResolvedValue("pending"),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("pending");

    expect(dependencies.isRunStillActive).not.toHaveBeenCalled();
    expect(dependencies.enqueueReviewJobs).not.toHaveBeenCalled();
    expect(dependencies.markRunFailed).not.toHaveBeenCalled();
  });

  it("marks a run failed instead of re-running when its job already finished", async () => {
    const dependencies = createDependencies({
      getRunQueueState: vi.fn().mockResolvedValue("finished"),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("marked_failed");

    expect(dependencies.markRunFailed).toHaveBeenCalledWith({
      ...runKey,
      errorMessage: LOST_RESUME_REVIEW_RUN_ERROR,
    });
    expect(dependencies.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("marks a lost run failed for a closed candidate because forced reassessment would be rejected", async () => {
    const dependencies = createDependencies();

    await expect(
      recoverResumeReviewRun({ ...run, pipelineStage: "closed" }, {}, dependencies),
    ).resolves.toBe("marked_failed");
    await expect(
      recoverResumeReviewRun({ ...run, outcome: "rejected" }, {}, dependencies),
    ).resolves.toBe("marked_failed");

    expect(dependencies.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("reports settled when the run changed before it could be marked failed", async () => {
    const dependencies = createDependencies({
      getRunQueueState: vi.fn().mockResolvedValue("finished"),
      markRunFailed: vi.fn().mockResolvedValue(false),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("settled");
  });

  it("does not re-enqueue when the run settled before it could be re-enqueued", async () => {
    const dependencies = createDependencies({
      isRunStillActive: vi.fn().mockResolvedValue(false),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("settled");

    expect(dependencies.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("marks the run failed when re-enqueueing throws", async () => {
    const dependencies = createDependencies({
      enqueueReviewJobs: vi.fn().mockRejectedValue(new Error("redis down")),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("marked_failed");

    expect(dependencies.markRunFailed).toHaveBeenCalledWith({
      ...runKey,
      errorMessage: "redis down",
    });
  });

  it("changes nothing when the queue state cannot be confirmed", async () => {
    const dependencies = createDependencies({
      getRunQueueState: vi.fn().mockRejectedValue(new Error("Connection is closed.")),
    });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("unknown");

    expect(dependencies.isRunStillActive).not.toHaveBeenCalled();
    expect(dependencies.markRunFailed).not.toHaveBeenCalled();
    expect(dependencies.enqueueReviewJobs).not.toHaveBeenCalled();
  });

  it("treats a hanging queue lookup as unknown instead of blocking", async () => {
    const neverSettles = Promise.withResolvers<never>().promise;
    const dependencies = createDependencies({ getRunQueueState: vi.fn(() => neverSettles) });

    await expect(
      recoverResumeReviewRun(run, { queueStateTimeoutMs: 20 }, dependencies),
    ).resolves.toBe("unknown");
    expect(dependencies.markRunFailed).not.toHaveBeenCalled();
  });

  it("skips recovery entirely when the queue is not configured", async () => {
    const dependencies = createDependencies({ isQueueConfigured: vi.fn(() => false) });

    await expect(recoverResumeReviewRun(run, {}, dependencies)).resolves.toBe("unknown");

    expect(dependencies.getRunQueueState).not.toHaveBeenCalled();
  });
});

describe("recoverStaleResumeReviewRuns", () => {
  it("scans runs older than the threshold and keeps going when one run fails", async () => {
    const secondRun = { ...run, resumeRecordId: "record-2", runId: "run-2" };
    const dependencies = createDependencies({
      isRunStillActive: vi
        .fn<ResumeReviewRecoveryDependencies["isRunStillActive"]>()
        .mockRejectedValueOnce(new Error("db timeout"))
        .mockResolvedValue(true),
      listStaleRuns: vi.fn().mockResolvedValue([run, secondRun]),
    });

    const summary = await recoverStaleResumeReviewRuns({}, dependencies);

    expect(dependencies.listStaleRuns).toHaveBeenCalledWith({
      limit: 100,
      queuedBefore: new Date(NOW.getTime() - DEFAULT_RESUME_REVIEW_STALE_MS),
    });
    expect(summary).toMatchObject({ errors: 1, requeued: 1, scanned: 2 });
  });
});

const reassessInput = { organizationId: "org-1", resumeRecordId: "record-1" };

function createSchedulingDependencies(status: string): ResumeEvaluationSchedulingDependencies {
  const context: ResumeEvaluationSchedulingContext = {
    job: { evaluationMode: "qualitative", id: "jd-1", lifecycleStatus: "published" },
    record: {
      jobDescriptionId: "jd-1",
      outcome: "in_pipeline",
      pipelineStage: "screening",
      qualitativeResumeEvaluation: null,
      resumeEvaluationArtifactMode: null,
      resumeEvaluationAttemptMode: "qualitative",
      resumeFileName: "resume.pdf",
      resumeParseStatus: "ready",
      resumeProfile: {
        age: null,
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
      },
      resumeReview: null,
      resumeReviewStatus: status,
      structuredCompositeScore: null,
      structuredGateSortRank: null,
      structuredGateStatus: null,
      structuredResumeEvaluation: null,
      structuredScoreGrade: null,
    },
  };
  return {
    enqueueReviewJobs: vi
      .fn<ResumeEvaluationSchedulingDependencies["enqueueReviewJobs"]>()
      .mockResolvedValue(),
    isQueueConfigured: vi.fn(() => true),
    loadSchedulingContext: vi.fn().mockResolvedValue(context),
    markQueueFailure: vi
      .fn<ResumeEvaluationSchedulingDependencies["markQueueFailure"]>()
      .mockResolvedValue(),
    persistQueuedRun: vi.fn().mockResolvedValue(true),
  };
}

describe("enqueueResumeReassessmentForRecord with an in-flight run", () => {
  it("re-enqueues a lost run instead of reporting it as in progress", async () => {
    const scheduling = createSchedulingDependencies("queued");
    const recovery = createDependencies();

    await expect(
      enqueueResumeReassessmentForRecord(reassessInput, scheduling, recovery),
    ).resolves.toBe("enqueued");

    expect(recovery.enqueueReviewJobs).toHaveBeenCalledOnce();
    expect(scheduling.persistQueuedRun).not.toHaveBeenCalled();
  });

  it("keeps reporting in progress while the job is still in the queue", async () => {
    const scheduling = createSchedulingDependencies("processing");
    const recovery = createDependencies({ getRunQueueState: vi.fn().mockResolvedValue("pending") });

    await expect(
      enqueueResumeReassessmentForRecord(reassessInput, scheduling, recovery),
    ).resolves.toBe("already_in_progress");

    expect(scheduling.persistQueuedRun).not.toHaveBeenCalled();
  });

  it("starts a fresh run after the stuck run has been marked failed", async () => {
    const scheduling = createSchedulingDependencies("queued");
    const recovery = createDependencies({
      getRunQueueState: vi.fn().mockResolvedValue("finished"),
    });
    // 标记失败后重新加载的记录状态为 failed，与真实数据库一致。
    // After the run is marked failed, the reloaded record reports failed as in the database.
    const failedContext =
      await createSchedulingDependencies("failed").loadSchedulingContext(reassessInput);
    vi.mocked(scheduling.loadSchedulingContext).mockImplementation(async () =>
      vi.mocked(recovery.markRunFailed).mock.calls.length > 0
        ? failedContext
        : await createSchedulingDependencies("queued").loadSchedulingContext(reassessInput),
    );

    await expect(
      enqueueResumeReassessmentForRecord(reassessInput, scheduling, recovery),
    ).resolves.toBe("enqueued");

    expect(recovery.markRunFailed).toHaveBeenCalledOnce();
    expect(scheduling.persistQueuedRun).toHaveBeenCalledOnce();
    expect(scheduling.enqueueReviewJobs).toHaveBeenCalledOnce();
  });

  it("does not consult the queue for runs that are not in flight", async () => {
    const scheduling = createSchedulingDependencies("ready");
    const recovery = createDependencies();

    await enqueueResumeReassessmentForRecord(reassessInput, scheduling, recovery);

    expect(recovery.loadRun).not.toHaveBeenCalled();
    expect(scheduling.persistQueuedRun).toHaveBeenCalledOnce();
  });
});
