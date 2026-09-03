import type { ResumeProfile } from "@app/db-schema/interview/types";
import type {
  ResumeReview,
  ResumeReviewAction,
  ResumeReviewDimensionKey,
} from "@app/shared/resume-review";
import type { ResumeScreeningResult } from "@app/shared/resume-screening";

export interface ScoreBand {
  max: number;
  min: number;
}

export interface SyntheticResumeReviewCase {
  expectations: {
    allowedActions: ResumeReviewAction[];
    dimensionBands: Partial<Record<ResumeReviewDimensionKey, ScoreBand>>;
    rationaleTerms: Partial<Record<ResumeReviewDimensionKey, string[]>>;
  };
  id: string;
  jobDescription: string;
  name: string;
  resumeProfile: ResumeProfile;
  screeningResult?: ResumeScreeningResult;
}

export type SyntheticRunRecord =
  | {
      caseId: string;
      review: ResumeReview;
      runIndex: number;
      status: "success";
    }
  | {
      caseId: string;
      error: string;
      runIndex: number;
      status: "failed";
    };

export interface SyntheticCaseMetrics {
  actionAgreementRate: number;
  allowedActionRate: number;
  baseScoreSpread: number;
  caseId: string;
  caseName: string;
  dimensionBandPassRate: number | null;
  failedRuns: number;
  maxDimensionScoreSpread: number;
  rationaleTermCoverage: number | null;
  successfulRuns: number;
  totalRuns: number;
}

export interface SyntheticEvalMetrics {
  actionAgreementRate: number;
  allowedActionRate: number;
  baseScoreSpreadMax: number;
  dimensionBandPassRate: number | null;
  maxDimensionScoreSpread: number;
  perCase: SyntheticCaseMetrics[];
  rationaleTermCoverage: number | null;
  successRate: number;
  totalRuns: number;
}
