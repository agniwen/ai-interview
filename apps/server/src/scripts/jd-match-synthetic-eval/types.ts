import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import type { JobDescriptionMatchResult } from "../../server/agents/job-description-match-agent";

export interface SyntheticJdMatchCase {
  candidates: JobDescriptionListRecord[];
  expectedId: string;
  id: string;
  name: string;
  reasonTerms: string[];
  resumeProfile: ResumeProfile;
}

export type SyntheticJdMatchRunRecord =
  | {
      caseId: string;
      result: JobDescriptionMatchResult;
      runIndex: number;
      status: "success";
    }
  | {
      caseId: string;
      error: string;
      runIndex: number;
      status: "failed";
    };

export interface SyntheticJdMatchCaseMetrics {
  candidateIdValidityRate: number;
  caseId: string;
  caseName: string;
  expectedHits: number;
  expectedTop1Rate: number;
  failedRuns: number;
  reasonTermCoverage: number;
  selectionAgreementRate: number;
  successfulRuns: number;
  totalRuns: number;
}

export interface SyntheticJdMatchMetrics {
  candidateIdValidityRate: number;
  expectedTop1Rate: number;
  perCase: SyntheticJdMatchCaseMetrics[];
  reasonTermCoverage: number;
  selectionAgreementRate: number;
  successRate: number;
  totalRuns: number;
}
