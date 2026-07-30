import type { StructuredResumeDimension } from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "@arc/db-schema/structured-resume-evaluation";

export const STRUCTURED_RULE_STATUS_CLASSES = [
  "insufficient_evidence",
  "matched",
  "not_applicable",
  "not_matched",
] as const;

export type StructuredRuleStatus = (typeof STRUCTURED_RULE_STATUS_CLASSES)[number];

export interface StructuredResumeEvalOutput {
  artifactSchemaValid: boolean;
  compositeScore: number;
  deterministicInvariantsValid: boolean;
  evidenceCitationIntegrity: boolean;
  gateStatus: StructuredResumeGateStatus;
  grade: StructuredResumeGrade;
  ruleJudgments: Record<string, StructuredRuleStatus>;
}

export interface StructuredResumeEvalCase {
  baseline: StructuredResumeEvalOutput;
  caseVersion: string;
  coverage: {
    dimensions: StructuredResumeDimension[];
    gateBoundary: boolean;
    missingEvidence: boolean;
    ruleStatuses: StructuredRuleStatus[];
  };
  gold: Pick<
    StructuredResumeEvalOutput,
    "compositeScore" | "gateStatus" | "grade" | "ruleJudgments"
  >;
  id: string;
  source: {
    contentHash: string;
    kind: "sanitized" | "synthetic";
    sourceAnchor: string;
  };
}

export interface StructuredResumeEvalCandidate {
  candidateVersion: string;
  corpusHash: string;
  engineVersion: string;
  generatedAt: string;
  modelId: string;
  outputs: {
    caseId: string;
    output: StructuredResumeEvalOutput;
  }[];
  promptVersion: string;
  schemaVersion: 1;
}

export interface StructuredResumeEvalThresholds {
  artifactSchemaValidity: number;
  compositeScoreMae: number;
  compositeScoreMaxError: number;
  compositeScoreP95Error: number;
  deterministicInvariants: number;
  evidenceCitationIntegrity: number;
  gradeAgreement: number;
  hardGateAgreement: number;
  perRuleMacroF1: number;
}

export interface StructuredResumeEvalManifest {
  approval: {
    approvedAt: string | null;
    approver: string | null;
    status: "approved" | "pending";
  };
  baselineVersion: string;
  casesFile: string;
  corpusVersion: string;
  engineVersion: string;
  goldLabelVersion: string;
  modelId: string;
  promptVersion: string;
  schemaVersion: 1;
  thresholds: StructuredResumeEvalThresholds;
}

export interface StructuredResumeEvalMetrics {
  artifactSchemaValidity: number;
  compositeScoreMae: number;
  compositeScoreMaxError: number;
  compositeScoreP95Error: number;
  deterministicInvariants: number;
  evidenceCitationIntegrity: number;
  gradeAgreement: number;
  hardGateAgreement: number;
  minimumRuleMacroF1: number;
  perRuleMacroF1: Record<string, number>;
  sampleCount: number;
}

export interface StructuredResumeEvalGateResult {
  failures: string[];
  passed: boolean;
}
