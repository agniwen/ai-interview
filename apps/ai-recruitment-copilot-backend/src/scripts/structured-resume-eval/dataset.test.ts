import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  computeStructuredResumeEvaluation,
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeDimension,
  StructuredResumeRuleJudgment,
} from "@arc/shared/structured-resume-scoring";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import {
  bindStructuredResumeEvalCandidate,
  loadStructuredResumeEvalCorpus,
  validateCorpusCoverage,
} from "./dataset";

const fixtureManifest = resolve(import.meta.dirname, "fixtures/v1-synthetic/manifest.json");

function createValidRawArtifact(engine: {
  engineVersion: string;
  inputHash: string;
  modelId: string;
  promptVersion: string;
}) {
  const config = createDefaultJobDescriptionStructuredConfig();
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
  const dimensionRuleJudgments: Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]> =
    {
      educationBackground: [],
      experienceRelevance: [],
      potential: [],
      projectMatch: [],
      skillMatch: [],
      stability: [],
    };
  for (const [ruleId, rule] of Object.entries(STRUCTURED_RESUME_DEDUCTION_CATALOG)) {
    dimensionRuleJudgments[rule.dimension].push({
      evidence: [],
      reason: "合成产物不适用该规则",
      ruleId: ruleId as StructuredResumeRuleJudgment["ruleId"],
      status: "not_applicable",
    });
  }
  const calculation = computeStructuredResumeEvaluation({
    adjustments: [],
    deductionRules: config.deductionRules,
    dimensionRuleJudgments,
    gateJudgments: [],
    weights: config.weights,
  });
  return {
    adjustments: {
      exclusionPointTotal: calculation.exclusionPointTotal,
      matches: calculation.adjustments,
      priorityPointTotal: calculation.priorityPointTotal,
    },
    blueprint,
    blueprintHash: computeJobEvaluationPayloadHash(blueprint),
    calculations: {
      adjustedHundredths: calculation.adjustedHundredths,
      clampedHundredths: calculation.clampedHundredths,
      compositeScore: calculation.compositeScore,
      weightedBaseHundredths: calculation.weightedBaseHundredths,
    },
    deductionRuleSetVersion: 1,
    dimensions: Object.fromEntries(
      STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
        dimension,
        { ...calculation.dimensions[dimension], ruleJudgments: dimensionRuleJudgments[dimension] },
      ]),
    ),
    engine: {
      engineVersion: engine.engineVersion,
      modelId: engine.modelId,
      promptVersion: engine.promptVersion,
    },
    evaluationAsOf: "2026-07-30",
    evaluationMode: "structured" as const,
    gates: calculation.gates,
    generatedAt: "2026-07-30T00:00:00.000Z",
    grade: calculation.grade,
    inputHash: engine.inputHash,
    jobConfig: config,
    jobConfigHash: computeJobEvaluationPayloadHash(config),
    jobId: "job-1",
    narrative: { recommendation: "供 HR 参考", summary: "无扣分事实" },
    requiredRelevantExperience: null,
    runId: "run-1",
    schemaVersion: 1 as const,
    skillExpectations: { auxiliary: [], core: [] },
    timeline: {
      employmentEpisodes: [],
      relevantMonths: null,
      relevantYears: null,
      relevantYearsSource: null,
    },
    weights: config.weights,
  };
}

describe("structured resume eval dataset", () => {
  it("loads a versioned, sanitized corpus with complete coverage", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);

    expect(corpus.cases).toHaveLength(100);
    expect(corpus.corpusHash).toMatch(/^[a-f0-9]{64}$/);
    expect(corpus.manifest.approval.status).toBe("pending");
    expect(corpus.cases[0]?.resumeInput.resumeProfile).toBeDefined();
  });

  it("rejects a corpus smaller than the rollout minimum", () => {
    expect(() => validateCorpusCoverage([])).toThrow("STRUCTURED_EVAL_CORPUS_TOO_SMALL:0");
  });

  it("binds separately generated candidate outputs to the exact corpus and engine", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);
    const candidate = {
      candidateVersion: "candidate-v1",
      corpusHash: corpus.corpusHash,
      engineVersion: corpus.manifest.engineVersion,
      generatedAt: "2026-07-30T00:00:00.000Z",
      modelId: corpus.manifest.modelId,
      outputs: corpus.cases.map((item) => ({
        artifact: createValidRawArtifact({
          engineVersion: corpus.manifest.engineVersion,
          inputHash: item.resumeInput.resumeInputHash,
          modelId: corpus.manifest.modelId,
          promptVersion: corpus.manifest.promptVersion,
        }),
        caseId: item.id,
      })),
      promptVersion: corpus.manifest.promptVersion,
      schemaVersion: 1 as const,
    };

    const bound = bindStructuredResumeEvalCandidate(corpus, candidate);
    expect(bound).toHaveLength(100);
    expect(bound[0]?.baseline).toMatchObject({
      artifactSchemaValid: true,
      compositeScore: 100,
      deterministicInvariantsValid: true,
      evidenceCitationIntegrity: true,
    });
    expect(() =>
      bindStructuredResumeEvalCandidate(corpus, {
        ...candidate,
        engineVersion: "stale-engine",
      }),
    ).toThrow("STRUCTURED_EVAL_CANDIDATE_ENGINE_MISMATCH");
  });

  it("derives validity from the raw artifact instead of trusting self-reported booleans", async () => {
    const corpus = await loadStructuredResumeEvalCorpus(fixtureManifest);
    const candidate = {
      candidateVersion: "candidate-v1",
      corpusHash: corpus.corpusHash,
      engineVersion: corpus.manifest.engineVersion,
      generatedAt: "2026-07-30T00:00:00.000Z",
      modelId: corpus.manifest.modelId,
      outputs: corpus.cases.map((item) => ({
        artifact: item.baseline,
        caseId: item.id,
      })),
      promptVersion: corpus.manifest.promptVersion,
      schemaVersion: 1 as const,
    };

    expect(bindStructuredResumeEvalCandidate(corpus, candidate)[0]?.baseline).toMatchObject({
      artifactSchemaValid: false,
      deterministicInvariantsValid: false,
      evidenceCitationIntegrity: false,
    });
  });
});
