import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import {
  structuredResumeEvidenceSchema,
  structuredResumeEvaluationV1Schema,
  structuredResumeGateStatusSchema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import {
  computeRelevantExperience,
  computeStructuredResumeEvaluation,
  deriveTimelineFacts,
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeAdjustmentMatch,
  StructuredResumeDimension,
  StructuredResumeGateJudgment,
  StructuredResumeRuleJudgment,
} from "@arc/shared/structured-resume-scoring";
import {
  generateStructuredWithMastraAgent,
  structuredResumeAdjustmentAgent,
  structuredResumeDimensionAgent,
  structuredResumeGateAgent,
  structuredResumeNarrativeAgent,
} from "./mastra/agents/simple-generators";
import { getMastraModelIdentifier, mastraModels } from "./mastra/models";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";

export const STRUCTURED_RESUME_ENGINE_VERSION = "structured-resume-engine-v1";
export const STRUCTURED_RESUME_PROMPT_VERSION = "structured-resume-prompt-v1";
export const STRUCTURED_RESUME_MODEL_ID = getMastraModelIdentifier(mastraModels.structuredModel);

export const structuredResumeWorkflowInputSchema = z
  .object({
    engine: z
      .object({
        modelId: z.string().trim().min(1),
        promptVersion: z.string().trim().min(1),
        version: z.string().trim().min(1),
      })
      .strict(),
    jobSnapshot: z
      .object({
        blueprint: jobEvaluationBlueprintSchema,
        blueprintHash: z.string().trim().min(1),
        deductionRuleSetVersion: z.number().int().positive(),
        evaluationMode: z.literal("structured"),
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
        runId: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const gateJudgmentSchema = z
  .object({
    aiStatus: structuredResumeGateStatusSchema,
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
  })
  .strict();

export const structuredGateAgentOutputSchema = z.object({
  judgments: z.array(gateJudgmentSchema),
});

const ruleIds = [
  "education.below_tier",
  "education.major_unrelated",
  "experience.fragmented",
  "experience.industry_unrelated",
  "potential.illogical_switches",
  "potential.no_growth_two_years",
  "project.edge_participation",
  "project.no_relevant_project",
  "project.scale_low",
  "skill.missing_auxiliary",
  "skill.missing_core",
  "skill.no_related_skill",
  "skill.shallow",
  "stability.frequent_unrelated_industries",
] as const;

const semanticRuleJudgmentSchema = z
  .object({
    dimension: z.enum(STRUCTURED_RESUME_DIMENSIONS),
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    ruleId: z.enum(ruleIds),
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().positive().optional(),
  })
  .strict();

const timelineEpisodeSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    evidence: z.array(structuredResumeEvidenceSchema),
    gapExplanation: z.string().trim().min(1).nullable(),
    id: z.string().trim().min(1),
    primaryStatus: z.enum(["concurrent", "primary", "unresolved"]),
    relevance: z.enum(["insufficient_evidence", "not_relevant", "relevant"]),
    relevanceReason: z.string().trim().min(1),
    startMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
  })
  .strict();

const projectFactSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    evidence: z.array(structuredResumeEvidenceSchema),
    id: z.string().trim().min(1),
    relevant: z.boolean(),
  })
  .strict();

export const structuredDimensionAgentOutputSchema = z
  .object({
    employmentEpisodes: z.array(timelineEpisodeSchema),
    projects: z.array(projectFactSchema),
    ruleJudgments: z.array(semanticRuleJudgmentSchema),
  })
  .strict();

const adjustmentJudgmentSchema = z
  .object({
    conditionId: z.string().trim().min(1),
    evidence: z.array(structuredResumeEvidenceSchema),
    matched: z.boolean(),
    reason: z.string().trim().min(1),
  })
  .strict();

export const structuredAdjustmentAgentOutputSchema = z.object({
  judgments: z.array(adjustmentJudgmentSchema),
});

export const structuredNarrativeAgentOutputSchema = z
  .object({
    recommendation: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict();

export type StructuredResumeWorkflowInput = z.infer<typeof structuredResumeWorkflowInputSchema>;
type DimensionFacts = z.infer<typeof structuredDimensionAgentOutputSchema>;
type GateAgentOutput = z.infer<typeof structuredGateAgentOutputSchema>;
type AdjustmentAgentOutput = z.infer<typeof structuredAdjustmentAgentOutputSchema>;
export type StructuredResumeCalculation = ReturnType<typeof computeStructuredResumeCalculation>;

function buildPrompt(title: string, input: StructuredResumeWorkflowInput): string {
  return [
    title,
    "所有判断必须引用简历原文或结构化档案证据。",
    "不得输出扣分、时长合计、维度分、综合分或等级。",
    JSON.stringify(input),
  ].join("\n");
}

export function judgeStructuredHardGates(input: StructuredResumeWorkflowInput) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeGateAgent,
    prompt: buildPrompt("逐项判断冻结门槛，只返回 passed / failed / needs_verification。", input),
    retryOnInvalid: true,
    schema: structuredGateAgentOutputSchema,
    temperature: 0,
  });
}

export function judgeStructuredDimensionEvidence(input: StructuredResumeWorkflowInput) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeDimensionAgent,
    maxOutputTokens: 8000,
    prompt: buildPrompt(
      "提取月级工作时间线、主职/并发关系、窄口径相关性和非时间类规则语义。不要计算月份或时间窗口。",
      input,
    ),
    retryOnInvalid: true,
    schema: structuredDimensionAgentOutputSchema,
    temperature: 0,
  });
}

export function judgeStructuredAdjustments(input: StructuredResumeWorkflowInput) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeAdjustmentAgent,
    prompt: buildPrompt("逐项判断冻结的优先/排除条件。缺少证据必须 matched=false。", input),
    retryOnInvalid: true,
    schema: structuredAdjustmentAgentOutputSchema,
    temperature: 0,
  });
}

function judgment(
  ruleId: StructuredResumeRuleJudgment["ruleId"],
  status: StructuredResumeRuleJudgment["status"],
  reason: string,
  units?: number,
): StructuredResumeRuleJudgment {
  return {
    evidence: [],
    reason,
    ruleId,
    status,
    ...(units ? { units } : {}),
  };
}

// oxlint-disable-next-line complexity -- this deterministic reducer covers the complete fixed rule catalog in one auditable pass.
export function deriveStructuredRuleJudgments(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
): Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]> {
  const judgments: Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]> = {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  };
  const semanticByRuleId = new Map<
    (typeof ruleIds)[number],
    (typeof facts.ruleJudgments)[number]
  >();
  for (const item of facts.ruleJudgments) {
    if (!semanticByRuleId.has(item.ruleId)) {
      semanticByRuleId.set(item.ruleId, item);
    }
  }
  for (const ruleId of ruleIds) {
    const item = semanticByRuleId.get(ruleId);
    const { dimension } = STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId];
    judgments[dimension].push(
      item
        ? {
            evidence: item.evidence,
            reason: item.reason,
            ruleId,
            status: item.status,
            ...(item.units ? { units: item.units } : {}),
          }
        : judgment(ruleId, "insufficient_evidence", "AI 未返回该规则的有效判断。"),
    );
  }

  const required = input.jobSnapshot.blueprint.requiredRelevantExperience;
  if (required) {
    const relevant = computeRelevantExperience({
      episodes: facts.employmentEpisodes.map((episode) => ({
        endMonth:
          episode.endMonth ??
          (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
        relevance: episode.relevance,
        startMonth: episode.startMonth,
      })),
      profileWorkYears: input.resumeInput.resumeProfile.workYears ?? undefined,
      relevanceScope: required.relevanceScope,
      requiredYears: required.years,
    });
    judgments.experienceRelevance.push(
      judgment(
        "experience.missing_year",
        relevant.status,
        "由代码按冻结口径合并相关工作月份后判定。",
        relevant.missingYearUnits || undefined,
      ),
    );
  } else {
    judgments.experienceRelevance.push(
      judgment("experience.missing_year", "not_applicable", "岗位蓝图未设置相关经验年限。"),
    );
  }

  const temporal = deriveTimelineFacts({
    employmentEpisodes: facts.employmentEpisodes,
    evaluationAsOf: input.resumeInput.evaluationAsOf,
    projects: facts.projects,
  });
  if (temporal.hasUnresolvedPrimaryTimeline) {
    judgments.stability.push(
      judgment(
        "stability.three_changes_one_year",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.two_changes_one_year",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.two_changes_two_years",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment("stability.short_tenure", "insufficient_evidence", "缺少可解析的主职工作时间线。"),
    );
  } else {
    const oneYear = temporal.jobChangesWithinOneYear ?? 0;
    const twoYears = temporal.jobChangesWithinTwoYears ?? 0;
    judgments.stability.push(
      judgment(
        "stability.three_changes_one_year",
        oneYear >= 3 ? "matched" : "not_matched",
        "由代码按一年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.two_changes_one_year",
        oneYear === 2 ? "matched" : "not_matched",
        "由代码按一年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.two_changes_two_years",
        twoYears >= 2 ? "matched" : "not_matched",
        "由代码按两年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.short_tenure",
        (temporal.shortTenureCount ?? 0) > 0 ? "matched" : "not_matched",
        "由代码按完整日历月计算短任职。",
        temporal.shortTenureCount || undefined,
      ),
    );
  }
  if (temporal.hasUnresolvedPrimaryTimeline) {
    judgments.stability.push(
      judgment(
        "stability.gap_over_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.gap_three_to_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
    );
    judgments.potential.push(
      judgment(
        "potential.unexplained_gap_over_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
    );
  } else {
    const maxGap = Math.max(0, ...temporal.unexplainedGapMonths);
    judgments.stability.push(
      judgment(
        "stability.gap_over_six_months",
        maxGap > 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
      judgment(
        "stability.gap_three_to_six_months",
        maxGap >= 3 && maxGap <= 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
    );
    judgments.potential.push(
      judgment(
        "potential.unexplained_gap_over_six_months",
        maxGap > 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
    );
  }
  judgments.projectMatch.push(
    judgment(
      "project.old_relevant_project",
      temporal.oldProjectIds.length > 0 ? "matched" : "not_matched",
      "由代码按三年回看窗口计算相关项目新鲜度。",
    ),
  );
  return judgments;
}

export function validateStructuredResumeInput(rawInput: StructuredResumeWorkflowInput) {
  const input = structuredResumeWorkflowInputSchema.parse(rawInput);
  if (
    computeJobEvaluationPayloadHash(input.jobSnapshot.blueprint) !== input.jobSnapshot.blueprintHash
  ) {
    throw new Error("STRUCTURED_BLUEPRINT_HASH_MISMATCH");
  }
  if (input.jobSnapshot.deductionRuleSetVersion !== STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION) {
    throw new Error("STRUCTURED_RULE_SET_VERSION_MISMATCH");
  }
  return input;
}

function buildGateJudgments(
  input: StructuredResumeWorkflowInput,
  output: GateAgentOutput,
): StructuredResumeGateJudgment[] {
  const byId = new Map(output.judgments.map((item) => [item.requirementId, item]));
  return input.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => {
    const result = byId.get(requirement.requirementId);
    return {
      aiStatus: result?.aiStatus ?? "needs_verification",
      category: requirement.category,
      evidence: result?.evidence ?? [],
      reason: result?.reason ?? "AI 未返回该门槛的有效判断。",
      requirementId: requirement.requirementId,
    };
  });
}

function buildAdjustmentMatches(
  input: StructuredResumeWorkflowInput,
  output: AdjustmentAgentOutput,
): StructuredResumeAdjustmentMatch[] {
  const byId = new Map(output.judgments.map((item) => [item.conditionId, item]));
  return [
    ...input.jobSnapshot.publishedConfig.priorityConditions.map((condition) => ({
      condition,
      kind: "priority" as const,
    })),
    ...input.jobSnapshot.publishedConfig.exclusionConditions.map((condition) => ({
      condition,
      kind: "exclusion" as const,
    })),
  ].map(({ condition, kind }) => {
    const result = byId.get(condition.id);
    const matched = result?.matched === true && (result.evidence.length ?? 0) > 0;
    return {
      conditionId: condition.id,
      evidence: matched ? (result?.evidence ?? []) : [],
      kind,
      matched,
      points: condition.points,
      reason: result?.reason ?? "简历中没有命中该条件的证据。",
      sourceText: condition.condition,
    };
  });
}

function normalizedEvidenceText(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function validateEvidenceSources(input: {
  adjustmentOutput: AdjustmentAgentOutput;
  dimensionOutput: DimensionFacts;
  gateOutput: GateAgentOutput;
  workflowInput: StructuredResumeWorkflowInput;
}): void {
  const sources = {
    resume_profile: normalizedEvidenceText(
      JSON.stringify(input.workflowInput.resumeInput.resumeProfile),
    ),
    resume_text: normalizedEvidenceText(input.workflowInput.resumeInput.resumeText ?? ""),
  };
  const evidenceLists = [
    ...input.gateOutput.judgments.map((item) => item.evidence),
    ...input.dimensionOutput.employmentEpisodes.map((item) => item.evidence),
    ...input.dimensionOutput.projects.map((item) => item.evidence),
    ...input.dimensionOutput.ruleJudgments.map((item) => item.evidence),
    ...input.adjustmentOutput.judgments.map((item) => item.evidence),
  ];
  for (const evidence of evidenceLists.flat()) {
    const quote = normalizedEvidenceText(evidence.quote);
    if (!quote || !sources[evidence.source].includes(quote)) {
      throw new Error("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
    }
  }
}

export function generateStructuredNarrative(input: {
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeNarrativeAgent,
    prompt: [
      "只解释已完成的计算，不得重算或修改结果。",
      JSON.stringify({
        adjustments: input.calculation.adjustments,
        compositeScore: input.calculation.compositeScore,
        dimensions: input.calculation.dimensions,
        gates: input.calculation.gates,
        grade: input.calculation.grade,
      }),
    ].join("\n"),
    retryOnInvalid: true,
    schema: structuredNarrativeAgentOutputSchema,
    temperature: 0,
  });
}

export function computeStructuredResumeCalculation(input: {
  adjustmentOutput: AdjustmentAgentOutput;
  dimensionOutput: DimensionFacts;
  gateOutput: GateAgentOutput;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  const { adjustmentOutput, dimensionOutput, gateOutput, workflowInput } = input;
  validateEvidenceSources(input);
  const normalizedDimensionOutput =
    workflowInput.jobSnapshot.blueprint.requiredRelevantExperience?.relevanceScope ===
    "total_employment"
      ? {
          ...dimensionOutput,
          employmentEpisodes: dimensionOutput.employmentEpisodes.map((episode) => ({
            ...episode,
            relevance: "relevant" as const,
            relevanceReason: "岗位采用总工作经验口径，代码将已解析任职统一计为相关经验。",
          })),
        }
      : dimensionOutput;
  const gateJudgments = buildGateJudgments(workflowInput, gateOutput);
  const dimensionRuleJudgments = deriveStructuredRuleJudgments(
    workflowInput,
    normalizedDimensionOutput,
  );
  const adjustments = buildAdjustmentMatches(workflowInput, adjustmentOutput);
  const calculation = computeStructuredResumeEvaluation({
    adjustments,
    dimensionRuleJudgments,
    gateJudgments,
    weights: workflowInput.jobSnapshot.publishedConfig.weights,
  });
  return { calculation, dimensionRuleJudgments, normalizedDimensionOutput };
}

export function assembleStructuredResumeEvaluation(input: {
  calculationResult: StructuredResumeCalculation;
  narrative: z.infer<typeof structuredNarrativeAgentOutputSchema>;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  const { calculationResult, narrative, workflowInput } = input;
  const { calculation, dimensionRuleJudgments, normalizedDimensionOutput } = calculationResult;
  const required = workflowInput.jobSnapshot.blueprint.requiredRelevantExperience;
  const relevant = required
    ? computeRelevantExperience({
        episodes: normalizedDimensionOutput.employmentEpisodes.map((episode) => ({
          endMonth:
            episode.endMonth ??
            (episode.current ? workflowInput.resumeInput.evaluationAsOf.slice(0, 7) : null),
          relevance: episode.relevance,
          startMonth: episode.startMonth,
        })),
        profileWorkYears: workflowInput.resumeInput.resumeProfile.workYears ?? undefined,
        relevanceScope: required.relevanceScope,
        requiredYears: required.years,
      })
    : null;
  const artifact = {
    adjustments: {
      exclusionPointTotal: calculation.exclusionPointTotal,
      matches: calculation.adjustments,
      priorityPointTotal: calculation.priorityPointTotal,
    },
    blueprint: workflowInput.jobSnapshot.blueprint,
    blueprintHash: workflowInput.jobSnapshot.blueprintHash,
    calculations: {
      adjustedHundredths: calculation.adjustedHundredths,
      clampedHundredths: calculation.clampedHundredths,
      compositeScore: calculation.compositeScore,
      weightedBaseHundredths: calculation.weightedBaseHundredths,
    },
    deductionRuleSetVersion: workflowInput.jobSnapshot.deductionRuleSetVersion,
    dimensions: Object.fromEntries(
      STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
        dimension,
        {
          ...calculation.dimensions[dimension],
          ruleJudgments: dimensionRuleJudgments[dimension],
        },
      ]),
    ),
    engine: {
      engineVersion: workflowInput.engine.version,
      modelId: workflowInput.engine.modelId,
      promptVersion: workflowInput.engine.promptVersion,
    },
    evaluationAsOf: workflowInput.resumeInput.evaluationAsOf,
    evaluationMode: "structured",
    gates: calculation.gates,
    generatedAt: new Date().toISOString(),
    grade: calculation.grade,
    inputHash: workflowInput.resumeInput.resumeInputHash,
    jobConfig: workflowInput.jobSnapshot.publishedConfig,
    jobConfigHash: computeJobEvaluationPayloadHash(workflowInput.jobSnapshot.publishedConfig),
    jobId: workflowInput.jobSnapshot.jobId,
    narrative,
    requiredRelevantExperience: required
      ? {
          relevanceScope: required.relevanceScope,
          years: required.years,
        }
      : null,
    runId: workflowInput.resumeInput.runId,
    schemaVersion: 1,
    skillExpectations: {
      auxiliary: workflowInput.jobSnapshot.blueprint.auxiliarySkills.map(
        (skill) => skill.normalizedSkill,
      ),
      core: workflowInput.jobSnapshot.blueprint.coreSkills.map((skill) => skill.normalizedSkill),
    },
    timeline: {
      employmentEpisodes: normalizedDimensionOutput.employmentEpisodes,
      relevantMonths: relevant?.relevantMonths ?? null,
      relevantYears: relevant?.relevantYears ?? null,
      relevantYearsSource: relevant?.source ?? null,
    },
    weights: workflowInput.jobSnapshot.publishedConfig.weights,
  };
  return structuredResumeEvaluationV1Schema.parse(artifact);
}

export async function evaluateStructuredResume(rawInput: StructuredResumeWorkflowInput) {
  const input = validateStructuredResumeInput(rawInput);
  const [gateOutput, dimensionOutput, adjustmentOutput] = await Promise.all([
    judgeStructuredHardGates(input),
    judgeStructuredDimensionEvidence(input),
    judgeStructuredAdjustments(input),
  ]);
  const calculationResult = computeStructuredResumeCalculation({
    adjustmentOutput,
    dimensionOutput,
    gateOutput,
    workflowInput: input,
  });
  const narrative = await generateStructuredNarrative({
    calculation: calculationResult.calculation,
    workflowInput: input,
  });
  return assembleStructuredResumeEvaluation({
    calculationResult,
    narrative,
    workflowInput: input,
  });
}
