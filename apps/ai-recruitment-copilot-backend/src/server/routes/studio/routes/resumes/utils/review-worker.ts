import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import { generateResumeReviewBestEffort } from "./review-generation";
import { runResumeAssessmentLifecycle } from "./review-lifecycle";
import type { ResumeAssessmentLifecycleDeps } from "./review-lifecycle";

function recordWhere(input: { organizationId: string; resumeRecordId: string }) {
  return and(
    eq(studioInterview.id, input.resumeRecordId),
    eq(studioInterview.organizationId, input.organizationId),
  );
}

function reviewRunWhere(runId: string | null | undefined) {
  if (runId === null) {
    return isNull(studioInterview.resumeReviewRunId);
  }
  return runId ? eq(studioInterview.resumeReviewRunId, runId) : undefined;
}

function guardedRecordWhere(input: {
  expectedJobDescriptionId: string | null;
  organizationId: string;
  resumeRecordId: string;
  runId?: string | null;
}) {
  return and(
    recordWhere(input),
    input.expectedJobDescriptionId
      ? eq(studioInterview.jobDescriptionId, input.expectedJobDescriptionId)
      : isNull(studioInterview.jobDescriptionId),
    reviewRunWhere(input.runId),
  );
}

const lifecycleDeps: ResumeAssessmentLifecycleDeps = {
  generate: async (input) => {
    const generated = await generateResumeReviewBestEffort({
      ...input,
      logPrefix: "[resume-assessment-lifecycle]",
    });
    if (!generated) {
      throw new Error("AI 分析生成失败。");
    }
    return generated;
  },
  loadRecord: async (input) => {
    const [record] = await db
      .select({
        jobDescriptionId: studioInterview.jobDescriptionId,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
        resumeParseStatus: studioInterview.resumeParseStatus,
        resumeProfile: studioInterview.resumeProfile,
        resumeReview: studioInterview.resumeReview,
        resumeScreeningResult: studioInterview.resumeScreeningResult,
        resumeText: studioInterview.resumeText,
      })
      .from(studioInterview)
      .where(recordWhere(input))
      .limit(1);
    return record
      ? {
          ...record,
          resumeScreeningResult: record.resumeScreeningResult as ResumeScreeningResult | null,
        }
      : null;
  },
  markExistingReady: async (input) => {
    const now = new Date();
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewGeneratedAt: now,
        resumeReviewStatus: "ready",
        resumeScreeningError: null,
        resumeScreeningStatus: input.hasScreeningResult ? "ready" : "idle",
        updatedAt: now,
      })
      .where(guardedRecordWhere({ ...input, runId: null }))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markFailed: async (input) => {
    const errorMessage = input.errorMessage.slice(0, 1000);
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: errorMessage,
        resumeReviewRunId: input.runId ? null : undefined,
        resumeReviewStatus: "failed",
        resumeScreeningError: errorMessage,
        resumeScreeningStatus: "failed",
        updatedAt: new Date(),
      })
      .where(guardedRecordWhere({ ...input, runId: input.runId ?? null }))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markProcessing: async (input) => {
    const now = new Date();
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewQueuedAt: now,
        resumeReviewRunId: input.runId,
        resumeReviewStatus: "processing",
        resumeScreeningError: null,
        resumeScreeningStatus: "processing",
        updatedAt: now,
      })
      .where(guardedRecordWhere({ ...input, runId: undefined }))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markReady: async (input) => {
    const now = new Date();
    const updated = await db
      .update(studioInterview)
      .set({
        notes: input.assessment.review,
        resumeReview: input.assessment.structuredReview,
        resumeReviewError: null,
        resumeReviewGeneratedAt: now,
        resumeReviewRunId: null,
        resumeReviewStatus: "ready",
        resumeScreeningError: null,
        resumeScreeningEvaluatedAt: now,
        resumeScreeningResult: input.assessment.screeningResult,
        resumeScreeningStatus: "ready",
        updatedAt: now,
      })
      .where(guardedRecordWhere(input))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
};

export function reassessResumeRecord(input: { organizationId: string; resumeRecordId: string }) {
  return runResumeAssessmentLifecycle(
    {
      force: true,
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    },
    lifecycleDeps,
  );
}

export function processResumeReviewGenerationJob(input: ResumeReviewGenerationJobData) {
  const force = Boolean(input.force) || input.source === "reassess";
  return runResumeAssessmentLifecycle(
    {
      expectedJobDescriptionId: input.jobDescriptionId,
      force,
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    },
    lifecycleDeps,
  );
}
