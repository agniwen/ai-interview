import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { jobDescription, resumePoolItem, studioInterview } from "@arc/db-schema/schema";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import { deriveStructuredResumeSummaries } from "@arc/shared/structured-resume-scoring";
import { computeResumeEvaluationInputHash } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-evaluation-input-hash";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  generateLegacyResumeReviewBestEffort,
  generateResumeAssessment,
} from "./review-generation";
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
  generate: (input) =>
    generateResumeAssessment({
      ...input,
    }),
  loadRecord: async (input) => {
    const [record] = await db
      .select({
        evaluationMode: jobDescription.evaluationMode,
        jobDescriptionId: studioInterview.jobDescriptionId,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
        resumeContentHash: studioInterview.resumeContentHash,
        resumeParseStatus: studioInterview.resumeParseStatus,
        resumeProfile: studioInterview.resumeProfile,
        resumeReview: studioInterview.resumeReview,
        resumeReviewQueuedAt: studioInterview.resumeReviewQueuedAt,
        resumeReviewRunId: studioInterview.resumeReviewRunId,
        resumeScreeningResult: studioInterview.resumeScreeningResult,
        resumeText: studioInterview.resumeText,
        structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
      })
      .from(studioInterview)
      .leftJoin(jobDescription, eq(studioInterview.jobDescriptionId, jobDescription.id))
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
    const lifecycleValues =
      input.mode === "legacy"
        ? {
            resumeScreeningError: null,
            resumeScreeningStatus: input.hasScreeningResult
              ? ("ready" as const)
              : ("idle" as const),
          }
        : {};
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewGeneratedAt: now,
        resumeReviewStatus: "ready",
        ...lifecycleValues,
        updatedAt: now,
      })
      .where(guardedRecordWhere({ ...input, runId: null }))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markFailed: async (input) => {
    const errorMessage = input.errorMessage.slice(0, 1000);
    const modeValues =
      input.mode === "legacy"
        ? {
            resumeScreeningError: errorMessage,
            resumeScreeningStatus: "failed" as const,
          }
        : {};
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: errorMessage,
        resumeReviewStatus: "failed",
        ...modeValues,
        updatedAt: new Date(),
      })
      .where(guardedRecordWhere({ ...input, runId: input.runId ?? null }))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markProcessing: async (input) => {
    const now = new Date();
    const modeValues =
      input.mode === "legacy"
        ? {
            resumeScreeningError: null,
            resumeScreeningStatus: "processing" as const,
          }
        : {};
    const updated = await db
      .update(studioInterview)
      .set({
        resumeReviewError: null,
        resumeReviewStatus: "processing",
        ...modeValues,
        updatedAt: now,
      })
      .where(guardedRecordWhere(input))
      .returning({ id: studioInterview.id });
    return updated.length > 0;
  },
  markReady: async (input) => {
    const now = new Date();
    if (input.assessment.mode === "structured") {
      const { assessment } = input;
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            jobDescriptionId: studioInterview.jobDescriptionId,
            resumeContentHash: studioInterview.resumeContentHash,
            resumeProfile: studioInterview.resumeProfile,
            resumeReviewRunId: studioInterview.resumeReviewRunId,
            resumeText: studioInterview.resumeText,
          })
          .from(studioInterview)
          .where(recordWhere(input))
          .limit(1)
          .for("update");
        if (
          !current?.resumeProfile ||
          current.jobDescriptionId !== input.expectedJobDescriptionId ||
          current.resumeReviewRunId !== input.runId
        ) {
          return false;
        }
        const evaluation = structuredResumeEvaluationV1Schema.parse(assessment.evaluation);
        const currentInputHash = computeResumeEvaluationInputHash({
          resumeContentHash: current.resumeContentHash,
          resumeProfile: current.resumeProfile,
          resumeText: current.resumeText,
        });
        if (
          evaluation.runId !== input.runId ||
          evaluation.jobId !== current.jobDescriptionId ||
          evaluation.inputHash !== currentInputHash
        ) {
          return false;
        }
        const [job] = await tx
          .select({
            evaluationBlueprintHash: jobDescription.evaluationBlueprintHash,
            evaluationMode: jobDescription.evaluationMode,
            lifecycleStatus: jobDescription.lifecycleStatus,
          })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.id, current.jobDescriptionId),
              eq(jobDescription.organizationId, input.organizationId),
            ),
          )
          .limit(1)
          .for("update");
        if (
          !job ||
          job.evaluationMode !== "structured" ||
          job.lifecycleStatus !== "published" ||
          job.evaluationBlueprintHash !== evaluation.blueprintHash
        ) {
          return false;
        }
        const summaries = deriveStructuredResumeSummaries(evaluation);
        const updated = await tx
          .update(studioInterview)
          .set({
            notes: null,
            resumeReview: null,
            resumeReviewError: null,
            resumeReviewGeneratedAt: now,
            resumeReviewStatus: "ready",
            resumeScreeningError: null,
            resumeScreeningEvaluatedAt: null,
            resumeScreeningResult: null,
            resumeScreeningStatus: "idle",
            structuredCompositeScore: summaries.compositeScore,
            structuredGateSortRank: summaries.gateSortRank,
            structuredGateStatus: summaries.gateStatus,
            structuredResumeEvaluation: evaluation,
            structuredScoreGrade: summaries.grade,
            updatedAt: now,
          })
          .where(guardedRecordWhere(input))
          .returning({ id: studioInterview.id });
        return updated.length > 0;
      });
    }
    const updated = await db
      .update(studioInterview)
      .set({
        notes: input.assessment.review,
        resumeReview: input.assessment.resumeReview,
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
    const jobDescriptions = await listRecruitingJobDescriptions(input.organizationId);
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
  const job = await loadRecruitingJobDescriptionById(input.organizationId, jobDescriptionId);
  if (!job || job.evaluationMode === "structured") {
    return;
  }
  const generated = await generateLegacyResumeReviewBestEffort({
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
      expectedRunId: input.runId,
      force,
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    },
    lifecycleDeps,
  );
}
