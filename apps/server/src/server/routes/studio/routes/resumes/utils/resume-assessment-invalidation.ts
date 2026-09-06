import type { RecruitingRecordValues } from "@app/database/recruiting-records";

export const INVALIDATED_AI_RESUME_ASSESSMENT = {
  notes: null,
  qualitativeAttemptJobDescriptionVersionId: null,
  qualitativeJobDescriptionVersionId: null,
  qualitativeRecommendationLevel: null,
  qualitativeResumeEvaluation: null,
  resumeEvaluationArtifactMode: null,
  resumeEvaluationAttemptMode: null,
  resumeReview: null,
  resumeReviewError: null,
  resumeReviewGeneratedAt: null,
  resumeReviewQueuedAt: null,
  resumeReviewRunId: null,
  resumeReviewStatus: "idle" as const,
  resumeScreeningError: null,
  resumeScreeningEvaluatedAt: null,
  resumeScreeningResult: null,
  resumeScreeningStatus: "idle" as const,
  structuredCompositeScore: null,
  structuredGateSortRank: null,
  structuredGateStatus: null,
  structuredResumeEvaluation: null,
  structuredScoreGrade: null,
} satisfies Partial<RecruitingRecordValues>;

export const INVALIDATED_RESUME_ASSESSMENT_FOR_JOB_CHANGE = {
  ...INVALIDATED_AI_RESUME_ASSESSMENT,
  resumeEvaluationStatus: null,
} satisfies Partial<RecruitingRecordValues>;
