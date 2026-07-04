import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import { generateResumeReviewBestEffort } from "./review-generation";

async function markResumeReviewFailed(input: {
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
      ),
    );
}

export async function processResumeReviewGenerationJob(input: ResumeReviewGenerationJobData) {
  const [record] = await db
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
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

  if (!record) {
    return;
  }
  if (record.resumeReview) {
    await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewGeneratedAt: new Date(),
        resumeReviewStatus: "ready",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );
    return;
  }
  if (!record.resumeProfile) {
    await markResumeReviewFailed({
      errorMessage: "简历结构化信息不存在，无法生成 AI 分析。",
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
    return;
  }
  if (record.jobDescriptionId !== input.jobDescriptionId) {
    return;
  }

  await db
    .update(studioInterview)
    .set({
      resumeReviewError: null,
      resumeReviewStatus: "processing",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    );

  try {
    const generated = await generateResumeReviewBestEffort({
      jobDescriptionId: input.jobDescriptionId,
      logPrefix: "[resume-review-generation-worker]",
      organizationId: input.organizationId,
      resumeProfile: record.resumeProfile,
    });
    if (!generated?.structuredReview) {
      throw new Error("AI 分析生成失败。");
    }
    await db
      .update(studioInterview)
      .set({
        resumeReview: generated.structuredReview,
        resumeReviewError: null,
        resumeReviewGeneratedAt: new Date(),
        resumeReviewStatus: "ready",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );
  } catch (error) {
    await markResumeReviewFailed({
      errorMessage: error instanceof Error ? error.message : String(error),
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
    throw error;
  }
}
