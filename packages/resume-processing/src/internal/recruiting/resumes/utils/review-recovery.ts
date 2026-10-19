import { updateRecruitingRecords } from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { recruitingRecord, recruitingResumeEvaluation } from "@app/db-schema/schema";
import { and, asc, eq, inArray, isNotNull, lt, or, isNull } from "drizzle-orm";
import {
  enqueueResumeReviewGenerationJobs,
  getResumeReviewGenerationRunQueueState,
  isResumeReviewGenerationQueueConfigured,
} from "@app/job-queues/resume-review-generation";
import type { ResumeReviewGenerationRunQueueState } from "@app/job-queues/resume-review-generation";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../../../runtime/db";

/**
 * 招聘台简历 AI 评价的丢失任务恢复。
 *
 * 评价先把记录置为 queued（持久化 runId），再投递 BullMQ 任务。任务若在 Redis 中丢失
 * （迁移、清空、进程仍连旧 Redis），记录会永久停在 queued / processing。这里按 runId
 * 推导任务 ID 去队列核对：
 * - 队列中仍在等待/执行：正常，不处理；
 * - 队列中找不到：用原 runId 重新投递（任务 ID 幂等，Worker 写回按 runId 守卫）；
 * - 队列中已结束但记录仍未落定：标记失败，交给人工重新评估，避免反复自动重跑；
 * - Redis 不可用或超时：无法确认，不处理，宁可继续卡住也不误判。
 *
 * Recovery for lost recruiting-desk resume review runs. Runs are persisted as queued
 * (with a runId) before the BullMQ job is added; when the job is lost the record would
 * otherwise stay queued forever. Lost jobs are re-enqueued with the same runId, jobs that
 * finished without settling the record are marked failed, and anything that cannot be
 * confirmed (Redis unavailable) is left untouched.
 */

/** 排队超过该时长才做丢失判定，避开「已置 queued、尚未入队」的正常窗口。 */
export const DEFAULT_RESUME_REVIEW_STALE_MS = 10 * 60 * 1000;
const QUEUE_STATE_TIMEOUT_MS = 5000;
const DEFAULT_RECOVERY_BATCH_LIMIT = 100;
export const LOST_RESUME_REVIEW_RUN_ERROR = "AI 评估任务异常中断，请重新评估。";

export interface ResumeReviewRunSnapshot {
  jobDescriptionId: string | null;
  organizationId: string;
  outcome: string | null;
  pipelineStage: string | null;
  queuedAt: Date | null;
  resumeRecordId: string;
  runId: string;
}

interface ResumeReviewRunKey {
  organizationId: string;
  resumeRecordId: string;
  runId: string;
}

export interface ResumeReviewRecoveryDependencies {
  enqueueReviewJobs: typeof enqueueResumeReviewGenerationJobs;
  getRunQueueState: (
    run: Pick<ResumeReviewRunSnapshot, "jobDescriptionId" | "resumeRecordId" | "runId">,
  ) => Promise<ResumeReviewGenerationRunQueueState>;
  isQueueConfigured: typeof isResumeReviewGenerationQueueConfigured;
  listStaleRuns: (input: {
    limit: number;
    queuedBefore: Date;
  }) => Promise<ResumeReviewRunSnapshot[]>;
  loadRun: (input: {
    organizationId: string;
    resumeRecordId: string;
  }) => Promise<ResumeReviewRunSnapshot | null>;
  /** 仅当 runId 仍匹配且状态仍为 queued/processing 时生效；返回是否命中。 */
  markRunFailed: (input: ResumeReviewRunKey & { errorMessage: string }) => Promise<boolean>;
  now: () => Date;
  /** 只读确认该 runId 仍是进行中的运行（尚未被 Worker 写回或被新运行替换）。 */
  isRunStillActive: (input: ResumeReviewRunKey) => Promise<boolean>;
}

export type ResumeReviewRunRecoveryResult =
  | "marked_failed"
  | "not_stale"
  | "pending"
  | "requeued"
  | "settled"
  | "unknown";

const ACTIVE_REVIEW_STATUSES = ["queued", "processing"] as const;

function activeRunWhere(input: ResumeReviewRunKey) {
  return and(
    eq(recruitingRecordReadModel.id, input.resumeRecordId),
    eq(recruitingRecordReadModel.organizationId, input.organizationId),
    eq(recruitingRecordReadModel.resumeReviewRunId, input.runId),
    inArray(recruitingRecordReadModel.resumeReviewStatus, [...ACTIVE_REVIEW_STATUSES]),
    isNotNull(recruitingRecordReadModel.activeEvaluationId),
  );
}

async function loadRunWithDb(input: {
  organizationId: string;
  resumeRecordId: string;
}): Promise<ResumeReviewRunSnapshot | null> {
  const [row] = await db
    .select({
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      organizationId: recruitingRecordReadModel.organizationId,
      outcome: recruitingRecordReadModel.outcome,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
      queuedAt: recruitingRecordReadModel.resumeReviewQueuedAt,
      resumeRecordId: recruitingRecordReadModel.id,
      runId: recruitingRecordReadModel.resumeReviewRunId,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        inArray(recruitingRecordReadModel.resumeReviewStatus, [...ACTIVE_REVIEW_STATUSES]),
        isNotNull(recruitingRecordReadModel.activeEvaluationId),
      ),
    )
    .limit(1);
  if (!row?.runId || !row.organizationId) {
    return null;
  }
  return { ...row, organizationId: row.organizationId, runId: row.runId };
}

/**
 * 直接查基础表（而非读模型子查询），定时巡检只扫描进行中的评价运行。
 * Scans base tables (not the read-model subquery) so periodic sweeps only touch active runs.
 */
async function listStaleRunsWithDb(input: {
  limit: number;
  queuedBefore: Date;
}): Promise<ResumeReviewRunSnapshot[]> {
  const rows = await db
    .select({
      jobDescriptionId: recruitingRecord.jobDescriptionId,
      organizationId: recruitingRecord.organizationId,
      outcome: recruitingRecord.outcome,
      pipelineStage: recruitingRecord.currentStage,
      queuedAt: recruitingResumeEvaluation.startedAt,
      resumeRecordId: recruitingRecord.id,
      runId: recruitingResumeEvaluation.runId,
    })
    .from(recruitingRecord)
    .innerJoin(
      recruitingResumeEvaluation,
      and(
        eq(recruitingResumeEvaluation.id, recruitingRecord.activeEvaluationId),
        eq(recruitingResumeEvaluation.organizationId, recruitingRecord.organizationId),
      ),
    )
    .where(
      and(
        inArray(recruitingResumeEvaluation.status, [...ACTIVE_REVIEW_STATUSES]),
        isNotNull(recruitingResumeEvaluation.runId),
        or(
          isNull(recruitingResumeEvaluation.startedAt),
          lt(recruitingResumeEvaluation.startedAt, input.queuedBefore),
        ),
      ),
    )
    .orderBy(asc(recruitingResumeEvaluation.startedAt))
    .limit(input.limit);
  return rows.flatMap((row) => (row.runId ? [{ ...row, runId: row.runId }] : []));
}

async function markRunFailedWithDb(
  input: ResumeReviewRunKey & { errorMessage: string },
): Promise<boolean> {
  const updated = await updateRecruitingRecords(db, activeRunWhere(input), {
    qualitativeAttemptJobDescriptionVersionId: null,
    resumeReviewError: input.errorMessage.slice(0, 1000),
    resumeReviewStatus: "failed",
    updatedAt: new Date(),
  });
  return updated.length > 0;
}

async function isRunStillActiveWithDb(input: ResumeReviewRunKey): Promise<boolean> {
  const [row] = await db
    .select({ id: recruitingRecordReadModel.id })
    .from(recruitingRecordReadModel)
    .where(activeRunWhere(input))
    .limit(1);
  return Boolean(row);
}

export const defaultResumeReviewRecoveryDependencies: ResumeReviewRecoveryDependencies = {
  enqueueReviewJobs: enqueueResumeReviewGenerationJobs,
  getRunQueueState: getResumeReviewGenerationRunQueueState,
  isQueueConfigured: isResumeReviewGenerationQueueConfigured,
  isRunStillActive: isRunStillActiveWithDb,
  listStaleRuns: listStaleRunsWithDb,
  loadRun: loadRunWithDb,
  markRunFailed: markRunFailedWithDb,
  now: () => new Date(),
};

async function throwAfterTimeout(timeoutMs: number, signal: AbortSignal): Promise<never> {
  await delay(timeoutMs, undefined, { signal });
  throw new Error(`timed out after ${timeoutMs}ms`);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  try {
    return await Promise.race([promise, throwAfterTimeout(timeoutMs, controller.signal)]);
  } finally {
    controller.abort();
  }
}

function canRequeue(run: ResumeReviewRunSnapshot): run is ResumeReviewRunSnapshot & {
  jobDescriptionId: string;
} {
  // 重投使用 force；Worker 对已结束候选人的强制评估会直接报错，这类记录改为标记失败。
  // Re-enqueued runs use force, which the worker rejects for closed candidates.
  return (
    run.jobDescriptionId !== null && run.outcome === "in_pipeline" && run.pipelineStage !== "closed"
  );
}

/** 对单个进行中的评价运行做丢失判定与恢复。Detects and recovers one in-flight review run. */
export async function recoverResumeReviewRun(
  run: ResumeReviewRunSnapshot,
  options: { queueStateTimeoutMs?: number; staleAfterMs?: number } = {},
  dependencies: ResumeReviewRecoveryDependencies = defaultResumeReviewRecoveryDependencies,
): Promise<ResumeReviewRunRecoveryResult> {
  if (!dependencies.isQueueConfigured()) {
    return "unknown";
  }
  const now = dependencies.now();
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_RESUME_REVIEW_STALE_MS;
  if (run.queuedAt && now.getTime() - run.queuedAt.getTime() < staleAfterMs) {
    return "not_stale";
  }

  let queueState: ResumeReviewGenerationRunQueueState;
  try {
    queueState = await withTimeout(
      dependencies.getRunQueueState(run),
      options.queueStateTimeoutMs ?? QUEUE_STATE_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("[resume-review-recovery] queue state unavailable", {
      error: error instanceof Error ? error.message : String(error),
      resumeRecordId: run.resumeRecordId,
      runId: run.runId,
    });
    return "unknown";
  }
  if (queueState === "pending") {
    return "pending";
  }

  const key = {
    organizationId: run.organizationId,
    resumeRecordId: run.resumeRecordId,
    runId: run.runId,
  };
  if (queueState === "finished" || !canRequeue(run)) {
    const marked = await dependencies.markRunFailed({
      ...key,
      errorMessage: LOST_RESUME_REVIEW_RUN_ERROR,
    });
    if (marked) {
      console.warn("[resume-review-recovery] marked lost run failed", { ...key, queueState });
    }
    return marked ? "marked_failed" : "settled";
  }

  // 重投前再确认运行仍未落定。即使与并发恢复竞争也安全：同一 runId 的任务 ID 相同会被
  // BullMQ 去重，Worker 写回按 runId 守卫。丢失的任务最多每轮巡检重投一次。
  // Re-check the run is still unsettled. Racing recoveries are safe: the same runId maps to
  // the same BullMQ job id, and worker writes are guarded by runId. A lost job is re-enqueued
  // at most once per sweep.
  if (!(await dependencies.isRunStillActive(key))) {
    return "settled";
  }
  try {
    await dependencies.enqueueReviewJobs([
      {
        force: true,
        jobDescriptionId: run.jobDescriptionId,
        organizationId: run.organizationId,
        resumeRecordId: run.resumeRecordId,
        runId: run.runId,
        source: "reassess",
      },
    ]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await dependencies.markRunFailed({ ...key, errorMessage });
    console.warn("[resume-review-recovery] re-enqueue failed", { ...key, error: errorMessage });
    return "marked_failed";
  }
  console.info("[resume-review-recovery] re-enqueued lost run", key);
  return "requeued";
}

/** 按记录恢复（供「重新评估」使用）；记录没有进行中的运行时返回 settled。 */
export async function recoverResumeReviewRunForRecord(
  input: { organizationId: string; resumeRecordId: string },
  options: { staleAfterMs?: number } = {},
  dependencies: ResumeReviewRecoveryDependencies = defaultResumeReviewRecoveryDependencies,
): Promise<ResumeReviewRunRecoveryResult> {
  const run = await dependencies.loadRun(input);
  if (!run) {
    return "settled";
  }
  return recoverResumeReviewRun(run, options, dependencies);
}

export type ResumeReviewRecoverySummary = Record<ResumeReviewRunRecoveryResult, number> & {
  errors: number;
  scanned: number;
};

/** 定时巡检：扫描超时的进行中运行并逐条恢复，单条失败不影响其余。 */
export async function recoverStaleResumeReviewRuns(
  options: { limit?: number; staleAfterMs?: number } = {},
  dependencies: ResumeReviewRecoveryDependencies = defaultResumeReviewRecoveryDependencies,
): Promise<ResumeReviewRecoverySummary> {
  const summary: ResumeReviewRecoverySummary = {
    errors: 0,
    marked_failed: 0,
    not_stale: 0,
    pending: 0,
    requeued: 0,
    scanned: 0,
    settled: 0,
    unknown: 0,
  };
  if (!dependencies.isQueueConfigured()) {
    return summary;
  }
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_RESUME_REVIEW_STALE_MS;
  const runs = await dependencies.listStaleRuns({
    limit: options.limit ?? DEFAULT_RECOVERY_BATCH_LIMIT,
    queuedBefore: new Date(dependencies.now().getTime() - staleAfterMs),
  });
  for (const run of runs) {
    summary.scanned += 1;
    try {
      const result = await recoverResumeReviewRun(run, { staleAfterMs }, dependencies);
      summary[result] += 1;
    } catch (error) {
      summary.errors += 1;
      console.warn("[resume-review-recovery] run recovery failed", {
        error: error instanceof Error ? error.message : String(error),
        resumeRecordId: run.resumeRecordId,
        runId: run.runId,
      });
    }
  }
  return summary;
}
