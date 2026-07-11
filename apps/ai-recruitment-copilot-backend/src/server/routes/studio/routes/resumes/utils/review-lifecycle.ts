import type {
  CandidateOutcome,
  PipelineStage,
  ResumeParseStatus,
} from "@arc/db-schema/studio-interviews";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/db-schema/resume-review";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";

export interface ResumeAssessment {
  review: string;
  screeningResult: ResumeScreeningResult;
  structuredReview: ResumeReview;
}

export interface ResumeAssessmentRecord {
  jobDescriptionId: string | null;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  resumeParseStatus: ResumeParseStatus;
  resumeProfile: ResumeProfile | null;
  resumeReview: ResumeReview | null;
  resumeScreeningResult: ResumeScreeningResult | null;
  resumeText: string | null;
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
    jobDescriptionId: string | null;
    organizationId: string;
    resumeProfile: ResumeProfile;
    resumeText: string | null;
  }) => Promise<ResumeAssessment>;
  loadRecord: (input: ResumeAssessmentLifecycleKey) => Promise<ResumeAssessmentRecord | null>;
  markExistingReady: (
    input: ResumeAssessmentLifecycleKey & {
      expectedJobDescriptionId: string | null;
      hasScreeningResult: boolean;
    },
  ) => Promise<boolean>;
  markFailed: (
    input: ResumeAssessmentLifecycleKey & {
      errorMessage: string;
      expectedJobDescriptionId: string | null;
      runId?: string;
    },
  ) => Promise<boolean>;
  markProcessing: (input: ResumeAssessmentLifecycleKey & ResumeAssessmentGuard) => Promise<boolean>;
  markReady: (
    input: ResumeAssessmentLifecycleKey & ResumeAssessmentGuard & { assessment: ResumeAssessment },
  ) => Promise<boolean>;
}

export type ResumeAssessmentLifecycleResult =
  | { errorMessage: string; status: "failed" }
  | { status: "ready" }
  | {
      reason: "already_ready" | "missing_record" | "stale_job_description" | "superseded";
      status: "skipped";
    };

async function resolveExistingAssessment(input: {
  deps: ResumeAssessmentLifecycleDeps;
  force: boolean;
  key: ResumeAssessmentLifecycleKey;
  record: ResumeAssessmentRecord;
}): Promise<Extract<ResumeAssessmentLifecycleResult, { status: "skipped" }> | null> {
  if (input.force || !input.record.resumeReview) {
    return null;
  }
  const marked = await input.deps.markExistingReady({
    ...input.key,
    expectedJobDescriptionId: input.record.jobDescriptionId,
    hasScreeningResult: Boolean(input.record.resumeScreeningResult),
  });
  return marked
    ? { reason: "already_ready", status: "skipped" }
    : { reason: "stale_job_description", status: "skipped" };
}

export async function runResumeAssessmentLifecycle(
  input: ResumeAssessmentLifecycleKey & {
    expectedJobDescriptionId?: string | null;
    force: boolean;
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
    throw new Error("已结案候选人不能重新评估。");
  }
  if (input.force && !record.jobDescriptionId) {
    throw new Error("请先关联在招岗位后再重新评估。");
  }

  const guard = {
    expectedJobDescriptionId: record.jobDescriptionId,
    runId: crypto.randomUUID(),
  };
  if (!(await deps.markProcessing({ ...key, ...guard }))) {
    return { reason: "stale_job_description", status: "skipped" };
  }
  try {
    const assessment = await deps.generate({
      jobDescriptionId: record.jobDescriptionId,
      organizationId: input.organizationId,
      resumeProfile: record.resumeProfile,
      resumeText: record.resumeText,
    });
    const committed = await deps.markReady({ ...key, ...guard, assessment });
    return committed ? { status: "ready" } : { reason: "superseded", status: "skipped" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const committed = await deps.markFailed({ ...key, ...guard, errorMessage });
    if (!committed) {
      return { reason: "superseded", status: "skipped" };
    }
    throw error;
  }
}
