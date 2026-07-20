import { and, eq, isNull, notInArray } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";

type ResumeRecordReviewGenerationJobData = Exclude<
  ResumeReviewGenerationJobData,
  { source: "resume_pool_upload" }
>;

export async function markResumeReviewQueued(input: {
  allowExistingReview?: boolean;
  organizationId: string;
  resumeRecordId: string;
}) {
  const now = new Date();
  const conditions = [
    eq(studioInterview.id, input.resumeRecordId),
    eq(studioInterview.organizationId, input.organizationId),
  ];
  if (!input.allowExistingReview) {
    conditions.push(isNull(studioInterview.resumeReview));
  }
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: null,
      resumeReviewQueuedAt: now,
      resumeReviewStatus: "queued",
      resumeScreeningError: null,
      resumeScreeningStatus: "processing",
      updatedAt: now,
    })
    .where(and(...conditions));
}

async function markResumeReviewQueueFailed(input: {
  allowExistingReview?: boolean;
  errorMessage: string;
  organizationId: string;
  resumeRecordId: string;
}) {
  const errorMessage = input.errorMessage.slice(0, 1000);
  const conditions = [
    eq(studioInterview.id, input.resumeRecordId),
    eq(studioInterview.organizationId, input.organizationId),
  ];
  if (!input.allowExistingReview) {
    conditions.push(isNull(studioInterview.resumeReview));
  }
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: errorMessage,
      resumeReviewStatus: "failed",
      resumeScreeningError: errorMessage,
      resumeScreeningStatus: "failed",
      updatedAt: new Date(),
    })
    .where(and(...conditions));
}

export async function enqueueResumeReviewGenerationForRecordBestEffort(
  input: ResumeRecordReviewGenerationJobData,
): Promise<boolean> {
  if (!isResumeReviewGenerationQueueConfigured()) {
    return false;
  }

  const force = Boolean(input.force) || input.source === "reassess";

  const [record] = await db
    .select({
      resumeProfile: studioInterview.resumeProfile,
      resumeReview: studioInterview.resumeReview,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!record?.resumeProfile || (!force && record.resumeReview)) {
    return false;
  }

  try {
    await markResumeReviewQueued({ ...input, allowExistingReview: force });
    await enqueueResumeReviewGenerationJobs([{ ...input, force }]);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markResumeReviewQueueFailed({
      allowExistingReview: force,
      errorMessage,
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
    console.warn("[resume-review-generation] enqueue failed", {
      error,
      resumeRecordId: input.resumeRecordId,
    });
    return false;
  }
}

export async function enqueueResumePoolReviewGenerationBestEffort(input: {
  autoMatchJobDescription?: boolean;
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

/**
 * Enqueue a force reassess for an existing resume library row.
 * Shares the same BullMQ worker path as talent-pool first-generation.
 */
export async function enqueueResumeReassessmentForRecord(input: {
  organizationId: string;
  resumeRecordId: string;
}): Promise<"already_in_progress" | "enqueued" | "fallback_sync"> {
  const [record] = await db
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      resumeParseStatus: studioInterview.resumeParseStatus,
      resumeProfile: studioInterview.resumeProfile,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
    })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!record) {
    throw new ResumeReassessmentEnqueueError("记录不存在。");
  }
  if (!record.resumeProfile || record.resumeParseStatus !== "ready") {
    throw new ResumeReassessmentEnqueueError("简历解析完成后才能重新评估。");
  }
  if (record.pipelineStage === "closed" || record.outcome !== "in_pipeline") {
    throw new ResumeReassessmentEnqueueError("已结案候选人不能重新评估。");
  }
  if (!record.jobDescriptionId) {
    throw new ResumeReassessmentEnqueueError("请先关联在招岗位后再重新评估。");
  }
  if (record.resumeReviewStatus === "queued" || record.resumeReviewStatus === "processing") {
    return "already_in_progress";
  }

  if (!isResumeReviewGenerationQueueConfigured()) {
    // No Redis worker: mark processing and let the caller run lifecycle in-process async.
    const now = new Date();
    await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewQueuedAt: now,
        resumeReviewStatus: "processing",
        resumeScreeningError: null,
        resumeScreeningStatus: "processing",
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
          notInArray(studioInterview.resumeReviewStatus, ["queued", "processing"]),
        ),
      );
    return "fallback_sync";
  }

  const reassessToken = crypto.randomUUID();
  const enqueued = await enqueueResumeReviewGenerationForRecordBestEffort({
    force: true,
    jobDescriptionId: record.jobDescriptionId,
    organizationId: input.organizationId,
    reassessToken,
    resumeRecordId: input.resumeRecordId,
    source: "reassess",
  });

  if (!enqueued) {
    throw new ResumeReassessmentEnqueueError("重新评估任务入队失败，请稍后重试。", 503);
  }
  return "enqueued";
}
