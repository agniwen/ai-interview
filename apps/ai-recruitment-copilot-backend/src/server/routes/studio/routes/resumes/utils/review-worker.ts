import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { resumePoolItem, studioInterview } from "@arc/db-schema/schema";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import { listAllJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
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

async function matchJobDescriptionId(input: {
  organizationId: string;
  resumeProfile: NonNullable<typeof studioInterview.$inferSelect.resumeProfile>;
}): Promise<string | null> {
  try {
    const jobDescriptions = await listAllJobDescriptions(input.organizationId);
    const match = await matchJobDescriptionForResume(input.resumeProfile, jobDescriptions);
    return match?.jobDescriptionId ?? null;
  } catch (error) {
    console.warn("[resume-review-worker] auto JD match failed", error);
    return null;
  }
}

async function resolveRecordJobDescriptionId(
  input: Exclude<ResumeReviewGenerationJobData, { source: "resume_pool_upload" }>,
): Promise<string | null> {
  if (!(input.source === "resume_upload" && input.autoMatchJobDescription)) {
    return input.jobDescriptionId;
  }
  const [record] = await db
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .where(recordWhere(input))
    .limit(1);
  if (!record?.resumeProfile || record.jobDescriptionId) {
    return record?.jobDescriptionId ?? null;
  }
  const matchedId = await matchJobDescriptionId({
    organizationId: input.organizationId,
    resumeProfile: record.resumeProfile,
  });
  if (!matchedId) {
    return null;
  }
  const updated = await db
    .update(studioInterview)
    .set({ jobDescriptionId: matchedId, updatedAt: new Date() })
    .where(and(recordWhere(input), isNull(studioInterview.jobDescriptionId)))
    .returning({ jobDescriptionId: studioInterview.jobDescriptionId });
  if (updated[0]?.jobDescriptionId) {
    return updated[0].jobDescriptionId;
  }
  const [current] = await db
    .select({ jobDescriptionId: studioInterview.jobDescriptionId })
    .from(studioInterview)
    .where(recordWhere(input))
    .limit(1);
  return current?.jobDescriptionId ?? null;
}

async function processResumePoolReviewGenerationJob(
  input: Extract<ResumeReviewGenerationJobData, { source: "resume_pool_upload" }>,
): Promise<void> {
  const [record] = await db
    .select({
      jobDescriptionId: resumePoolItem.jobDescriptionId,
      resumeParseStatus: resumePoolItem.resumeParseStatus,
      resumeProfile: resumePoolItem.resumeProfile,
      resumeText: resumePoolItem.resumeText,
    })
    .from(resumePoolItem)
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        eq(resumePoolItem.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!record?.resumeProfile || record.resumeParseStatus !== "ready") {
    return;
  }
  let { jobDescriptionId } = record;
  if (input.autoMatchJobDescription && !jobDescriptionId) {
    jobDescriptionId = await matchJobDescriptionId({
      organizationId: input.organizationId,
      resumeProfile: record.resumeProfile,
    });
    if (jobDescriptionId) {
      const updated = await db
        .update(resumePoolItem)
        .set({ jobDescriptionId, updatedAt: new Date() })
        .where(
          and(
            eq(resumePoolItem.id, input.poolItemId),
            eq(resumePoolItem.organizationId, input.organizationId),
            isNull(resumePoolItem.jobDescriptionId),
          ),
        )
        .returning({ jobDescriptionId: resumePoolItem.jobDescriptionId });
      jobDescriptionId = updated[0]?.jobDescriptionId ?? null;
    }
  }
  if (
    !jobDescriptionId ||
    (input.jobDescriptionId && jobDescriptionId !== input.jobDescriptionId)
  ) {
    return;
  }
  const generated = await generateResumeReviewBestEffort({
    jobDescriptionId,
    logPrefix: "[resume-pool-review-worker]",
    organizationId: input.organizationId,
    resumeProfile: record.resumeProfile,
    resumeText: record.resumeText,
  });
  if (!generated) {
    throw new Error("AI 分析生成失败。");
  }
  await db
    .update(resumePoolItem)
    .set({ notes: generated.review, updatedAt: new Date() })
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        eq(resumePoolItem.organizationId, input.organizationId),
        eq(resumePoolItem.jobDescriptionId, jobDescriptionId),
        eq(resumePoolItem.resumeProfile, record.resumeProfile),
      ),
    );
}

export async function processResumeReviewGenerationJob(input: ResumeReviewGenerationJobData) {
  if (input.source === "resume_pool_upload") {
    return processResumePoolReviewGenerationJob(input);
  }
  const force = Boolean(input.force) || input.source === "reassess";
  const jobDescriptionId = await resolveRecordJobDescriptionId(input);
  return runResumeAssessmentLifecycle(
    {
      expectedJobDescriptionId: jobDescriptionId,
      force,
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    },
    lifecycleDeps,
  );
}
