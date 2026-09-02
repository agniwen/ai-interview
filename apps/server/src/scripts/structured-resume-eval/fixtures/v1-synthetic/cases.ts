import { createHash } from "node:crypto";
import { createDefaultJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import { STRUCTURED_RESUME_DIMENSIONS } from "@app/shared/structured-resume-scoring";
import { computeJobEvaluationPayloadHash } from "../../../../lib/server/job-evaluation-hash";
import type { StructuredResumeEvalCase, StructuredRuleStatus } from "../../types";

const statuses: StructuredRuleStatus[] = [
  "matched",
  "not_matched",
  "insufficient_evidence",
  "not_applicable",
];
const publishedConfig = createDefaultJobDescriptionStructuredConfig();
const blueprint = {
  auxiliarySkills: [],
  compiler: {
    generatedAt: "2026-07-30T00:00:00.000Z",
    modelId: "compiler-model",
    promptVersion: "compiler-v1",
  },
  coreSkills: [],
  dimensionExpectations: {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  },
  educationExpectation: null,
  exclusionConditions: [],
  hardGateRequirements: [],
  priorityConditions: [],
  requiredRelevantExperience: null,
  schemaVersion: 1 as const,
};

function gateStatusFor(index: number) {
  if (index % 5 === 0) {
    return "failed" as const;
  }
  if (index % 5 === 1) {
    return "needs_verification" as const;
  }
  return "passed" as const;
}

function gradeFor(score: number) {
  if (score >= 85) {
    return "recommended" as const;
  }
  if (score >= 75) {
    return "matched" as const;
  }
  return "unmatched" as const;
}

export const cases: StructuredResumeEvalCase[] = Array.from({ length: 100 }, (_, index) => {
  const caseNumber = index + 1;
  const id = `synthetic-structured-resume-${String(caseNumber).padStart(3, "0")}`;
  const contentHash = createHash("sha256").update(`structured-resume-eval-v1:${id}`).digest("hex");
  const ruleStatus = statuses[index % statuses.length] ?? "matched";
  const gateStatus = gateStatusFor(index);
  const compositeScore = 65 + (index % 31);
  const grade = gradeFor(compositeScore);
  const expected = {
    compositeScore,
    gateStatus,
    grade,
    ruleJudgments: { "synthetic.coverage_rule": ruleStatus },
  } as const;
  return {
    baseline: {
      artifactSchemaValid: true,
      deterministicInvariantsValid: true,
      evidenceCitationIntegrity: true,
      ...expected,
    },
    caseVersion: "v1",
    coverage: {
      dimensions: [...STRUCTURED_RESUME_DIMENSIONS],
      gateBoundary: index < 3,
      missingEvidence: ruleStatus === "insufficient_evidence",
      ruleStatuses: [ruleStatus],
    },
    gold: expected,
    id,
    jobInput: {
      blueprint,
      blueprintHash: computeJobEvaluationPayloadHash(blueprint),
      deductionRuleSetVersion: 1,
      jobId: "job-1",
      publishedConfig,
    },
    resumeInput: {
      evaluationAsOf: "2026-07-30",
      resumeInputHash: contentHash,
      resumeProfile: {
        age: null,
        educationExperiences: [],
        email: null,
        gender: null,
        name: "合成候选人",
        personalStrengths: [],
        phone: null,
        projectExperiences: [],
        schools: [],
        skills: [],
        targetRoles: [],
        workExperiences: [],
        workYears: null,
      },
      resumeText: null,
    },
    source: {
      contentHash,
      kind: "synthetic",
      sourceAnchor: `synthetic://structured-resume-eval/v1/${id}#sha256=${contentHash}`,
    },
  };
});
