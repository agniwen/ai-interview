import { lockRecruitingRecord, updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, isNotNull, isNull, notInArray } from "drizzle-orm";
import { db } from "../../../lib/db";
import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@app/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@app/resume-parse-queue/resume-review-generation";
import { structuredResumeEvaluationV1Schema } from "@app/db-schema/structured-resume-evaluation";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "../../job-descriptions/dao";
import { matchJobDescriptionForResume } from "../../../agents/job-description-match-agent";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import { ensureCurrentJobDescriptionVersion } from "./job-description-version";

type PersistedResumeRecordReviewJobData = Extract<
  ResumeReviewGenerationJobData,
  { source: "reassess" | "resume_pool_import" | "resume_upload" }
>;
type ResumeRecordReviewSchedulingInput = Omit<PersistedResumeRecordReviewJobData, "runId">;

export interface ResumeEvaluationRecord {
  jobDescriptionId: string | null;
  outcome: string | null;
  pipelineStage: string | null;
  qualitativeResumeEvaluation: unknown;
  resumeEvaluationArtifactMode: "legacy" | "qualitative" | "structured" | null;
  resumeEvaluationAttemptMode: "legacy" | "qualitative" | "structured" | null;
  resumeFileName: string | null;
  resumeParseStatus: string | null;
  resumeProfile: ResumeProfile | null;
  resumeReview: unknown;
  resumeReviewStatus: string | null;
  structuredCompositeScore: number | null;
  structuredGateSortRank: number | null;
  structuredGateStatus: string | null;
  structuredResumeEvaluation: unknown;
  structuredScoreGrade: string | null;
}

export interface ResumeEvaluationSchedulingContext {
  job: {
    evaluationMode: "legacy" | "qualitative" | "structured";
    id: string;
    lifecycleStatus: "draft" | "published";
  };
  record: ResumeEvaluationRecord & { jobDescriptionId: string };
}

interface SchedulingContextInput {
  autoMatchJobDescription?: boolean;
  organizationId: string;
  resumeRecordId: string;
}

interface PersistQueuedRunInput {
  expectedJobDescriptionId: string;
  mode: "qualitative";
  organizationId: string;
  resumeRecordId: string;
  runId: string;
}

interface MarkQueueFailureInput {
  errorMessage: string;
  mode: "qualitative";
  organizationId: string;
  resumeRecordId: string;
  runId: string;
}

export interface ResumeEvaluationSchedulingDependencies {
  enqueueReviewJobs: typeof enqueueResumeReviewGenerationJobs;
  isQueueConfigured: typeof isResumeReviewGenerationQueueConfigured;
  loadSchedulingContext: (
    input: SchedulingContextInput,
  ) => Promise<ResumeEvaluationSchedulingContext | null>;
  markQueueFailure: (input: MarkQueueFailureInput) => Promise<void>;
  persistQueuedRun: (input: PersistQueuedRunInput) => Promise<boolean>;
}

export type ResumeReviewSchedulingResult =
  | { status: "already_current" }
  | { runId: string; status: "enqueued" | "fallback_sync" }
  | { errorMessage: string; status: "failed" };

function hasCurrentStructuredEvaluation(record: {
  structuredCompositeScore: number | null;
  structuredGateSortRank: number | null;
  structuredGateStatus: string | null;
  structuredResumeEvaluation: unknown;
  structuredScoreGrade: string | null;
}): boolean {
  return (
    structuredResumeEvaluationV1Schema.safeParse(record.structuredResumeEvaluation).success &&
    record.structuredCompositeScore !== null &&
    record.structuredGateSortRank !== null &&
    record.structuredGateStatus !== null &&
    record.structuredScoreGrade !== null
  );
}

function hasCurrentEvaluationArtifact(record: {
  qualitativeResumeEvaluation: unknown;
  resumeEvaluationArtifactMode: "legacy" | "qualitative" | "structured" | null;
  resumeReview: unknown;
  structuredCompositeScore: number | null;
  structuredGateSortRank: number | null;
  structuredGateStatus: string | null;
  structuredResumeEvaluation: unknown;
  structuredScoreGrade: string | null;
}): boolean {
  if (record.resumeEvaluationArtifactMode === "structured") {
    return hasCurrentStructuredEvaluation(record);
  }
  if (record.resumeEvaluationArtifactMode === "qualitative") {
    return qualitativeResumeEvaluationSchema.safeParse(record.qualitativeResumeEvaluation).success;
  }
  if (record.resumeEvaluationArtifactMode === "legacy") {
    return Boolean(record.resumeReview);
  }
  return (
    qualitativeResumeEvaluationSchema.safeParse(record.qualitativeResumeEvaluation).success ||
    hasCurrentStructuredEvaluation(record) ||
    Boolean(record.resumeReview)
  );
}

async function loadSchedulingContextWithDb(
  input: SchedulingContextInput,
): Promise<ResumeEvaluationSchedulingContext | null> {
  const [record] = await db
    .select({
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      outcome: recruitingRecordReadModel.outcome,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
      qualitativeResumeEvaluation: recruitingRecordReadModel.qualitativeResumeEvaluation,
      resumeEvaluationArtifactMode: recruitingRecordReadModel.resumeEvaluationArtifactMode,
      resumeEvaluationAttemptMode: recruitingRecordReadModel.resumeEvaluationAttemptMode,
      resumeFileName: recruitingRecordReadModel.resumeFileName,
      resumeParseStatus: recruitingRecordReadModel.resumeParseStatus,
      resumeProfile: recruitingRecordReadModel.resumeProfile,
      resumeReview: recruitingRecordReadModel.resumeReview,
      resumeReviewStatus: recruitingRecordReadModel.resumeReviewStatus,
      structuredCompositeScore: recruitingRecordReadModel.structuredCompositeScore,
      structuredGateSortRank: recruitingRecordReadModel.structuredGateSortRank,
      structuredGateStatus: recruitingRecordReadModel.structuredGateStatus,
      structuredResumeEvaluation: recruitingRecordReadModel.structuredResumeEvaluation,
      structuredScoreGrade: recruitingRecordReadModel.structuredScoreGrade,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!record?.resumeProfile) {
    return null;
  }
  let { jobDescriptionId } = record;
  if (!jobDescriptionId && input.autoMatchJobDescription) {
    const jobs = await listRecruitingJobDescriptions(input.organizationId);
    const matched = await matchJobDescriptionForResume(record.resumeProfile, jobs, {
      resumeFileName: record.resumeFileName,
    });
    if (matched?.jobDescriptionId) {
      const [updated] = await updateRecruitingRecords(
        db,
        and(
          eq(recruitingRecordReadModel.id, input.resumeRecordId),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
          isNull(recruitingRecordReadModel.jobDescriptionId),
        ),
        {
          jobDescriptionId: matched.jobDescriptionId,
          updatedAt: new Date(),
        },
      );
      jobDescriptionId = updated?.jobDescriptionId ?? null;
    }
  }
  if (!jobDescriptionId) {
    return null;
  }
  const job = await loadRecruitingJobDescriptionById(input.organizationId, jobDescriptionId);
  return job
    ? {
        job: {
          evaluationMode: job.evaluationMode,
          id: job.id,
          lifecycleStatus: job.lifecycleStatus,
        },
        record: { ...record, jobDescriptionId },
      }
    : null;
}

function persistQueuedRunWithDb(input: PersistQueuedRunInput) {
  return db.transaction(async (tx) => {
    const snapshot = await ensureCurrentJobDescriptionVersion(tx, {
      jobDescriptionId: input.expectedJobDescriptionId,
      organizationId: input.organizationId,
    });
    if (!snapshot) {
      return false;
    }

    const now = new Date();
    const updated = await updateRecruitingRecords(
      tx,
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        eq(recruitingRecordReadModel.jobDescriptionId, input.expectedJobDescriptionId),
        notInArray(recruitingRecordReadModel.resumeReviewStatus, ["queued", "processing"]),
      ),
      {
        qualitativeAttemptJobDescriptionVersionId: snapshot.id,
        resumeEvaluationAttemptMode: input.mode,
        resumeReviewError: null,
        resumeReviewQueuedAt: now,
        resumeReviewRunId: input.runId,
        resumeReviewStatus: "queued",
        updatedAt: now,
      },
    );
    return updated.length > 0;
  });
}

async function markQueueFailureWithDb(input: MarkQueueFailureInput) {
  const errorMessage = input.errorMessage.slice(0, 1000);
  await db.transaction(async (tx) => {
    await lockRecruitingRecord(tx, input.resumeRecordId, input.organizationId);
    const [current] = await tx
      .select({
        jobDescriptionVersionId:
          recruitingRecordReadModel.qualitativeAttemptJobDescriptionVersionId,
      })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, input.resumeRecordId),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
          eq(recruitingRecordReadModel.resumeReviewRunId, input.runId),
          isNotNull(recruitingRecordReadModel.activeEvaluationId),
        ),
      )
      .limit(1);
    if (!current?.jobDescriptionVersionId) {
      return;
    }
    await updateRecruitingRecords(
      tx,
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        eq(recruitingRecordReadModel.resumeReviewRunId, input.runId),
        isNotNull(recruitingRecordReadModel.activeEvaluationId),
      ),
      {
        qualitativeAttemptJobDescriptionVersionId: null,
        resumeReviewError: errorMessage,
        resumeReviewStatus: "failed",
        updatedAt: new Date(),
      },
    );
  });
}

export const defaultResumeEvaluationSchedulingDependencies: ResumeEvaluationSchedulingDependencies =
  {
    enqueueReviewJobs: enqueueResumeReviewGenerationJobs,
    isQueueConfigured: isResumeReviewGenerationQueueConfigured,
    loadSchedulingContext: loadSchedulingContextWithDb,
    markQueueFailure: markQueueFailureWithDb,
    persistQueuedRun: persistQueuedRunWithDb,
  };

export async function scheduleResumeEvaluationForRecord(
  input: ResumeRecordReviewSchedulingInput,
  dependencies: ResumeEvaluationSchedulingDependencies = defaultResumeEvaluationSchedulingDependencies,
): Promise<ResumeReviewSchedulingResult> {
  const context = await dependencies.loadSchedulingContext(input);
  if (!context?.record.resumeProfile) {
    return {
      errorMessage: "记录不存在、简历尚未解析或绑定岗位尚未发布。",
      status: "failed",
    };
  }
  const force = Boolean(input.force) || input.source === "reassess";
  const hasCurrentArtifact = hasCurrentEvaluationArtifact(context.record);
  if (!force && hasCurrentArtifact) {
    return { status: "already_current" };
  }
  if (
    context.record.resumeReviewStatus === "queued" ||
    context.record.resumeReviewStatus === "processing"
  ) {
    return {
      errorMessage: "AI 评估任务正在处理中。",
      status: "failed",
    };
  }

  const runId = crypto.randomUUID();
  const persisted = await dependencies.persistQueuedRun({
    expectedJobDescriptionId: context.job.id,
    mode: "qualitative",
    organizationId: input.organizationId,
    resumeRecordId: input.resumeRecordId,
    runId,
  });
  if (!persisted) {
    return {
      errorMessage: "AI 评估任务正在处理中。",
      status: "failed",
    };
  }
  if (!dependencies.isQueueConfigured()) {
    return { runId, status: "fallback_sync" };
  }

  try {
    await dependencies.enqueueReviewJobs([
      {
        ...input,
        force,
        jobDescriptionId: context.job.id,
        runId,
      },
    ]);
    return { runId, status: "enqueued" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await dependencies.markQueueFailure({
      errorMessage,
      mode: "qualitative",
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
      runId,
    });
    console.warn("[resume-review-generation] enqueue failed", {
      error,
      resumeRecordId: input.resumeRecordId,
    });
    return { errorMessage, status: "failed" };
  }
}

export const enqueueResumeReviewGenerationForRecordBestEffort = scheduleResumeEvaluationForRecord;

export async function enqueueResumePoolReviewGenerationBestEffort(input: {
  autoMatchJobDescription?: boolean;
  generationToken?: string;
  jobDescriptionId: string | null;
  organizationId: string;
  poolItemId: string;
}): Promise<boolean> {
  if (!isResumeReviewGenerationQueueConfigured()) {
    return false;
  }
  try {
    await enqueueResumeReviewGenerationJobs([{ ...input, source: "resume_pool_upload" }]);
    return true;
  } catch (error) {
    console.warn("[resume-review-generation] pool review enqueue failed", {
      error,
      poolItemId: input.poolItemId,
    });
    return false;
  }
}

export class ResumeReassessmentEnqueueError extends Error {
  readonly status: 409 | 503;

  constructor(message: string, status: 409 | 503 = 409) {
    super(message);
    this.name = "ResumeReassessmentEnqueueError";
    this.status = status;
  }
}

export async function enqueueResumeReassessmentForRecord(
  input: {
    organizationId: string;
    resumeRecordId: string;
  },
  dependencies: ResumeEvaluationSchedulingDependencies = defaultResumeEvaluationSchedulingDependencies,
): Promise<"already_in_progress" | "enqueued" | "fallback_sync"> {
  const context = await dependencies.loadSchedulingContext(input);
  if (!context) {
    throw new ResumeReassessmentEnqueueError("记录不存在或绑定岗位尚未发布。");
  }
  const { record } = context;
  if (!record.resumeProfile || record.resumeParseStatus !== "ready") {
    throw new ResumeReassessmentEnqueueError("简历解析完成后才能重新评估。");
  }
  if (record.pipelineStage === "closed" || record.outcome !== "in_pipeline") {
    throw new ResumeReassessmentEnqueueError("已结束候选人不能重新评估。");
  }
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return "already_in_progress";
  }

  const result = await scheduleResumeEvaluationForRecord(
    {
      force: true,
      jobDescriptionId: context.job.id,
      organizationId: input.organizationId,
      reassessToken: crypto.randomUUID(),
      resumeRecordId: input.resumeRecordId,
      source: "reassess",
    },
    dependencies,
  );
  if (result.status === "failed") {
    throw new ResumeReassessmentEnqueueError("重新评估任务入队失败，请稍后重试。", 503);
  }
  if (result.status === "already_current") {
    return "already_in_progress";
  }
  return result.status;
}
