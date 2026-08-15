import { and, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";

type PersistedResumeRecordReviewJobData = Exclude<
  ResumeReviewGenerationJobData,
  { source: "resume_pool_upload" }
>;
type ResumeRecordReviewSchedulingInput = Omit<PersistedResumeRecordReviewJobData, "runId">;

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
  resumeEvaluationArtifactMode: "legacy" | "structured" | null;
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
  if (record.resumeEvaluationArtifactMode === "legacy") {
    return Boolean(record.resumeReview);
  }
  return hasCurrentStructuredEvaluation(record) || Boolean(record.resumeReview);
}

async function loadSchedulingContext(input: {
  autoMatchJobDescription?: boolean;
  organizationId: string;
  resumeRecordId: string;
}) {
  const [record] = await db
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
      resumeEvaluationAttemptMode: studioInterview.resumeEvaluationAttemptMode,
      resumeFileName: studioInterview.resumeFileName,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
      structuredCompositeScore: studioInterview.structuredCompositeScore,
      structuredGateSortRank: studioInterview.structuredGateSortRank,
      structuredGateStatus: studioInterview.structuredGateStatus,
      structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
      structuredScoreGrade: studioInterview.structuredScoreGrade,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
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
      const [updated] = await db
        .update(studioInterview)
        .set({
          jobDescriptionId: matched.jobDescriptionId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studioInterview.id, input.resumeRecordId),
            eq(studioInterview.organizationId, input.organizationId),
            isNull(studioInterview.jobDescriptionId),
          ),
        )
        .returning({ jobDescriptionId: studioInterview.jobDescriptionId });
      jobDescriptionId = updated?.jobDescriptionId ?? null;
    }
  }
  if (!jobDescriptionId) {
    return null;
  }
  const job = await loadRecruitingJobDescriptionById(input.organizationId, jobDescriptionId);
  return job ? { job, record: { ...record, jobDescriptionId } } : null;
}

function persistQueuedRun(input: {
  expectedJobDescriptionId: string;
  mode: "legacy" | "structured";
  organizationId: string;
  resumeRecordId: string;
  runId: string;
}) {
  return db.transaction(async (tx) => {
    const [currentJob] = await tx
      .select({
        evaluationMode: jobDescription.evaluationMode,
        lifecycleStatus: jobDescription.lifecycleStatus,
      })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, input.expectedJobDescriptionId),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("share");
    if (currentJob?.evaluationMode !== input.mode || currentJob.lifecycleStatus !== "published") {
      return false;
    }

    const now = new Date();
    const legacyValues =
      input.mode === "legacy"
        ? {
            resumeScreeningError: null,
            resumeScreeningStatus: "processing" as const,
          }
        : {};
    const updated = await tx
      .update(studioInterview)
      .set({
        resumeEvaluationAttemptMode: input.mode,
        resumeReviewError: null,
        resumeReviewQueuedAt: now,
        resumeReviewRunId: input.runId,
        resumeReviewStatus: "queued",
        ...legacyValues,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          eq(studioInterview.jobDescriptionId, input.expectedJobDescriptionId),
          notInArray(studioInterview.resumeReviewStatus, ["queued", "processing"]),
        ),
      )
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  });
}

async function markQueueFailure(input: {
  errorMessage: string;
  mode: "legacy" | "structured";
  organizationId: string;
  resumeRecordId: string;
  runId: string;
}) {
  const errorMessage = input.errorMessage.slice(0, 1000);
  const legacyValues =
    input.mode === "legacy"
      ? {
          resumeScreeningError: errorMessage,
          resumeScreeningStatus: "failed" as const,
        }
      : {};
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: errorMessage,
      resumeReviewStatus: "failed",
      ...legacyValues,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        eq(studioInterview.resumeReviewRunId, input.runId),
      ),
    )
    .returning({ id: studioInterview.id });
}

export async function scheduleResumeEvaluationForRecord(
  input: ResumeRecordReviewSchedulingInput,
): Promise<ResumeReviewSchedulingResult> {
  const context = await loadSchedulingContext(input);
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
  const persisted = await persistQueuedRun({
    expectedJobDescriptionId: context.job.id,
    mode: context.job.evaluationMode,
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
  if (!isResumeReviewGenerationQueueConfigured()) {
    return { runId, status: "fallback_sync" };
  }

  try {
    await enqueueResumeReviewGenerationJobs([
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
    await markQueueFailure({
      errorMessage,
      mode: context.job.evaluationMode,
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

export async function enqueueResumeReassessmentForRecord(input: {
  organizationId: string;
  resumeRecordId: string;
}): Promise<"already_in_progress" | "enqueued" | "fallback_sync"> {
  const context = await loadSchedulingContext(input);
  if (!context) {
    throw new ResumeReassessmentEnqueueError("记录不存在或绑定岗位尚未发布。");
  }
  const { record } = context;
  if (!record.resumeProfile || record.resumeParseStatus !== "ready") {
    throw new ResumeReassessmentEnqueueError("简历解析完成后才能重新评估。");
  }
  if (record.pipelineStage === "closed" || record.outcome !== "in_pipeline") {
    throw new ResumeReassessmentEnqueueError("已结案候选人不能重新评估。");
  }
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return "already_in_progress";
  }

  const result = await scheduleResumeEvaluationForRecord({
    force: true,
    jobDescriptionId: context.job.id,
    organizationId: input.organizationId,
    reassessToken: crypto.randomUUID(),
    resumeRecordId: input.resumeRecordId,
    source: "reassess",
  });
  if (result.status === "failed") {
    throw new ResumeReassessmentEnqueueError("重新评估任务入队失败，请稍后重试。", 503);
  }
  if (result.status === "already_current") {
    return "already_in_progress";
  }
  return result.status;
}
