import {
  getResumeReviewBaseScore,
  getResumeReviewDimension,
  RESUME_REVIEW_DIMENSIONS,
  resumeReviewLooseSchema,
} from "@app/shared/resume-review";
import { resumeScreeningResultSchema } from "@app/shared/resume-screening";
import { deriveOutcomeLabel } from "./labels";
import type {
  DatasetDiagnostics,
  DatasetExclusionReason,
  DatasetQualityIssue,
  ResumeReviewEvalDataset,
  ResumeReviewEvalRow,
  ResumeReviewEvalSample,
} from "./types";

function increment<K extends string>(counts: Partial<Record<K, number>>, key: K) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function isoDate(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

// oxlint-disable-next-line complexity -- one pass preserves mutually exclusive exclusion accounting.
export function buildResumeReviewEvalDataset(rows: ResumeReviewEvalRow[]): ResumeReviewEvalDataset {
  const diagnostics: DatasetDiagnostics = {
    evaluableRows: 0,
    exclusionCounts: {},
    labelCounts: {},
    labelEligibleRows: 0,
    qualityIssueCounts: {},
    totalRows: rows.length,
  };
  const samples: ResumeReviewEvalSample[] = [];

  const exclude = (reason: DatasetExclusionReason) =>
    increment(diagnostics.exclusionCounts, reason);

  for (const row of rows) {
    const derived = deriveOutcomeLabel(row);
    if ("excluded" in derived) {
      exclude(derived.excluded);
      continue;
    }
    diagnostics.labelEligibleRows += 1;

    if (!row.jobDescriptionId) {
      exclude("missing_job_description");
      continue;
    }
    if (row.resumeReviewStatus !== "ready") {
      exclude("review_not_ready");
      continue;
    }
    if (!row.resumeReview) {
      exclude("missing_review");
      continue;
    }
    const parsedReview = resumeReviewLooseSchema.safeParse(row.resumeReview);
    if (!parsedReview.success) {
      exclude("invalid_review");
      continue;
    }
    const baseScore = getResumeReviewBaseScore(parsedReview.data);
    if (baseScore === null) {
      exclude("missing_base_score");
      continue;
    }

    const qualityIssues: DatasetQualityIssue[] = [];
    const reviewGeneratedAt = isoDate(row.resumeReviewGeneratedAt);
    if (!reviewGeneratedAt) {
      qualityIssues.push("missing_review_generated_at");
    }
    if (!row.resumeReviewRunId) {
      qualityIssues.push("missing_review_run_id");
    }

    const dimensionScores: ResumeReviewEvalSample["dimensionScores"] = {};
    for (const dimension of RESUME_REVIEW_DIMENSIONS) {
      const value = getResumeReviewDimension(parsedReview.data, dimension.key);
      if (value) {
        dimensionScores[dimension.key] = value.score;
      }
    }
    if (Object.keys(dimensionScores).length !== RESUME_REVIEW_DIMENSIONS.length) {
      qualityIssues.push("incomplete_dimensions");
    }

    let screeningRecommendation: ResumeReviewEvalSample["screeningRecommendation"] = null;
    if (row.resumeScreeningStatus === "ready" && row.resumeScreeningResult) {
      const parsedScreening = resumeScreeningResultSchema.safeParse(row.resumeScreeningResult);
      if (parsedScreening.success) {
        screeningRecommendation = parsedScreening.data.recommendation;
      } else {
        qualityIssues.push("invalid_screening_result");
      }
    }
    for (const issue of qualityIssues) {
      increment(diagnostics.qualityIssueCounts, issue);
    }

    const sample: ResumeReviewEvalSample = {
      action: parsedReview.data.nextStep.action,
      baseScore,
      candidateId: row.candidateId,
      closeCategory: row.closedMeta?.category ?? null,
      dimensionScores,
      humanResumeEvaluationStatus: row.resumeEvaluationStatus,
      jobDescriptionId: row.jobDescriptionId,
      label: derived.label,
      labelReason: derived.reason,
      labelStrength: derived.strength,
      organizationId: row.organizationId,
      outcome: row.outcome,
      pipelineStage: row.pipelineStage,
      previousStage: row.closedMeta?.previousStage ?? null,
      qualityIssues,
      reviewGeneratedAt,
      reviewRunId: row.resumeReviewRunId,
      reviewSchemaVersion: parsedReview.data.schemaVersion,
      screeningRecommendation,
    };
    samples.push(sample);
    increment(diagnostics.labelCounts, `${sample.label}:${sample.labelStrength}`);
  }

  diagnostics.evaluableRows = samples.length;
  return { diagnostics, samples };
}

export async function loadResumeReviewEvalRows(
  organizationId: string,
): Promise<ResumeReviewEvalRow[]> {
  const [{ db }, { studioInterview }, { asc, eq }] = await Promise.all([
    import("../../lib/server/db/index"),
    import("@app/db-schema/schema"),
    import("drizzle-orm"),
  ]);
  return db
    .select({
      candidateId: studioInterview.id,
      closedMeta: studioInterview.closedMeta,
      jobDescriptionId: studioInterview.jobDescriptionId,
      organizationId: studioInterview.organizationId,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      resumeEvaluationStatus: studioInterview.resumeEvaluationStatus,
      resumeReview: studioInterview.resumeReview,
      resumeReviewGeneratedAt: studioInterview.resumeReviewGeneratedAt,
      resumeReviewRunId: studioInterview.resumeReviewRunId,
      resumeReviewStatus: studioInterview.resumeReviewStatus,
      resumeScreeningResult: studioInterview.resumeScreeningResult,
      resumeScreeningStatus: studioInterview.resumeScreeningStatus,
    })
    .from(studioInterview)
    .where(eq(studioInterview.organizationId, organizationId))
    .orderBy(asc(studioInterview.id));
}
