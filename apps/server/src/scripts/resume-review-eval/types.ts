import type {
  CandidateOutcome,
  ClosedMeta,
  CloseCategory,
  PipelineStage,
  ResumeEvaluationStatus,
  ResumeReviewStatus,
  ResumeScreeningStatus,
} from "@arc/db-schema/studio-interviews";
import type { ResumeReviewAction, ResumeReviewDimensionKey } from "@arc/shared/resume-review";
import type { ResumeScreeningRecommendation } from "@arc/shared/resume-screening";

export type OutcomeLabel = "negative" | "positive";
export type LabelStrength = "strong" | "weak";
export type LabelReason =
  | "advanced_pipeline"
  | "hired"
  | "screening_rejected"
  | "screening_skills_mismatch";
export type LabelExclusionReason =
  | "archived"
  | "missing_previous_stage"
  | "non_match_rejection"
  | "not_mature"
  | "withdrawn";
export type DatasetExclusionReason =
  | LabelExclusionReason
  | "invalid_review"
  | "missing_base_score"
  | "missing_job_description"
  | "missing_review"
  | "review_not_ready";
export type DatasetQualityIssue =
  | "incomplete_dimensions"
  | "invalid_screening_result"
  | "missing_review_generated_at"
  | "missing_review_run_id";

export interface ResumeReviewEvalRow {
  candidateId: string;
  closedMeta: ClosedMeta | null;
  jobDescriptionId: string | null;
  organizationId: string;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  resumeEvaluationStatus: ResumeEvaluationStatus | null;
  resumeReview: unknown;
  resumeReviewGeneratedAt: Date | string | null;
  resumeReviewRunId: string | null;
  resumeReviewStatus: ResumeReviewStatus;
  resumeScreeningResult: unknown;
  resumeScreeningStatus: ResumeScreeningStatus;
}

export interface ResumeReviewEvalSample {
  action: ResumeReviewAction;
  baseScore: number;
  candidateId: string;
  closeCategory: CloseCategory | null;
  dimensionScores: Partial<Record<ResumeReviewDimensionKey, number>>;
  humanResumeEvaluationStatus: ResumeEvaluationStatus | null;
  jobDescriptionId: string;
  label: OutcomeLabel;
  labelReason: LabelReason;
  labelStrength: LabelStrength;
  organizationId: string;
  outcome: CandidateOutcome;
  pipelineStage: PipelineStage;
  previousStage: PipelineStage | null;
  qualityIssues: DatasetQualityIssue[];
  reviewGeneratedAt: string | null;
  reviewRunId: string | null;
  reviewSchemaVersion: number;
  screeningRecommendation: ResumeScreeningRecommendation | null;
}

export interface DatasetDiagnostics {
  evaluableRows: number;
  exclusionCounts: Partial<Record<DatasetExclusionReason, number>>;
  labelCounts: Partial<Record<`${OutcomeLabel}:${LabelStrength}`, number>>;
  labelEligibleRows: number;
  qualityIssueCounts: Partial<Record<DatasetQualityIssue, number>>;
  totalRows: number;
}

export interface ResumeReviewEvalDataset {
  diagnostics: DatasetDiagnostics;
  samples: ResumeReviewEvalSample[];
}

export interface ActionCounts {
  hold: number;
  interview: number;
  reject: number;
}

export interface ActionConfusion {
  negative: ActionCounts;
  positive: ActionCounts;
}

export interface EvalSliceMetrics {
  actionConfusion: ActionConfusion;
  averagePrecision: number | null;
  brierScore: number | null;
  decisionCoverage: number;
  ece: number | null;
  macroF1OnDecided: number | null;
  negativeCount: number;
  positiveCount: number;
  rocAuc: number | null;
  sampleCount: number;
}

export interface DimensionDelta {
  delta: number | null;
  negativeMean: number | null;
  positiveMean: number | null;
}

export interface PerJobMetrics {
  averagePrecision: number | null;
  hiredCount: number;
  hiredRejectCount: number;
  jobDescriptionId: string;
  negativeCount: number;
  positiveCount: number;
  rocAuc: number | null;
  sampleCount: number;
}

export interface ScoreBin {
  averagePredictedScore: number;
  lowerBound: number;
  positiveRate: number;
  sampleCount: number;
  upperBound: number;
}

export interface ResumeReviewEvalMetrics {
  all: EvalSliceMetrics;
  dimensionDeltas: Partial<Record<ResumeReviewDimensionKey, DimensionDelta>>;
  guardrails: {
    hiredCount: number;
    hiredRejectCount: number;
    hiredRejectRate: number | null;
    positiveRejectRate: number | null;
  };
  perJob: PerJobMetrics[];
  scoreBins: ScoreBin[];
  strong: EvalSliceMetrics;
}
