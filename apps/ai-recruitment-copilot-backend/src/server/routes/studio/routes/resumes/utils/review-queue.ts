import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";

export async function markResumeReviewQueued(input: {
  organizationId: string;
  resumeRecordId: string;
}) {
  const now = new Date();
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: null,
      resumeReviewQueuedAt: now,
      resumeReviewStatus: "queued",
      updatedAt: now,
    })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        isNull(studioInterview.resumeReview),
      ),
    );
}

async function markResumeReviewQueueFailed(input: {
  errorMessage: string;
  organizationId: string;
  resumeRecordId: string;
}) {
  await db
    .update(studioInterview)
    .set({
      resumeReviewError: input.errorMessage.slice(0, 1000),
      resumeReviewStatus: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        isNull(studioInterview.resumeReview),
      ),
    );
}

export async function enqueueResumeReviewGenerationForRecordBestEffort(
  input: ResumeReviewGenerationJobData,
): Promise<boolean> {
  if (!isResumeReviewGenerationQueueConfigured()) {
    return false;
  }

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

  if (!record?.resumeProfile || record.resumeReview) {
    return false;
  }

  try {
    await markResumeReviewQueued(input);
    await enqueueResumeReviewGenerationJobs([input]);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await markResumeReviewQueueFailed({
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
