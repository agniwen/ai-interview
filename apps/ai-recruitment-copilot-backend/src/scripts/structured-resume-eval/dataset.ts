import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import {
  structuredResumeEvaluationV1Schema,
  structuredResumeGateStatusSchema,
  structuredResumeGradeSchema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import {
  areStructuredResumeEvidenceSourcesValid,
  computeRelevantExperience,
  computeStructuredResumeEvaluation,
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeDimension,
  StructuredResumeRuleId,
  StructuredResumeRuleJudgment,
} from "@arc/shared/structured-resume-scoring";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import type {
  StructuredResumeEvalCandidate,
  StructuredResumeEvalCase,
  StructuredResumeEvalManifest,
} from "./types";
import { STRUCTURED_RULE_STATUS_CLASSES } from "./types";

const outputSchema = z
  .object({
    artifactSchemaValid: z.boolean(),
    compositeScore: z.number().int().min(0).max(100),
    deterministicInvariantsValid: z.boolean(),
    evidenceCitationIntegrity: z.boolean(),
    gateStatus: structuredResumeGateStatusSchema,
    grade: structuredResumeGradeSchema,
    ruleJudgments: z.record(z.string().trim().min(1), structuredResumeRuleStatusSchema),
  })
  .strict();

const casesModuleSchema = z.object({ cases: z.json().optional() });
const candidateModuleSchema = z.object({ candidate: z.json().optional() });

const evalCaseSchema = z
  .object({
    baseline: outputSchema,
    caseVersion: z.string().trim().min(1),
    coverage: z
      .object({
        dimensions: z.array(z.enum(STRUCTURED_RESUME_DIMENSIONS)),
        gateBoundary: z.boolean(),
        missingEvidence: z.boolean(),
        ruleStatuses: z.array(structuredResumeRuleStatusSchema),
      })
      .strict(),
    gold: outputSchema.pick({
      compositeScore: true,
      gateStatus: true,
      grade: true,
      ruleJudgments: true,
    }),
    id: z.string().trim().min(1),
    jobInput: z
      .object({
        blueprint: jobEvaluationBlueprintSchema,
        blueprintHash: z.string().trim().min(1),
        deductionRuleSetVersion: z.number().int().positive(),
        jobId: z.string().trim().min(1),
        publishedConfig: jobDescriptionStructuredConfigSchema,
      })
      .strict(),
    resumeInput: z
      .object({
        evaluationAsOf: z.string().date(),
        resumeInputHash: z.string().trim().min(1),
        resumeProfile: resumeProfileSchema,
        resumeText: z.string().nullable(),
      })
      .strict(),
    source: z
      .object({
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        kind: z.enum(["sanitized", "synthetic"]),
        sourceAnchor: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const candidateSchema = z
  .object({
    candidateVersion: z.string().trim().min(1),
    corpusHash: z.string().regex(/^[a-f0-9]{64}$/),
    engineVersion: z.string().trim().min(1),
    generatedAt: z.string().datetime(),
    modelId: z.string().trim().min(1),
    outputs: z.array(
      z
        .object({
          artifact: z.unknown().refine((value) => value !== undefined, "artifact is required"),
          caseId: z.string().trim().min(1),
        })
        .strict(),
    ),
    promptVersion: z.string().trim().min(1),
    schemaVersion: z.literal(1),
  })
  .strict();

const thresholdsSchema = z
  .object({
    artifactSchemaValidity: z.literal(1),
    compositeScoreMae: z.number().nonnegative(),
    compositeScoreMaxError: z.number().nonnegative(),
    compositeScoreP95Error: z.number().nonnegative(),
    deterministicInvariants: z.literal(1),
    evidenceCitationIntegrity: z.literal(1),
    gradeAgreement: z.number().min(0).max(1),
    hardGateAgreement: z.number().min(0).max(1),
    perRuleMacroF1: z.number().min(0).max(1),
  })
  .strict();

const manifestSchema = z
  .object({
    approval: z
      .object({
        approvedAt: z.string().datetime().nullable(),
        approver: z.string().trim().min(1).nullable(),
        status: z.enum(["approved", "pending"]),
      })
      .strict(),
    baselineVersion: z.string().trim().min(1),
    casesFile: z.string().trim().min(1),
    corpusVersion: z.string().trim().min(1),
    engineVersion: z.string().trim().min(1),
    goldLabelVersion: z.string().trim().min(1),
    modelId: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
    schemaVersion: z.literal(1),
    thresholds: thresholdsSchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const completeApproval =
      manifest.approval.status === "approved" &&
      manifest.approval.approvedAt !== null &&
      manifest.approval.approver !== null;
    const emptyApproval =
      manifest.approval.status === "pending" &&
      manifest.approval.approvedAt === null &&
      manifest.approval.approver === null;
    if (!(completeApproval || emptyApproval)) {
      ctx.addIssue({
        code: "custom",
        message: "approval fields must be complete for approved or empty for pending",
        path: ["approval"],
      });
    }
  });

const directPiiPatterns = [
  /\b1[3-9]\d{9}\b/u,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
] as const;

function validateCorpusCoverage(cases: StructuredResumeEvalCase[]) {
  if (cases.length < 100) {
    throw new Error(`STRUCTURED_EVAL_CORPUS_TOO_SMALL:${cases.length}`);
  }
  const ids = new Set<string>();
  const dimensions = new Set<string>();
  const statuses = new Set<string>();
  let hasGateBoundary = false;
  let hasMissingEvidence = false;
  for (const item of cases) {
    if (ids.has(item.id)) {
      throw new Error(`STRUCTURED_EVAL_DUPLICATE_CASE:${item.id}`);
    }
    ids.add(item.id);
    for (const value of item.coverage.dimensions) {
      dimensions.add(value);
    }
    for (const value of item.coverage.ruleStatuses) {
      statuses.add(value);
    }
    hasGateBoundary ||= item.coverage.gateBoundary;
    hasMissingEvidence ||= item.coverage.missingEvidence;
    if (!item.source.sourceAnchor.includes(item.source.contentHash)) {
      throw new Error(`STRUCTURED_EVAL_MUTABLE_SOURCE_ANCHOR:${item.id}`);
    }
  }
  for (const dimension of STRUCTURED_RESUME_DIMENSIONS) {
    if (!dimensions.has(dimension)) {
      throw new Error(`STRUCTURED_EVAL_MISSING_DIMENSION:${dimension}`);
    }
  }
  for (const status of STRUCTURED_RULE_STATUS_CLASSES) {
    if (!statuses.has(status)) {
      throw new Error(`STRUCTURED_EVAL_MISSING_RULE_STATUS:${status}`);
    }
  }
  if (!hasGateBoundary) {
    throw new Error("STRUCTURED_EVAL_MISSING_GATE_BOUNDARY");
  }
  if (!hasMissingEvidence) {
    throw new Error("STRUCTURED_EVAL_MISSING_EVIDENCE_CASE");
  }
}

async function loadCases(casesPath: string): Promise<z.output<typeof casesModuleSchema>["cases"]> {
  if (casesPath.endsWith(".json")) {
    return JSON.parse(await readFile(casesPath, "utf-8"));
  }
  return casesModuleSchema.parse(await import(pathToFileURL(casesPath).href)).cases;
}

async function loadCandidate(
  candidatePath: string,
): Promise<z.output<typeof candidateModuleSchema>["candidate"]> {
  if (candidatePath.endsWith(".json")) {
    return JSON.parse(await readFile(candidatePath, "utf-8"));
  }
  return candidateModuleSchema.parse(await import(pathToFileURL(candidatePath).href)).candidate;
}

interface LoadedStructuredResumeEvalCorpus {
  cases: StructuredResumeEvalCase[];
  corpusHash: string;
  manifest: StructuredResumeEvalManifest;
}

function invalidCandidateOutput(): StructuredResumeEvalCase["baseline"] {
  return {
    artifactSchemaValid: false,
    compositeScore: 0,
    deterministicInvariantsValid: false,
    evidenceCitationIntegrity: false,
    gateStatus: "failed",
    grade: "unmatched",
    ruleJudgments: {},
  };
}

function sameValue<T>(left: T, right: T): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function artifactEvidence(
  artifact: z.infer<typeof structuredResumeEvaluationV1Schema>,
): StructuredResumeRuleJudgment["evidence"] {
  return [
    ...artifact.gates.judgments.flatMap((item) => item.evidence),
    ...STRUCTURED_RESUME_DIMENSIONS.flatMap((dimension) =>
      artifact.dimensions[dimension].ruleJudgments.flatMap((item) => item.evidence),
    ),
    ...artifact.adjustments.matches.flatMap((item) => item.evidence),
    ...artifact.skillAssessments.flatMap((item) => item.evidence),
    ...artifact.timeline.employmentEpisodes.flatMap((item) => item.evidence),
  ];
}

function isKnownRuleId(value: string): value is StructuredResumeRuleId {
  return value in STRUCTURED_RESUME_DEDUCTION_CATALOG;
}

// oxlint-disable-next-line complexity -- the release gate intentionally verifies every persisted deterministic contract in one pass.
function validateArtifactInvariants(
  artifact: z.infer<typeof structuredResumeEvaluationV1Schema>,
  expectedEngine: { engineVersion: string; modelId: string; promptVersion: string },
  caseInput: Pick<StructuredResumeEvalCase, "jobInput" | "resumeInput">,
): boolean {
  const ruleIds = STRUCTURED_RESUME_DIMENSIONS.flatMap((dimension) =>
    artifact.dimensions[dimension].ruleJudgments.map((item) => item.ruleId),
  );
  const catalogRuleIds = Object.keys(STRUCTURED_RESUME_DEDUCTION_CATALOG).filter(isKnownRuleId);
  const expectedGateById = new Map(
    caseInput.jobInput.blueprint.hardGateRequirements.map((item) => [item.requirementId, item]),
  );
  const expectedAdjustments = [
    ...caseInput.jobInput.publishedConfig.priorityConditions.map((item) => ({
      conditionId: item.id,
      kind: "priority",
      points: item.points,
      sourceText: item.condition,
    })),
    ...caseInput.jobInput.publishedConfig.exclusionConditions.map((item) => ({
      conditionId: item.id,
      kind: "exclusion",
      points: item.points,
      sourceText: item.condition,
    })),
  ];
  if (
    ruleIds.length !== catalogRuleIds.length ||
    new Set(ruleIds).size !== ruleIds.length ||
    !ruleIds.every(isKnownRuleId) ||
    catalogRuleIds.some((ruleId) => !ruleIds.includes(ruleId)) ||
    artifact.gates.judgments.length !== expectedGateById.size ||
    artifact.gates.judgments.some((item) => {
      const expected = expectedGateById.get(item.requirementId);
      return !expected || item.category !== expected.category;
    }) ||
    !sameValue(
      artifact.adjustments.matches.map(({ conditionId, kind, points, sourceText }) => ({
        conditionId,
        kind,
        points,
        sourceText,
      })),
      expectedAdjustments,
    ) ||
    !sameValue(artifact.engine, expectedEngine) ||
    artifact.inputHash !== caseInput.resumeInput.resumeInputHash ||
    artifact.evaluationAsOf !== caseInput.resumeInput.evaluationAsOf ||
    artifact.jobId !== caseInput.jobInput.jobId ||
    !sameValue(artifact.blueprint, caseInput.jobInput.blueprint) ||
    artifact.blueprintHash !== caseInput.jobInput.blueprintHash ||
    !sameValue(artifact.jobConfig, caseInput.jobInput.publishedConfig) ||
    artifact.deductionRuleSetVersion !== caseInput.jobInput.deductionRuleSetVersion ||
    artifact.deductionRuleSetVersion !== STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION ||
    !sameValue(artifact.weights, artifact.jobConfig.weights) ||
    artifact.blueprintHash !== computeJobEvaluationPayloadHash(artifact.blueprint) ||
    artifact.jobConfigHash !== computeJobEvaluationPayloadHash(artifact.jobConfig)
  ) {
    return false;
  }
  try {
    const expectedSkillExpectations = {
      auxiliary: artifact.blueprint.auxiliarySkills.map((item) => item.normalizedSkill),
      core: artifact.blueprint.coreSkills.map((item) => item.normalizedSkill),
    };
    const required = artifact.blueprint.requiredRelevantExperience;
    const expectedRequiredRelevantExperience = required
      ? { relevanceScope: required.relevanceScope, years: required.years }
      : null;
    const relevant = required
      ? computeRelevantExperience({
          episodes: artifact.timeline.employmentEpisodes.map((episode) => ({
            endMonth:
              episode.endMonth ?? (episode.current ? artifact.evaluationAsOf.slice(0, 7) : null),
            relevance: episode.relevance,
            startMonth: episode.startMonth,
          })),
          profileWorkYears: caseInput.resumeInput.resumeProfile.workYears ?? undefined,
          relevanceScope: required.relevanceScope,
          requiredYears: required.years,
        })
      : null;
    if (
      !sameValue(artifact.skillExpectations, expectedSkillExpectations) ||
      !sameValue(artifact.requiredRelevantExperience, expectedRequiredRelevantExperience) ||
      artifact.timeline.relevantMonths !== (relevant?.relevantMonths ?? null) ||
      artifact.timeline.relevantYears !== (relevant?.relevantYears ?? null) ||
      artifact.timeline.relevantYearsSource !== (relevant?.source ?? null)
    ) {
      return false;
    }
    // SAFETY: The tuple contains every StructuredResumeDimension exactly once and each mapped value is validated above.
    const dimensionRuleJudgments = Object.fromEntries(
      STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
        dimension,
        artifact.dimensions[dimension].ruleJudgments.map((item) => ({
          ...item,
          // SAFETY: The ruleIds check above rejects every artifact rule id absent from the catalog.
          ruleId: item.ruleId as StructuredResumeRuleId,
        })),
      ]),
    ) as Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]>;
    const calculation = computeStructuredResumeEvaluation({
      adjustments: artifact.adjustments.matches,
      deductionRules: caseInput.jobInput.publishedConfig.deductionRules,
      dimensionRuleJudgments,
      gateJudgments: artifact.gates.judgments,
      weights: artifact.weights,
    });
    return (
      sameValue(artifact.calculations, {
        adjustedHundredths: calculation.adjustedHundredths,
        clampedHundredths: calculation.clampedHundredths,
        compositeScore: calculation.compositeScore,
        weightedBaseHundredths: calculation.weightedBaseHundredths,
      }) &&
      artifact.grade === calculation.grade &&
      sameValue(artifact.gates, calculation.gates) &&
      artifact.adjustments.priorityPointTotal === calculation.priorityPointTotal &&
      artifact.adjustments.exclusionPointTotal === calculation.exclusionPointTotal &&
      sameValue(artifact.adjustments.matches, calculation.adjustments) &&
      STRUCTURED_RESUME_DIMENSIONS.every((dimension) =>
        sameValue(
          {
            ...artifact.dimensions[dimension],
            ruleJudgments: undefined,
          },
          {
            ...calculation.dimensions[dimension],
            ruleJudgments: undefined,
          },
        ),
      )
    );
  } catch {
    return false;
  }
}

export function deriveStructuredResumeEvalCandidateOutput(input: {
  artifact: unknown;
  caseInput: Pick<StructuredResumeEvalCase, "jobInput" | "resumeInput">;
  expectedEngine: { engineVersion: string; modelId: string; promptVersion: string };
}): StructuredResumeEvalCase["baseline"] {
  const parsed = structuredResumeEvaluationV1Schema.safeParse(input.artifact);
  if (!parsed.success) {
    return invalidCandidateOutput();
  }
  const artifact = parsed.data;
  const ruleJudgments = Object.fromEntries(
    STRUCTURED_RESUME_DIMENSIONS.flatMap((dimension) =>
      artifact.dimensions[dimension].ruleJudgments.map((item) => [item.ruleId, item.status]),
    ),
  );
  return {
    artifactSchemaValid: true,
    compositeScore: artifact.calculations.compositeScore,
    deterministicInvariantsValid: validateArtifactInvariants(
      artifact,
      input.expectedEngine,
      input.caseInput,
    ),
    evidenceCitationIntegrity: areStructuredResumeEvidenceSourcesValid({
      evidence: artifactEvidence(artifact),
      resumeProfile: input.caseInput.resumeInput.resumeProfile,
      resumeText: input.caseInput.resumeInput.resumeText,
    }),
    gateStatus: artifact.gates.effectiveStatus,
    grade: artifact.grade,
    ruleJudgments,
  };
}

export function bindStructuredResumeEvalCandidate(
  corpus: LoadedStructuredResumeEvalCorpus,
  rawCandidate: StructuredResumeEvalCandidate,
): StructuredResumeEvalCase[] {
  const candidate = candidateSchema.parse(rawCandidate);
  if (candidate.corpusHash !== corpus.corpusHash) {
    throw new Error("STRUCTURED_EVAL_CANDIDATE_CORPUS_MISMATCH");
  }
  if (candidate.engineVersion !== corpus.manifest.engineVersion) {
    throw new Error("STRUCTURED_EVAL_CANDIDATE_ENGINE_MISMATCH");
  }
  if (candidate.promptVersion !== corpus.manifest.promptVersion) {
    throw new Error("STRUCTURED_EVAL_CANDIDATE_PROMPT_MISMATCH");
  }
  if (candidate.modelId !== corpus.manifest.modelId) {
    throw new Error("STRUCTURED_EVAL_CANDIDATE_MODEL_MISMATCH");
  }
  const outputs = new Map<string, StructuredResumeEvalCandidate["outputs"][number]["artifact"]>();
  for (const item of candidate.outputs) {
    if (outputs.has(item.caseId)) {
      throw new Error(`STRUCTURED_EVAL_CANDIDATE_DUPLICATE_CASE:${item.caseId}`);
    }
    outputs.set(item.caseId, item.artifact);
  }
  const corpusIds = new Set(corpus.cases.map((item) => item.id));
  for (const caseId of outputs.keys()) {
    if (!corpusIds.has(caseId)) {
      throw new Error(`STRUCTURED_EVAL_CANDIDATE_UNKNOWN_CASE:${caseId}`);
    }
  }
  return corpus.cases.map((item) => {
    const artifact = outputs.get(item.id);
    if (artifact === undefined) {
      throw new Error(`STRUCTURED_EVAL_CANDIDATE_MISSING_CASE:${item.id}`);
    }
    return {
      ...item,
      baseline: deriveStructuredResumeEvalCandidateOutput({
        artifact,
        caseInput: item,
        expectedEngine: {
          engineVersion: candidate.engineVersion,
          modelId: candidate.modelId,
          promptVersion: candidate.promptVersion,
        },
      }),
    };
  });
}

export async function loadStructuredResumeEvalCandidate(
  candidatePath: string,
  corpus: LoadedStructuredResumeEvalCorpus,
): Promise<{ candidate: StructuredResumeEvalCandidate; cases: StructuredResumeEvalCase[] }> {
  const rawCandidate = await loadCandidate(candidatePath);
  const candidate = candidateSchema.parse(rawCandidate);
  return {
    candidate,
    cases: bindStructuredResumeEvalCandidate(corpus, candidate),
  };
}

export async function loadStructuredResumeEvalCorpus(manifestPath: string) {
  const rawManifest = await readFile(manifestPath, "utf-8");
  for (const pattern of directPiiPatterns) {
    if (pattern.test(rawManifest)) {
      throw new Error("STRUCTURED_EVAL_DIRECT_PII_IN_MANIFEST");
    }
  }
  const manifest = manifestSchema.parse(JSON.parse(rawManifest));
  const casesPath = resolve(dirname(manifestPath), manifest.casesFile);
  const rawCases = await loadCases(casesPath);
  const serializedCases = JSON.stringify(rawCases);
  for (const pattern of directPiiPatterns) {
    if (pattern.test(serializedCases)) {
      throw new Error("STRUCTURED_EVAL_DIRECT_PII_IN_CASES");
    }
  }
  const cases = z.array(evalCaseSchema).parse(rawCases);
  validateCorpusCoverage(cases);
  return {
    cases,
    corpusHash: createHash("sha256").update(rawManifest).update(serializedCases).digest("hex"),
    manifest,
  };
}

export {
  evalCaseSchema as structuredResumeEvalCaseSchema,
  manifestSchema as structuredResumeEvalManifestSchema,
  validateCorpusCoverage,
};
