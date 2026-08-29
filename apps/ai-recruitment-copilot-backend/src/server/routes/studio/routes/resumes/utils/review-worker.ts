/* oxlint-disable import/consistent-type-specifier-style -- value and type imports share review-lifecycle to avoid duplicate module imports. */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  jobDescription,
  resumeEvaluationFailure,
  resumeEvaluationVersion,
  resumePoolItem,
  studioInterview,
} from "@arc/db-schema/schema";
import type { JsonValue } from "@arc/db-schema/json";
import type { ResumeReviewGenerationJobData } from "@arc/resume-parse-queue/resume-review-generation";
import { resumeScreeningResultSchema } from "@arc/shared/resume-screening";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
  qualitativeResumeEvaluationV2Schema,
} from "@arc/db-schema/qualitative-resume-evaluation";
import { deriveStructuredResumeSummaries } from "@arc/shared/structured-resume-scoring";
import { computeResumeEvaluationInputHash } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-evaluation-input-hash";
import { matchJobDescriptionForResume } from "@arc/ai-recruitment-copilot-backend/server/agents/job-description-match-agent";
import { matchNewMailResumePoolItem } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/utils/job-match/service";
import {
  listRecruitingJobDescriptions,
  loadRecruitingJobDescriptionById,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { generateResumeAssessment } from "./review-generation";
import { generateCandidateInterviewQuestions } from "./candidate-question-generation";
import {
  runResumeAssessmentLifecycle,
  type GeneratedResumeAssessment,
  type ResumeAssessmentLifecycleDeps,
} from "./review-lifecycle";
import { buildPreQualitativeEvaluationArchive } from "./resume-evaluation-history";
import { ensureCurrentJobDescriptionVersion } from "./job-description-version";

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

function parseResumeScreeningResult(value: JsonValue | null): ResumeScreeningResult | null {
  const parsed = resumeScreeningResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
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
        qualitativeAttemptJobDescriptionVersionId:
          studioInterview.qualitativeAttemptJobDescriptionVersionId,
        qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
        resumeContentHash: studioInterview.resumeContentHash,
        resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
        resumeEvaluationAttemptMode: studioInterview.resumeEvaluationAttemptMode,
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
          resumeScreeningResult: parseResumeScreeningResult(record.resumeScreeningResult),
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
        resumeEvaluationArtifactMode: input.mode,
        resumeEvaluationAttemptMode: input.mode,
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
    const { runId } = input;
    if (input.mode === "qualitative" && runId) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            jobDescriptionVersionId: studioInterview.qualitativeAttemptJobDescriptionVersionId,
          })
          .from(studioInterview)
          .where(guardedRecordWhere({ ...input, runId }))
          .limit(1)
          .for("update");
        if (!current?.jobDescriptionVersionId) {
          return false;
        }
        await tx
          .insert(resumeEvaluationFailure)
          .values({
            contractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
            createdAt: new Date(),
            errorMessage,
            id: crypto.randomUUID(),
            jobDescriptionVersionId: current.jobDescriptionVersionId,
            organizationId: input.organizationId,
            resumeRecordId: input.resumeRecordId,
            runId,
          })
          .onConflictDoNothing();
        const updated = await tx
          .update(studioInterview)
          .set({
            qualitativeAttemptJobDescriptionVersionId: null,
            resumeReviewError: errorMessage,
            resumeReviewStatus: "failed",
            updatedAt: new Date(),
          })
          .where(guardedRecordWhere({ ...input, runId }))
          .returning({ id: studioInterview.id });
        return updated.length > 0;
      });
    }
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
        qualitativeAttemptJobDescriptionVersionId: input.mode === "qualitative" ? null : undefined,
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
    if (input.assessment.mode === "qualitative") {
      const { assessment } = input;
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({
            notes: studioInterview.notes,
            qualitativeAttemptJobDescriptionVersionId:
              studioInterview.qualitativeAttemptJobDescriptionVersionId,
            qualitativeJobDescriptionVersionId: studioInterview.qualitativeJobDescriptionVersionId,
            qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
            resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
            resumeReview: studioInterview.resumeReview,
            resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
            resumeReviewRunId: studioInterview.resumeReviewRunId,
            structuredCompositeScore: studioInterview.structuredCompositeScore,
            structuredResumeEvaluation: studioInterview.structuredResumeEvaluation,
          })
          .from(studioInterview)
          .where(recordWhere(input))
          .limit(1)
          .for("update");
        if (
          !current ||
          current.resumeReviewRunId !== input.runId ||
          current.qualitativeAttemptJobDescriptionVersionId !== assessment.jobDescriptionVersionId
        ) {
          return false;
        }

        const evaluation = qualitativeResumeEvaluationV2Schema.parse(assessment.evaluation);
        if (current.resumeEvaluationArtifactMode !== "qualitative") {
          const archive = buildPreQualitativeEvaluationArchive({
            organizationId: input.organizationId,
            record: current,
            resumeRecordId: input.resumeRecordId,
          });
          if (archive) {
            await tx.insert(resumeEvaluationVersion).values(archive).onConflictDoNothing();
          }
        }
        await tx.insert(resumeEvaluationVersion).values({
          // SAFETY: The strict qualitative schema has already parsed this JSON-compatible object.
          artifact: evaluation as JsonValue,
          contractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
          createdAt: now,
          id: crypto.randomUUID(),
          jobDescriptionVersionId: assessment.jobDescriptionVersionId,
          numericScore: null,
          organizationId: input.organizationId,
          recommendationLevel: evaluation.recommendationLevel,
          resumeRecordId: input.resumeRecordId,
          runId: input.runId,
        });
        const updated = await tx
          .update(studioInterview)
          .set({
            qualitativeAttemptJobDescriptionVersionId: null,
            qualitativeJobDescriptionVersionId: assessment.jobDescriptionVersionId,
            qualitativeRecommendationLevel: evaluation.recommendationLevel,
            qualitativeResumeEvaluation: evaluation,
            resumeEvaluationArtifactMode: "qualitative",
            resumeEvaluationAttemptMode: "qualitative",
            resumeReview: null,
            resumeReviewError: null,
            resumeReviewGeneratedAt: now,
            resumeReviewRunId: null,
            resumeReviewStatus: "ready",
            resumeScreeningError: null,
            resumeScreeningEvaluatedAt: null,
            resumeScreeningResult: null,
            resumeScreeningStatus: "idle",
            structuredCompositeScore: null,
            structuredGateSortRank: null,
            structuredGateStatus: null,
            structuredResumeEvaluation: null,
            structuredScoreGrade: null,
            updatedAt: now,
          })
          .where(guardedRecordWhere(input))
          .returning({ id: studioInterview.id });
        return updated.length > 0;
      });
    }
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
            resumeEvaluationArtifactMode: "structured",
            resumeEvaluationAttemptMode: "structured",
            resumeReview: null,
            resumeReviewError: null,
            resumeReviewGeneratedAt: now,
            resumeReviewRunId: null,
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
        resumeEvaluationArtifactMode: "legacy",
        resumeEvaluationAttemptMode: "legacy",
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
  resumeFileName: string | null;
  resumeProfile: NonNullable<typeof studioInterview.$inferSelect.resumeProfile>;
}): Promise<string | null> {
  try {
    const jobDescriptions = await listRecruitingJobDescriptions(input.organizationId);
    const match = await matchJobDescriptionForResume(input.resumeProfile, jobDescriptions, {
      resumeFileName: input.resumeFileName,
    });
    return match?.jobDescriptionId ?? null;
  } catch (error) {
    console.warn("[resume-review-worker] auto JD match failed", error);
    return null;
  }
}

async function resolveRecordJobDescriptionId(
  input: Extract<
    ResumeReviewGenerationJobData,
    { source: "reassess" | "resume_pool_import" | "resume_upload" }
  >,
): Promise<string | null> {
  if (!(input.source === "resume_upload" && input.autoMatchJobDescription)) {
    return input.jobDescriptionId;
  }
  const [record] = await db
    .select({
      jobDescriptionId: studioInterview.jobDescriptionId,
      resumeFileName: studioInterview.resumeFileName,
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
    resumeFileName: record.resumeFileName,
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

export interface ResumePoolAssessmentGenerationDependencies {
  generateAssessment: typeof generateResumeAssessment;
}

const defaultResumePoolAssessmentGenerationDependencies: ResumePoolAssessmentGenerationDependencies =
  {
    generateAssessment: generateResumeAssessment,
  };

export function generateResumePoolAssessment(
  input: {
    evaluationAsOf: string;
    jobDescriptionId: string;
    jobDescriptionVersionId: string;
    organizationId: string;
    resumeContentHash: string | null;
    resumeInputHash: string;
    resumeProfile: NonNullable<typeof resumePoolItem.$inferSelect.resumeProfile>;
    resumeText: string | null;
    runId: string;
  },
  dependencies: ResumePoolAssessmentGenerationDependencies = defaultResumePoolAssessmentGenerationDependencies,
): Promise<GeneratedResumeAssessment> {
  return dependencies.generateAssessment(input);
}

// oxlint-disable-next-line complexity -- matching, stale-work guards, and conditional generation form one job boundary.
async function processResumePoolReviewGenerationJob(
  input: Extract<ResumeReviewGenerationJobData, { source: "resume_pool_upload" }>,
): Promise<void> {
  const [record] = await db
    .select({
      jobDescriptionId: resumePoolItem.jobDescriptionId,
      qualitativeJobDescriptionVersionId: resumePoolItem.qualitativeJobDescriptionVersionId,
      qualitativeResumeEvaluation: resumePoolItem.qualitativeResumeEvaluation,
      resumeContentHash: resumePoolItem.resumeContentHash,
      resumeEvaluationContractVersion: resumePoolItem.resumeEvaluationContractVersion,
      resumeEvaluationInputHash: resumePoolItem.resumeEvaluationInputHash,
      resumeFileName: resumePoolItem.resumeFileName,
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
  const mailMatch = input.generationToken
    ? await matchNewMailResumePoolItem({
        batchItemId: input.generationToken,
        organizationId: input.organizationId,
        poolItemId: input.poolItemId,
      })
    : { handled: false, jobDescriptionId: null };
  if (mailMatch.handled) {
    ({ jobDescriptionId } = mailMatch);
  } else if (input.autoMatchJobDescription && !jobDescriptionId) {
    jobDescriptionId = await matchJobDescriptionId({
      organizationId: input.organizationId,
      resumeFileName: record.resumeFileName,
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
  if (!job) {
    return;
  }
  const snapshot = await db.transaction((tx) =>
    ensureCurrentJobDescriptionVersion(tx, {
      jobDescriptionId,
      organizationId: input.organizationId,
    }),
  );
  if (!snapshot) {
    return;
  }
  const resumeInputHash = computeResumeEvaluationInputHash({
    resumeContentHash: record.resumeContentHash,
    resumeProfile: record.resumeProfile,
    resumeText: record.resumeText,
  });
  if (
    record.resumeEvaluationContractVersion === QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION &&
    record.qualitativeJobDescriptionVersionId === snapshot.id &&
    record.resumeEvaluationInputHash === resumeInputHash &&
    qualitativeResumeEvaluationV2Schema.safeParse(record.qualitativeResumeEvaluation).success
  ) {
    return;
  }
  const runId = crypto.randomUUID();
  const generatedAt = new Date();
  const generated = await generateResumePoolAssessment({
    evaluationAsOf: generatedAt.toISOString().slice(0, 10),
    jobDescriptionId,
    jobDescriptionVersionId: snapshot.id,
    organizationId: input.organizationId,
    resumeContentHash: record.resumeContentHash,
    resumeInputHash,
    resumeProfile: record.resumeProfile,
    resumeText: record.resumeText,
    runId,
  });
  if (generated.mode !== "qualitative") {
    throw new Error("AI 分析生成失败。");
  }
  const evaluation = qualitativeResumeEvaluationV2Schema.parse(generated.evaluation);
  await db
    .update(resumePoolItem)
    .set({
      qualitativeJobDescriptionVersionId: generated.jobDescriptionVersionId,
      qualitativeRecommendationLevel: evaluation.recommendationLevel,
      qualitativeResumeEvaluation: evaluation,
      qualitativeResumeSummary: evaluation.conciseOverall,
      resumeEvaluationContractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
      resumeEvaluationGeneratedAt: generatedAt,
      resumeEvaluationInputHash: resumeInputHash,
      updatedAt: generatedAt,
    })
    .where(
      and(
        eq(resumePoolItem.id, input.poolItemId),
        eq(resumePoolItem.organizationId, input.organizationId),
        eq(resumePoolItem.jobDescriptionId, jobDescriptionId),
        eq(resumePoolItem.resumeProfile, record.resumeProfile),
      ),
    );
}

export interface ResumeReviewWorkerDependencies {
  generateCandidateInterviewQuestions: typeof generateCandidateInterviewQuestions;
  processResumePoolReviewGeneration: typeof processResumePoolReviewGenerationJob;
  resolveRecordJobDescription: typeof resolveRecordJobDescriptionId;
  runAssessmentLifecycle: typeof runResumeAssessmentLifecycle;
}

const defaultResumeReviewWorkerDependencies: ResumeReviewWorkerDependencies = {
  generateCandidateInterviewQuestions,
  processResumePoolReviewGeneration: processResumePoolReviewGenerationJob,
  resolveRecordJobDescription: resolveRecordJobDescriptionId,
  runAssessmentLifecycle: runResumeAssessmentLifecycle,
};

export async function processResumeReviewGenerationJob(
  input: ResumeReviewGenerationJobData,
  dependencies = defaultResumeReviewWorkerDependencies,
) {
  if (input.source === "resume_pool_import_questions") {
    return dependencies.generateCandidateInterviewQuestions({
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
  }
  if (input.source === "resume_pool_upload") {
    return dependencies.processResumePoolReviewGeneration(input);
  }
  const force = Boolean(input.force) || input.source === "reassess";
  const jobDescriptionId = await dependencies.resolveRecordJobDescription(input);
  return dependencies.runAssessmentLifecycle(
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
