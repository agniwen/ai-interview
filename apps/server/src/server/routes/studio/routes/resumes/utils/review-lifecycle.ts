import type {
  CandidateOutcome,
  PipelineStage,
  ResumeParseStatus,
} from "@app/db-schema/studio-interviews";
import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { ResumeReview } from "@app/db-schema/resume-review";
import type { StructuredResumeEvaluationV1 } from "@app/db-schema/structured-resume-evaluation";
import type { QualitativeResumeEvaluation } from "@app/db-schema/qualitative-resume-evaluation";
import type { StructuredResumeSummaryFields } from "@app/shared/structured-resume-scoring";
import { computeResumeEvaluationInputHash } from "../../../../../../lib/server/resume-evaluation-input-hash";
import type { ResumeScreeningResult } from "@app/shared/resume-screening";

export type GeneratedResumeAssessment =
  | {
      mode: "legacy";
      resumeReview: ResumeReview;
      review: string;
      screeningResult: ResumeScreeningResult;
    }
  | {
      evaluation: StructuredResumeEvaluationV1;
      mode: "structured";
      summaries: StructuredResumeSummaryFields;
    }
  | {
      evaluation: QualitativeResumeEvaluation;
      jobDescriptionVersionId: string;
      mode: "qualitative";
    };

export interface ResumeAssessmentRecord {
  jobDescriptionId: string | null;
  evaluationMode: "legacy" | "qualitative" | "structured" | null;
  qualitativeAttemptJobDescriptionVersionId: string | null;
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeEvaluationArtifactMode: "legacy" | "qualitative" | "structured" | null;
  resumeEvaluationAttemptMode: "legacy" | "qualitative" | "structured" | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  resumeParseStatus: ResumeParseStatus;
  resumeContentHash: string | null;
  resumeProfile: ResumeProfile | null;
  resumeReview: ResumeReview | null;
  resumeReviewQueuedAt: Date | null;
  resumeReviewRunId: string | null;
  resumeScreeningResult: ResumeScreeningResult | null;
  resumeText: string | null;
  structuredResumeEvaluation: StructuredResumeEvaluationV1 | null;
}

interface ResumeAssessmentLifecycleKey {
  organizationId: string;
  resumeRecordId: string;
}

interface ResumeAssessmentGuard {
  expectedJobDescriptionId: string | null;
  runId: string;
}

export interface ResumeAssessmentLifecycleDeps {
  generate: (input: {
    evaluationAsOf: string;
    jobDescriptionId: string;
    organizationId: string;
    resumeContentHash: string | null;
    resumeProfile: ResumeProfile;
    resumeInputHash: string;
    resumeText: string | null;
    runId: string;
    jobDescriptionVersionId?: string;
  }) => Promise<GeneratedResumeAssessment>;
  loadRecord: (input: ResumeAssessmentLifecycleKey) => Promise<ResumeAssessmentRecord | null>;
  markExistingReady: (
    input: ResumeAssessmentLifecycleKey & {
      expectedJobDescriptionId: string | null;
      hasScreeningResult: boolean;
      mode: "legacy" | "qualitative" | "structured";
    },
  ) => Promise<boolean>;
  markFailed: (
    input: ResumeAssessmentLifecycleKey & {
      errorMessage: string;
      expectedJobDescriptionId: string | null;
      mode: "legacy" | "qualitative" | "structured";
      runId?: string;
    },
  ) => Promise<boolean>;
  markProcessing: (
    input: ResumeAssessmentLifecycleKey &
      ResumeAssessmentGuard & {
        mode: "legacy" | "qualitative" | "structured";
      },
  ) => Promise<boolean>;
  markReady: (
    input: ResumeAssessmentLifecycleKey &
      ResumeAssessmentGuard & { assessment: GeneratedResumeAssessment },
  ) => Promise<boolean>;
}

export type ResumeAssessmentLifecycleResult =
  | { errorMessage: string; status: "failed" }
  | { status: "ready" }
  | {
      reason: "already_ready" | "missing_record" | "stale_job_description" | "superseded";
      status: "skipped";
    };

function resolveExistingAssessment(input: {
  deps: ResumeAssessmentLifecycleDeps;
  force: boolean;
  key: ResumeAssessmentLifecycleKey;
  record: ResumeAssessmentRecord;
}): Extract<ResumeAssessmentLifecycleResult, { status: "skipped" }> | null {
  let hasCurrentArtifact: boolean;
  if (input.record.resumeEvaluationArtifactMode === "structured") {
    hasCurrentArtifact = Boolean(input.record.structuredResumeEvaluation);
  } else if (input.record.resumeEvaluationArtifactMode === "qualitative") {
    hasCurrentArtifact = Boolean(input.record.qualitativeResumeEvaluation);
  } else if (input.record.resumeEvaluationArtifactMode === "legacy") {
    hasCurrentArtifact = Boolean(input.record.resumeReview);
  } else {
    hasCurrentArtifact =
      Boolean(input.record.qualitativeResumeEvaluation) ||
      Boolean(input.record.structuredResumeEvaluation) ||
      Boolean(input.record.resumeReview);
  }
  if (input.force || !hasCurrentArtifact || !input.record.evaluationMode) {
    return null;
  }
  return { reason: "already_ready", status: "skipped" };
}

// oxlint-disable-next-line complexity -- guards explicitly encode the persisted evaluation state machine.
export async function runResumeAssessmentLifecycle(
  input: ResumeAssessmentLifecycleKey & {
    expectedJobDescriptionId?: string | null;
    expectedRunId?: string;
    force: boolean;
    hasAttemptsRemaining?: boolean;
  },
  deps: ResumeAssessmentLifecycleDeps,
): Promise<ResumeAssessmentLifecycleResult> {
  const key = {
    organizationId: input.organizationId,
    resumeRecordId: input.resumeRecordId,
  };
  const record = await deps.loadRecord(key);
  if (!record) {
    return { reason: "missing_record", status: "skipped" };
  }
  if (
    input.expectedJobDescriptionId !== undefined &&
    record.jobDescriptionId !== input.expectedJobDescriptionId
  ) {
    return { reason: "stale_job_description", status: "skipped" };
  }
  if (input.expectedRunId !== undefined && record.resumeReviewRunId !== input.expectedRunId) {
    return { reason: "superseded", status: "skipped" };
  }
  const existingAssessment = await resolveExistingAssessment({
    deps,
    force: input.force,
    key,
    record,
  });
  if (existingAssessment) {
    return existingAssessment;
  }
  if (!record.resumeProfile || record.resumeParseStatus !== "ready") {
    const error = new Error("简历解析完成后才能重新评估。");
    const marked = await deps.markFailed({
      ...key,
      errorMessage: error.message,
      expectedJobDescriptionId: record.jobDescriptionId,
      mode: record.resumeEvaluationAttemptMode ?? record.evaluationMode ?? "legacy",
    });
    if (!marked) {
      return { reason: "stale_job_description", status: "skipped" };
    }
    if (input.force) {
      throw error;
    }
    return { errorMessage: error.message, status: "failed" };
  }
  if (input.force && (record.pipelineStage === "closed" || record.outcome !== "in_pipeline")) {
    throw new Error("已结束候选人不能重新评估。");
  }
  if (!record.jobDescriptionId || !record.evaluationMode) {
    throw new Error("请先关联在招岗位后再重新评估。");
  }
  if (!record.resumeReviewRunId || !record.resumeReviewQueuedAt) {
    throw new Error("评估任务缺少已持久化的运行标识。");
  }
  const attemptMode = record.resumeEvaluationAttemptMode ?? record.evaluationMode;
  const guard = {
    expectedJobDescriptionId: record.jobDescriptionId,
    runId: record.resumeReviewRunId,
  };
  try {
    if (attemptMode === "qualitative" && !record.qualitativeAttemptJobDescriptionVersionId) {
      throw new Error("评估任务缺少岗位 JD 快照。");
    }
    if (
      !(await deps.markProcessing({
        ...key,
        ...guard,
        mode: attemptMode,
      }))
    ) {
      return { reason: "stale_job_description", status: "skipped" };
    }
    const resumeInputHash = computeResumeEvaluationInputHash({
      resumeContentHash: record.resumeContentHash,
      resumeProfile: record.resumeProfile,
      resumeText: record.resumeText,
    });
    const assessment = await deps.generate({
      evaluationAsOf: record.resumeReviewQueuedAt.toISOString().slice(0, 10),
      jobDescriptionId: record.jobDescriptionId,
      jobDescriptionVersionId: record.qualitativeAttemptJobDescriptionVersionId ?? undefined,
      organizationId: input.organizationId,
      resumeContentHash: record.resumeContentHash,
      resumeInputHash,
      resumeProfile: record.resumeProfile,
      resumeText: record.resumeText,
      runId: record.resumeReviewRunId,
    });
    if (assessment.mode !== attemptMode) {
      throw new Error("评估结果模式与本次评估模式不一致。");
    }
    const committed = await deps.markReady({ ...key, ...guard, assessment });
    return committed ? { status: "ready" } : { reason: "superseded", status: "skipped" };
  } catch (error) {
    if (input.hasAttemptsRemaining) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const committed = await deps.markFailed({
      ...key,
      ...guard,
      errorMessage,
      mode: attemptMode,
    });
    if (!committed) {
      return { reason: "superseded", status: "skipped" };
    }
    throw error;
  }
}
