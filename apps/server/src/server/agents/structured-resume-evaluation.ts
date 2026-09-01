/* oxlint-disable max-lines -- the evaluator keeps its schemas, Agent prompts, deterministic normalization, scoring, and artifact assembly in one versioned module. */
import { z } from "zod";
import type { JsonValue } from "@arc/db-schema/json";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { normalizeResumeScoringFacts } from "@arc/db-schema/resume-scoring-facts";
import type { ResumeScoringFacts } from "@arc/db-schema/resume-scoring-facts";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import {
  structuredResumeEvidenceSchema,
  structuredResumeEvaluationV1Schema,
  structuredResumeGateStatusSchema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import {
  areStructuredResumeEvidenceSourcesValid,
  computeRelevantExperience,
  computeStructuredResumeEvaluation,
  deriveTimelineFacts,
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeAdjustmentMatch,
  StructuredResumeGateJudgment,
  StructuredResumeRuleJudgment,
} from "@arc/shared/structured-resume-scoring";
import type { StructuredResumeSkillAssessment } from "@arc/db-schema/structured-resume-evaluation";
import {
  generateStructuredWithMastraAgent,
  structuredResumeAdjustmentAgent,
  structuredResumeDimensionAgent,
  structuredResumeGateAgent,
  structuredResumeNarrativeAgent,
} from "@app/ai-runtime/simple-generators";
import { getMastraModelIdentifier, mastraModels } from "@app/ai-runtime/models";
import { computeJobEvaluationPayloadHash } from "../../lib/server/job-evaluation-hash";

export type StructuredResumeGenerator = typeof generateStructuredWithMastraAgent;

// Persisted with evaluation results and regression manifests so consumers can distinguish engine and prompt contracts.
// 随评价结果与回归清单持久化，供消费方区分引擎及提示词契约版本。
export const STRUCTURED_RESUME_ENGINE_VERSION = "structured-resume-engine-v1";
export const STRUCTURED_RESUME_PROMPT_VERSION = "structured-resume-prompt-v5";
const STRUCTURED_RESUME_AGENT_TIMEOUT_MS = 240_000;
export const STRUCTURED_RESUME_MODEL_ID = getMastraModelIdentifier(mastraModels.structuredModel);

const agentEvidenceSchema = structuredResumeEvidenceSchema.strip();

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

const gateExperienceEpisodeAgentSchema = z
  .object({
    evidence: z.array(agentEvidenceSchema).default([]),
    id: z.string().trim().min(1),
  })
  .strip();

const gateJudgmentAgentSchema = z
  .object({
    aiStatus: structuredResumeGateStatusSchema,
    evidence: z.array(agentEvidenceSchema).default([]),
    experienceEpisodes: z.array(gateExperienceEpisodeAgentSchema).optional(),
    reason: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
  })
  .strip();

export const structuredGateAgentOutputSchema = z.object({
  judgments: z.array(gateJudgmentAgentSchema).default([]),
});

const gateExperienceEpisodeOutputSchema = gateExperienceEpisodeAgentSchema
  .extend({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
      .nullable(),
    startMonth: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
      .nullable(),
  })
  .strict();
const gateJudgmentOutputSchema = gateJudgmentAgentSchema
  .extend({
    experienceEpisodes: z.array(gateExperienceEpisodeOutputSchema).optional(),
  })
  .strip();
export const structuredGateOutputSchema = z.object({
  judgments: z.array(gateJudgmentOutputSchema).default([]),
});

const semanticRuleIds = [
  "education.below_tier",
  "education.major_unrelated",
  "experience.fragmented",
  "experience.industry_unrelated",
  "potential.illogical_switches",
  "potential.no_growth_two_years",
  "project.edge_participation",
  "project.no_relevant_project",
  "project.scale_low",
  "stability.frequent_unrelated_industries",
] as const;
const semanticRuleIdSchema = z.enum(semanticRuleIds);
const generatedReasonSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.record(z.string(), z.string()),
]);
type GeneratedReason = z.infer<typeof generatedReasonSchema>;
const looseRecordSchema = z.record(z.string(), z.unknown());
const nonEmptyGeneratedStringSchema = z.string().trim().min(1);

// Accepts the model's three historical reason shapes and collapses them into one audit string.
// 兼容模型历史上的三种原因格式，并合并为单一审计文本。
function normalizeGeneratedReason(value: GeneratedReason): string {
  const scalar = z.string().safeParse(value);
  if (scalar.success) {
    return scalar.data;
  }
  const array = z.array(z.string()).safeParse(value);
  if (array.success) {
    return array.data.filter((part) => part.trim().length > 0).join("；");
  }
  return Object.values(z.record(z.string(), z.string()).parse(value))
    .filter((part) => part.trim().length > 0)
    .join("；");
}

// Keeps every semantic-rule result explainable even when the model omits its rationale.
// 即使模型漏填原因，也确保每条语义规则结果都有可解释文本。
function fallbackSemanticRuleReason(
  status: z.infer<typeof structuredResumeRuleStatusSchema>,
): string {
  if (status === "matched") {
    return "模型判断该规则命中，但未提供详细原因。";
  }
  if (status === "not_matched") {
    return "模型判断该规则未命中，但未提供详细原因。";
  }
  if (status === "not_applicable") {
    return "模型判断该规则不适用，但未提供详细原因。";
  }
  return "模型未提供足够信息完成该规则判断。";
}

const semanticRuleJudgmentAgentSchema = z.preprocess(
  (value) => {
    const parsedRecord = looseRecordSchema.safeParse(value);
    if (!parsedRecord.success) {
      return value;
    }
    const parsedRuleId = semanticRuleIdSchema.safeParse(
      parsedRecord.data.ruleId ?? parsedRecord.data.requirementId,
    );
    if (!parsedRuleId.success) {
      return value;
    }
    const parsedReason = generatedReasonSchema.safeParse(parsedRecord.data.reason);
    const parsedStatus = structuredResumeRuleStatusSchema.safeParse(parsedRecord.data.status);
    const status = parsedStatus.success ? parsedStatus.data : "insufficient_evidence";
    const fallbackReason = fallbackSemanticRuleReason(status);
    let { missingInputs } = parsedRecord.data;
    if (
      status === "insufficient_evidence" &&
      (!Array.isArray(missingInputs) || missingInputs.length === 0)
    ) {
      missingInputs = ["需补充能够确认该规则的候选信息。"];
    }
    const parsedUnits = z.number().int().min(1).max(3).safeParse(parsedRecord.data.units);
    let units: number | undefined;
    if (
      parsedRuleId.data === "education.below_tier" &&
      status === "matched" &&
      parsedUnits.success
    ) {
      units = parsedUnits.data;
    }
    const { units: _modelOwnedUnits, ...recordWithoutUnits } = parsedRecord.data;
    const normalizedJudgment = {
      ...recordWithoutUnits,
      dimension: STRUCTURED_RESUME_DEDUCTION_CATALOG[parsedRuleId.data].dimension,
      missingInputs,
      reason: parsedReason.success ? normalizeGeneratedReason(parsedReason.data) : fallbackReason,
      ruleId: parsedRuleId.data,
      status,
    };
    if (units === undefined) {
      return normalizedJudgment;
    }
    return { ...normalizedJudgment, units };
  },
  z
    .object({
      evidence: z.array(agentEvidenceSchema).default([]),
      missingInputs: z.array(z.string().trim().min(1)).default([]),
      reason: z.string().trim().min(1),
      ruleId: semanticRuleIdSchema,
      status: structuredResumeRuleStatusSchema,
      units: z.number().int().min(1).max(3).optional(),
    })
    .strip()
    .superRefine((item, context) => {
      if (item.status === "insufficient_evidence" && item.missingInputs.length === 0) {
        context.addIssue({
          code: "custom",
          message: "证据不足状态必须列出缺失输入",
          path: ["missingInputs"],
        });
      }
    })
    .transform((item) => ({
      ...item,
      dimension: STRUCTURED_RESUME_DEDUCTION_CATALOG[item.ruleId].dimension,
    })),
);

const semanticRuleJudgmentOutputSchema = z
  .object({
    evidence: z.array(agentEvidenceSchema).default([]),
    reason: z.string().trim().min(1),
    ruleId: semanticRuleIdSchema,
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().min(1).max(3).optional(),
  })
  .strip()
  .transform((item) => ({
    ...item,
    dimension: STRUCTURED_RESUME_DEDUCTION_CATALOG[item.ruleId].dimension,
  }));

const timelineEpisodeBaseSchema = z
  .object({
    evidence: z.array(agentEvidenceSchema).default([]),
    id: z.string().trim().min(1),
    relevance: z.enum(["insufficient_evidence", "not_relevant", "relevant"]),
    relevanceReason: z.string().trim().min(1),
  })
  .strip();

const rawTimelineRelevanceSchema = z.union([z.boolean(), z.string(), z.null(), z.undefined()]);

// Normalizes boolean and legacy textual model outputs into the current three-state contract.
// 将布尔值及旧版文本输出归一为当前三态契约。
function normalizeTimelineRelevance(
  value: z.infer<typeof rawTimelineRelevanceSchema>,
): "insufficient_evidence" | "not_relevant" | "relevant" {
  if (value === true || value === "matched" || value === "related" || value === "relevant") {
    return "relevant";
  }
  if (
    value === false ||
    value === "irrelevant" ||
    value === "not_matched" ||
    value === "not_relevant" ||
    value === "unrelated"
  ) {
    return "not_relevant";
  }
  return "insufficient_evidence";
}

const timelineEpisodeAgentSchema = z.preprocess((value) => {
  const parsedEpisode = looseRecordSchema.safeParse(value);
  if (!parsedEpisode.success) {
    return value;
  }
  const episode = parsedEpisode.data;
  const parsedRelevance = rawTimelineRelevanceSchema.safeParse(episode.relevance);
  const relevance = parsedRelevance.success
    ? normalizeTimelineRelevance(parsedRelevance.data)
    : episode.relevance;
  const parsedReason = nonEmptyGeneratedStringSchema.safeParse(episode.relevanceReason);
  let relevanceReason = "模型未提供足够信息判断该任职的岗位相关性。";
  if (relevance === "relevant") {
    relevanceReason = "模型判断该任职与岗位相关。";
  } else if (relevance === "not_relevant") {
    relevanceReason = "模型判断该任职与岗位不相关。";
  }
  if (parsedReason.success) {
    relevanceReason = parsedReason.data;
  }
  return { ...episode, relevance, relevanceReason };
}, timelineEpisodeBaseSchema);

const experienceRequirementAgentSchema = z.preprocess(
  (value) => {
    const parsedRequirement = looseRecordSchema.safeParse(value);
    if (!parsedRequirement.success) {
      return value;
    }
    const requirement = parsedRequirement.data;
    if (
      requirement.status !== "insufficient_evidence" ||
      (Array.isArray(requirement.missingInputs) && requirement.missingInputs.length > 0)
    ) {
      return requirement;
    }
    return {
      ...requirement,
      missingInputs: ["需补充能够确认该经验口径或年限的候选信息。"],
    };
  },
  z
    .object({
      episodeIds: z.array(z.string().trim().min(1)).default([]),
      evidence: z.array(agentEvidenceSchema).default([]),
      missingInputs: z.array(z.string().trim().min(1)).default([]),
      reason: z.string().trim().min(1),
      requirementId: z.string().trim().min(1),
      status: z.enum(["insufficient_evidence", "matched", "not_matched"]),
    })
    .strip()
    .superRefine((item, context) => {
      if (item.status === "matched" && item.episodeIds.length === 0) {
        context.addIssue({
          code: "custom",
          message: "经验要求命中时必须选择任职事实",
          path: ["episodeIds"],
        });
      }
    }),
);

const experienceRequirementOutputSchema = experienceRequirementAgentSchema.transform((item) => ({
  episodeIds: item.episodeIds,
  evidence: item.evidence,
  reason: item.reason,
  requirementId: item.requirementId,
  status: item.status,
}));

const legacyProjectFactAgentSchema = z
  .object({
    evidence: z.array(agentEvidenceSchema).default([]),
    id: z.string().trim().min(1),
    relevant: z.boolean(),
  })
  .strip();

const projectRequirementJudgmentAgentSchema = z.preprocess(
  (value) => {
    const parsedJudgment = looseRecordSchema.safeParse(value);
    if (!parsedJudgment.success) {
      return value;
    }
    const projectJudgment = parsedJudgment.data;
    const parsedEvidence = z.array(z.unknown()).safeParse(projectJudgment.evidence);
    const evidence = parsedEvidence.success ? parsedEvidence.data : [];
    const status =
      projectJudgment.status === "matched" && evidence.length === 0
        ? "insufficient_evidence"
        : projectJudgment.status;
    const parsedReason = nonEmptyGeneratedStringSchema.safeParse(projectJudgment.reason);
    let reason = "模型未提供足够证据判断该项目要求。";
    if (status === "matched") {
      reason = "模型判断该项目要求命中，但未提供详细原因。";
    } else if (status === "not_matched") {
      reason = "模型判断该项目要求未命中，但未提供详细原因。";
    }
    if (parsedReason.success) {
      reason = parsedReason.data;
    }
    if (
      status !== "insufficient_evidence" ||
      (Array.isArray(projectJudgment.missingInputs) && projectJudgment.missingInputs.length > 0)
    ) {
      return { ...projectJudgment, reason, status };
    }
    return {
      ...projectJudgment,
      missingInputs: ["需补充能够确认该项目要求的项目职责、实施细节或结果指标。"],
      reason,
      status,
    };
  },
  z
    .object({
      evidence: z.array(agentEvidenceSchema).default([]),
      missingInputs: z.array(z.string().trim().min(1)).default([]),
      reason: z.string().trim().min(1).max(120),
      requirementId: z.string().trim().min(1),
      status: z.enum(["insufficient_evidence", "matched", "not_matched"]),
    })
    .strip()
    .superRefine((item, context) => {
      if (item.status === "matched" && item.evidence.length === 0) {
        context.addIssue({
          code: "custom",
          message: "项目要求命中时必须提供简历证据",
          path: ["evidence"],
        });
      }
    }),
);

const projectRoleRelevanceAgentSchema = z.preprocess(
  (value) => {
    const parsed = looseRecordSchema.safeParse(value);
    if (!parsed.success) {
      return value;
    }
    const relevance = parsed.data;
    const parsedEvidence = z.array(z.unknown()).safeParse(relevance.evidence);
    const evidence = parsedEvidence.success ? parsedEvidence.data : [];
    const status =
      relevance.status === "matched" && evidence.length === 0
        ? "insufficient_evidence"
        : relevance.status;
    const missingInputs =
      status === "insufficient_evidence" &&
      !(Array.isArray(relevance.missingInputs) && relevance.missingInputs.length > 0)
        ? ["需补充能够判断项目是否属于目标岗位业务领域的项目名称、职责或描述。"]
        : relevance.missingInputs;
    return { ...relevance, evidence, missingInputs, status };
  },
  z
    .object({
      evidence: z.array(agentEvidenceSchema).default([]),
      missingInputs: z.array(z.string().trim().min(1)).default([]),
      reason: z.string().trim().min(1).max(120),
      status: z.enum(["insufficient_evidence", "matched", "not_matched"]),
    })
    .strip()
    .superRefine((item, context) => {
      if (item.status === "matched" && item.evidence.length === 0) {
        context.addIssue({
          code: "custom",
          message: "项目与目标岗位相关时必须提供简历证据",
          path: ["evidence"],
        });
      }
    }),
);

const matrixProjectFactAgentSchema = z
  .object({
    id: z.string().trim().min(1),
    requirementJudgments: z.array(projectRequirementJudgmentAgentSchema),
    roleRelevance: projectRoleRelevanceAgentSchema.optional(),
  })
  .strip();

const projectFactAgentSchema = z.union([
  matrixProjectFactAgentSchema,
  legacyProjectFactAgentSchema,
]);

const skillFactSchema = z.preprocess(
  (value) => {
    const parsedSkill = looseRecordSchema.safeParse(value);
    if (!parsedSkill.success) {
      return value;
    }
    const skill = parsedSkill.data;
    const parsedReason = generatedReasonSchema.safeParse(skill.reason);
    let reason = "模型返回了该技能判断，但未提供详细原因。";
    if (skill.status === "missing") {
      reason = "模型判断简历未体现该技能，但未提供详细原因。";
    }
    if (parsedReason.success) {
      reason = normalizeGeneratedReason(parsedReason.data);
    }
    return {
      ...skill,
      normalizedSkill: skill.normalizedSkill ?? skill.skill,
      reason,
    };
  },
  z
    .object({
      evidence: z.array(agentEvidenceSchema).default([]),
      normalizedSkill: z.string().trim().min(1),
      reason: z.string().trim().min(1),
      status: z.enum(["applied", "missing", "shallow"]),
    })
    .strip()
    .superRefine((item, context) => {
      if (item.status !== "missing" && item.evidence.length === 0) {
        context.addIssue({
          code: "custom",
          message: "applied 或 shallow 技能事实必须提供简历证据",
          path: ["evidence"],
        });
      }
    }),
);

export const structuredDimensionAgentOutputSchema = z
  .object({
    employmentEpisodes: z.array(timelineEpisodeAgentSchema).default([]),
    experienceRequirements: z.array(experienceRequirementAgentSchema).default([]),
    projects: z.array(projectFactAgentSchema).default([]),
    ruleJudgments: z.array(semanticRuleJudgmentAgentSchema).default([]),
    skillFacts: z.array(skillFactSchema).default([]),
  })
  .strict();

const timelineEpisodeOutputSchema = timelineEpisodeBaseSchema
  .extend({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
      .nullable(),
    gapExplanation: z.string().nullable(),
    primaryStatus: z.enum(["concurrent", "primary", "unresolved"]),
    startMonth: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
      .nullable(),
  })
  .strict();
const projectFactOutputSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(?:0[1-9]|1[0-2])$/u)
      .nullable(),
    evaluatedRequirementIds: z.array(z.string().trim().min(1)),
    evidence: z.array(agentEvidenceSchema),
    id: z.string().trim().min(1),
    matchedRequirementIds: z.array(z.string().trim().min(1)),
    relevanceStatus: z.enum(["insufficient_evidence", "not_relevant", "relevant"]).optional(),
    relevant: z.boolean(),
    unresolvedRequirementIds: z.array(z.string().trim().min(1)),
  })
  .strict();
export const structuredDimensionOutputSchema = z
  .object({
    employmentEpisodes: z.array(timelineEpisodeOutputSchema).default([]),
    experienceRequirements: z.array(experienceRequirementOutputSchema).default([]),
    projects: z.array(projectFactOutputSchema).default([]),
    ruleJudgments: z.array(semanticRuleJudgmentOutputSchema).default([]),
    skillFacts: z.array(skillFactSchema).default([]),
  })
  .strict();

const adjustmentJudgmentSchema = z
  .object({
    clauseJudgments: z
      .array(
        z
          .object({
            clauseIndex: z.number().int().nonnegative(),
            evidence: z.array(agentEvidenceSchema).default([]),
            matched: z.boolean(),
            reason: z.string().trim().min(1),
          })
          .strict(),
      )
      .default([]),
    conditionId: z.string().trim().min(1),
    evidence: z.array(agentEvidenceSchema).default([]),
    matched: z.boolean(),
    reason: z.string().trim().min(1),
  })
  .strict();

export const structuredAdjustmentAgentOutputSchema = z.object({
  judgments: z.array(adjustmentJudgmentSchema).default([]),
});

export const structuredNarrativeAgentOutputSchema = z
  .object({
    dimensionComments: z
      .object({
        educationBackground: z.string().trim().min(1),
        experienceRelevance: z.string().trim().min(1),
        potential: z.string().trim().min(1),
        projectMatch: z.string().trim().min(1),
        skillMatch: z.string().trim().min(1),
        stability: z.string().trim().min(1),
      })
      .strict(),
    levelRecommendation: z
      .object({
        level: z.string().trim().min(1),
        rationale: z.string().trim().min(1),
      })
      .strict(),
    overallComment: z.string().trim().min(1),
    recommendation: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    teamPositioning: z
      .object({
        rationale: z.string().trim().min(1),
        suggestion: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

export type StructuredResumeWorkflowInput = z.infer<typeof structuredResumeWorkflowInputSchema>;
type DimensionAgentOutput = z.infer<typeof structuredDimensionAgentOutputSchema>;
type ParsedDimensionFacts = z.infer<typeof structuredDimensionOutputSchema>;
type ParsedProjectFact = ParsedDimensionFacts["projects"][number];
type DimensionFacts = Omit<ParsedDimensionFacts, "experienceRequirements" | "projects"> & {
  experienceRequirements?: ParsedDimensionFacts["experienceRequirements"];
  projects: (Omit<
    ParsedProjectFact,
    "evaluatedRequirementIds" | "matchedRequirementIds" | "unresolvedRequirementIds"
  > &
    Partial<
      Pick<
        ParsedProjectFact,
        "evaluatedRequirementIds" | "matchedRequirementIds" | "unresolvedRequirementIds"
      >
    >)[];
};
type GateAgentRawOutput = z.infer<typeof structuredGateAgentOutputSchema>;
type GateAgentOutput = z.infer<typeof structuredGateOutputSchema>;
type AdjustmentAgentOutput = z.infer<typeof structuredAdjustmentAgentOutputSchema>;
export type StructuredResumeCalculation = ReturnType<typeof computeStructuredResumeCalculation>;

interface StructuredRuleJudgments {
  educationBackground: StructuredResumeRuleJudgment[];
  experienceRelevance: StructuredResumeRuleJudgment[];
  potential: StructuredResumeRuleJudgment[];
  projectMatch: StructuredResumeRuleJudgment[];
  skillMatch: StructuredResumeRuleJudgment[];
  stability: StructuredResumeRuleJudgment[];
}

const STRUCTURED_GRADE_LABELS = {
  matched: "匹配",
  recommended: "推荐",
  unmatched: "不匹配",
} as const;

const STRUCTURED_GATE_LABELS = {
  failed: "未通过",
  needs_verification: "待核实",
  passed: "通过",
} as const;

const STRUCTURED_DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} as const;

function compactPromptString(value: string | null, maxCharacters = 400): string | null {
  return value === null ? null : value.slice(0, maxCharacters);
}

function getReusableScoringFacts(input: StructuredResumeWorkflowInput): ResumeScoringFacts {
  const profile = input.resumeInput.resumeProfile;
  return normalizeResumeScoringFacts({
    facts: profile.scoringFacts,
    projectExperienceCount: profile.projectExperiences.length,
    skills: profile.skills,
    workExperienceCount: profile.workExperiences.length,
  });
}

function buildCompactResumeProfile(input: StructuredResumeWorkflowInput): JsonValue {
  const profile = input.resumeInput.resumeProfile;
  const scoringFacts = getReusableScoringFacts(input);
  return {
    age: profile.age,
    educationExperiences: (profile.educationExperiences ?? []).map((item) => ({
      degree: compactPromptString(item.degree, 100),
      educationLevel: compactPromptString(item.educationLevel, 100),
      graduationYear: compactPromptString(item.graduationYear, 100),
      major: compactPromptString(item.major, 160),
      period: compactPromptString(item.period, 100),
      school: compactPromptString(item.school, 160),
      summary: compactPromptString(item.summary),
    })),
    personalStrengths: profile.personalStrengths.map((item) => item.slice(0, 300)),
    projectExperiences: profile.projectExperiences.map((item) => ({
      name: compactPromptString(item.name, 160),
      role: compactPromptString(item.role, 160),
      summary: compactPromptString(item.summary),
      techStack: item.techStack.map((value) => value.slice(0, 100)),
    })),
    schools: profile.schools.map((item) => item.slice(0, 160)),
    scoringFacts,
    targetRoles: profile.targetRoles.map((item) => item.slice(0, 160)),
    workExperiences: profile.workExperiences.map((item) => ({
      company: compactPromptString(item.company, 160),
      role: compactPromptString(item.role, 160),
      summary: compactPromptString(item.summary),
    })),
    workYears: profile.workYears,
  };
}

export const structuredResumePromptContextSchema = z
  .object({
    compactResumeProfile: z.json(),
  })
  .strict();
export type StructuredResumePromptContext = z.infer<typeof structuredResumePromptContextSchema>;

export function createStructuredResumePromptContext(
  input: StructuredResumeWorkflowInput,
): StructuredResumePromptContext {
  const compactResumeProfile = z.json().parse(buildCompactResumeProfile(input));
  return { compactResumeProfile };
}

function buildProjectMatchRequirements(
  input: StructuredResumeWorkflowInput,
): ProjectMatchRequirement[] {
  return input.jobSnapshot.blueprint.dimensionExpectations.projectMatch.map(
    (expectation, index) => ({
      expectation: expectation.expectation,
      kind: "project_expectation" as const,
      requirementId: `project-expectation-${index}`,
      sourceText: expectation.sourceText,
    }),
  );
}

const STRUCTURED_DIMENSION_RULE_GUIDANCE = [
  `扣分规则目录版本：${STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION}`,
  "只判断下列规则的事实状态；不得自行创造、合并或修改规则：",
  "education.below_tier：仅在岗位蓝图有明确学历层级时适用；按 associate→bachelor→master→doctorate 比较，每低一个学历层级返回 1 units，最多 3。",
  "只有 education.below_tier 且 status=matched 时返回 units；其余所有情况必须省略 units 字段。",
  "education.major_unrelated：仅在岗位蓝图有明确专业要求且候选人学历层级达标时，判断专业是否无关。",
  "experience.industry_unrelated：仅在岗位蓝图有行业、领域、角色或能力相关性基准时，判断相关经历是否完全不匹配。",
  "experience.fragmented：仅在岗位蓝图有相关经验基准时，判断相关经历是否碎片化并伴随反复转行或断档。",
  "project.scale_low：仅在岗位蓝图有项目要求时，判断项目规模或业务复杂度是否低于要求。",
  "project.edge_participation：仅在岗位蓝图有项目要求时，判断候选人是否仅边缘参与而非核心负责人。",
  "project.no_relevant_project：仅在岗位蓝图有项目要求时，判断是否完全没有相关业务项目证据。",
  "potential.no_growth_two_years：判断最近两年是否没有新技能、证书或进阶项目成长记录。",
  "potential.illogical_switches：判断是否存在无逻辑的频繁跨行、职业方向混乱。",
  "stability.frequent_unrelated_industries：判断是否频繁切换完全无关行业。",
  "每条语义规则最多返回一次。规则适用但候选侧证据不足时返回 insufficient_evidence；岗位侧基准缺失时返回 not_applicable。",
  "ruleJudgments 必须覆盖 requiredSemanticRuleIds 的每一项且不得重复；即使不适用也必须显式返回 not_applicable，禁止省略后依赖代码补默认值。",
  "status=insufficient_evidence 时必须返回非空 missingInputs，逐项说明缺少哪个候选字段；如果现有事实足以判断风险没有发生，必须返回 not_matched，不能用 insufficient_evidence 表达‘未观察到’、‘未达到’或‘切换尚可’。",
  "技能不得通过 ruleJudgments 返回。以岗位蓝图 coreSkills 和 auxiliarySkills 去重，core 优先；每个去重后的岗位技能必须且只能返回一个 skillFacts，status 只能是 applied、shallow、missing。",
  "同一技能不得同时返回 shallow 与 missing。applied 表示有实际运用证据；shallow 表示仅提及或浅层了解、无实操；missing 表示简历中没有该岗位技能。",
  "matched、applied、shallow 必须提供来源引文；missing、not_applicable 或证据确实不足时可以返回空 evidence，禁止编造不存在的引文。",
  "生成 quote 前必须在对应来源中逐字查找并复制粘贴最短连续片段；禁止使用省略号（... 或 …），禁止拼接被其他文字隔开的片段。",
  "resume_profile 的 quote 只能复制 JSON 中的字符串值；禁止把 JSON 字段名当作 quote，例如 projectExperiences、workExperiences。找不到逐字连续证据时返回空 evidence 和证据不足状态。",
  "employmentEpisodes 的岗位相关性证据只能引用公司、职位或职责中的字符串叶子值，使用多条 evidence 表达；projects 同理，只引用项目名称或描述中的单个连续原文片段。",
  "每项最多 2 条证据，每条 quote 只引用能支持判断的最短原文片段；reason 保持简洁。",
  "employmentEpisodes 必须覆盖 resumeProfile.scoringFacts.employmentEpisodes 的每一项；id 使用 work-{sourceIndex}。只返回 id、岗位相关性、原因和证据；不得重复返回日期、在职状态、主职/并发关系或空档说明，这些字段由代码从评分事实补齐。",
  "experienceRequirements 必须覆盖输入中的每条 experienceRequirements；对每条要求从 employmentEpisodes 中选择真正满足该独立口径的 episodeIds，不得计算年限。status=matched 时 episodeIds 非空；没有相关经历时 status=not_matched 且 episodeIds=[]；字段缺失导致无法判断时才返回 insufficient_evidence 和非空 missingInputs。",
  "projects 的 id 使用 project-{sourceIndex}；每个项目必须逐项判断 projectRequirements，并在 requirementJudgments 中覆盖全部 requirementId；不得返回总 relevant 布尔值，项目相关性由代码从逐项判断归纳。",
  "每个项目还必须返回 roleRelevance，独立判断项目是否属于目标岗位的业务领域；这与是否完整命中某条高阶 projectRequirement 是两个概念。SEO 流量增长项目即使没有完整 ROI 数据，仍可与 SEO 岗位相关。",
  "roleRelevance.status=matched 表示业务领域直接相关，必须给出项目名称、职责或描述证据；not_matched 仅用于项目明确属于无关领域；无法判断时返回 insufficient_evidence 和非空 missingInputs。",
  "项目判断必须以项目名称、职责、summary 和 techStack 为准，不得仅因候选人公司行业标签不同而判不相关；直播、音视频协议、内容互动等直接落地证据必须与视频/内容平台要求逐项比较。",
  "项目要求 status=matched 时必须给出支持该要求的最短引文；status=insufficient_evidence 时必须给出非空 missingInputs；事实足以判断未命中时返回 not_matched。每个项目要求无论状态都必须给出具体 reason，禁止整批无理由返回 not_matched。",
  "技术治理项目必须逐项对照项目原文：服务拆分、缓存、消息队列削峰、分库分表、慢查询优化、千万级或 TB 级数据处理等证据可支持复杂技术治理要求，不得因业务行业不同而一律判为不匹配。",
  "技能的 applied / shallow 判断先复用 resumeProfile.scoringFacts.skillFacts 的 evidenceLevel 和 evidence，但 mentioned 只是最低证据等级而非上限；语言对应的框架或生态有明确项目实操证据时，可以升级为 applied，例如 Spring Boot/Spring Cloud 可支持 Java 实操。岗位技能未出现在这些事实中时才返回 missing。",
  "projects 必须覆盖 resumeProfile.scoringFacts.projects 的每一项且每个 id 只能出现一次；每个项目内 requirementJudgments 必须覆盖全部 projectRequirements 且每个 requirementId 只能出现一次，禁止省略不匹配项。",
].join("\n");

interface StructuredResumePromptBase {
  evaluationAsOf: string;
  resumeProfile: JsonValue;
}

interface HardGatePromptPayload extends StructuredResumePromptBase {
  hardGateRequirements: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["hardGateRequirements"];
}

interface DimensionPromptPayload extends StructuredResumePromptBase {
  enabledRuleIds: string[];
  experienceRequirements: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["requiredRelevantExperiences"];
  jobExpectations: Pick<
    StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"],
    "auxiliarySkills" | "coreSkills" | "dimensionExpectations" | "educationExpectation"
  >;
  projectRequirements: ProjectMatchRequirement[];
  requiredSemanticRuleIds: readonly (typeof semanticRuleIds)[number][];
}

interface ProjectMatchRequirement {
  expectation: string;
  kind: "project_expectation";
  requirementId: string;
  sourceText: string;
}

const TECHNICAL_PROJECT_REQUIREMENT_PATTERN =
  /(?:高并发|大流量|服务拆分|缓存|限流|熔断|数据库优化|慢查询|技术治理|高可用)/u;
const BUSINESS_PROJECT_REQUIREMENT_PATTERN =
  /(?:内容分发|用户体系|活动任务|互动玩法|会员|广告|商业化|拉新|留存|内容推荐|用户分层)/u;
const TECHNICAL_PROJECT_EVIDENCE_PATTERNS = [
  /(?:Redis|缓存)/iu,
  /(?:Kafka|RabbitMQ|消息队列|削峰)/iu,
  /(?:分库分表|数据库优化|查询瓶颈|亿级)/u,
  /(?:千万级|TB\s*级|高并发|吞吐|性能提升|降低数据库压力|横向扩展)/iu,
  /(?:微服务|分布式事务|多数据源)/u,
] as const;

function projectEvidenceFragment(value: string, pattern: RegExp): string | null {
  const match = value.match(
    new RegExp(`[^。；\\n]{0,24}(?:${pattern.source})[^。；\\n]{0,56}`, pattern.flags),
  );
  return match?.[0]?.trim() || null;
}

function deterministicTechnicalProjectEvidence(
  input: StructuredResumeWorkflowInput,
  projectId: string,
  requirement: ProjectMatchRequirement,
): z.infer<typeof structuredResumeEvidenceSchema>[] {
  if (
    !TECHNICAL_PROJECT_REQUIREMENT_PATTERN.test(
      `${requirement.expectation}${requirement.sourceText}`,
    ) ||
    BUSINESS_PROJECT_REQUIREMENT_PATTERN.test(`${requirement.expectation}${requirement.sourceText}`)
  ) {
    return [];
  }
  const sourceIndex = Number(projectId.replace(/^project-/u, ""));
  const project = input.resumeInput.resumeProfile.projectExperiences[sourceIndex];
  if (!project) {
    return [];
  }
  const values = [project.name, project.role, project.summary, ...project.techStack].filter(
    (value): value is string => Boolean(value),
  );
  const matchesByCategory = TECHNICAL_PROJECT_EVIDENCE_PATTERNS.map((pattern) => {
    for (const value of values) {
      const fragment = projectEvidenceFragment(value, pattern);
      if (fragment) {
        return fragment;
      }
    }
    return null;
  });
  const matchedFragments = matchesByCategory.filter((fragment): fragment is string =>
    Boolean(fragment),
  );
  const strongGovernanceFragments = matchesByCategory
    .slice(2)
    .filter((fragment): fragment is string => Boolean(fragment));
  if (matchedFragments.length < 2 || strongGovernanceFragments.length === 0) {
    return [];
  }
  const selectedFragments = [
    strongGovernanceFragments[0],
    ...matchedFragments.filter((fragment) => fragment !== strongGovernanceFragments[0]),
  ];
  return [...new Set(selectedFragments)].slice(0, 2).map((quote) => ({
    quote,
    source: "resume_profile" as const,
  }));
}

interface AdjustmentPromptPayload extends StructuredResumePromptBase {
  canonicalDimensionFacts?: ParsedDimensionFacts;
  conditionClauses: { clauses: string[]; conditionId: string }[];
  exclusionConditions: StructuredResumeWorkflowInput["jobSnapshot"]["publishedConfig"]["exclusionConditions"];
  preservedJudgments?: AdjustmentAgentOutput["judgments"];
  priorityConditions: StructuredResumeWorkflowInput["jobSnapshot"]["publishedConfig"]["priorityConditions"];
}

type StructuredResumePromptPayload =
  | AdjustmentPromptPayload
  | DimensionPromptPayload
  | HardGatePromptPayload;

const STRUCTURED_RESUME_MISSING_DATA_GUIDANCE = [
  "候选人简历可能没有教育、工作、项目、技能或日期信息；没有证据时不得编造。",
  "JSON 不支持 undefined：数组没有内容时返回 []，无法确认的日期或说明字段返回 null；可选字段也可以直接省略。",
  "候选人没有某类经历不等于结构错误：规则判断使用 insufficient_evidence / not_applicable / not_matched，技能事实使用 missing / shallow；都必须保留对应字段。",
].join("\n");

const STRUCTURED_GATE_OUTPUT_EXAMPLE = JSON.stringify({
  judgments: [
    {
      aiStatus: "passed",
      evidence: [],
      experienceEpisodes: [
        {
          evidence: [{ quote: "2022.5-至今", source: "resume_profile" }],
          id: "work-0",
        },
      ],
      reason: "结构化任职事实满足该经验门槛。",
      requirementId: "requirement-id",
    },
  ],
});

const STRUCTURED_DIMENSION_OUTPUT_EXAMPLE = JSON.stringify({
  employmentEpisodes: [],
  experienceRequirements: [
    {
      episodeIds: ["work-0"],
      evidence: [{ quote: "后端开发工程师", source: "resume_profile" }],
      missingInputs: [],
      reason: "该任职属于要求的经验口径。",
      requirementId: "experience-requirement-id",
      status: "matched",
    },
  ],
  projects: [
    {
      id: "project-0",
      requirementJudgments: [
        {
          evidence: [],
          missingInputs: [],
          reason: "项目事实未体现该项岗位要求。",
          requirementId: "project-expectation-0",
          status: "not_matched",
        },
      ],
      roleRelevance: {
        evidence: [{ quote: "SEO 流量增长项目", source: "resume_profile" }],
        missingInputs: [],
        reason: "项目属于目标岗位的业务领域。",
        status: "matched",
      },
    },
  ],
  ruleJudgments: [],
  skillFacts: [],
});

const STRUCTURED_ADJUSTMENT_OUTPUT_EXAMPLE = JSON.stringify({
  judgments: [
    {
      clauseJudgments: [
        {
          clauseIndex: 0,
          evidence: [],
          matched: false,
          reason: "简历未提供该子条件的证据。",
        },
      ],
      conditionId: "condition-id",
      evidence: [],
      matched: false,
      reason: "简历未提供该条件的相关证据。",
    },
  ],
});

function buildAdjustmentConditionClauses(condition: string): string[] {
  if (/(?:任一|任意|或者|或|等)/u.test(condition)) {
    return [condition.trim()];
  }
  const clauses = condition
    .split(/(?:、|，|,|；|;|并且|同时|且)/u)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
  return clauses.length > 0 ? clauses : [condition.trim()];
}

function validateAdjustmentClauseCoverage(
  input: StructuredResumeWorkflowInput,
  output: AdjustmentAgentOutput,
): void {
  const conditions = [
    ...input.jobSnapshot.publishedConfig.priorityConditions,
    ...input.jobSnapshot.publishedConfig.exclusionConditions,
  ];
  const judgmentsById = new Map(
    output.judgments.map((adjustmentJudgment) => [
      adjustmentJudgment.conditionId,
      adjustmentJudgment,
    ]),
  );
  if (
    judgmentsById.size !== output.judgments.length ||
    judgmentsById.size !== conditions.length ||
    conditions.some((condition) => !judgmentsById.has(condition.id))
  ) {
    throw new Error(
      `STRUCTURED_RESUME_ADJUSTMENT_COVERAGE_MISMATCH：预期 ${conditions.length} 项，实际 ${judgmentsById.size} 项`,
    );
  }
  for (const condition of conditions) {
    const adjustmentResult = judgmentsById.get(condition.id);
    if (!adjustmentResult) {
      throw new Error(`STRUCTURED_RESUME_ADJUSTMENT_COVERAGE_MISMATCH：缺少 ${condition.id}`);
    }
    const clauses = buildAdjustmentConditionClauses(condition.condition);
    const clauseIndexes = new Set(
      adjustmentResult.clauseJudgments.map((clauseJudgment) => clauseJudgment.clauseIndex),
    );
    if (
      clauseIndexes.size !== adjustmentResult.clauseJudgments.length ||
      clauseIndexes.size !== clauses.length ||
      [...clauseIndexes].some((clauseIndex) => clauseIndex >= clauses.length)
    ) {
      throw new Error(
        `STRUCTURED_RESUME_ADJUSTMENT_CLAUSE_COVERAGE_MISMATCH：${condition.id} 预期 ${clauses.length} 项，实际 ${clauseIndexes.size} 项`,
      );
    }
  }
}

function validateEducationTierUnits(output: DimensionAgentOutput): void {
  const educationTierJudgment = output.ruleJudgments.find(
    (ruleJudgment) => ruleJudgment.ruleId === "education.below_tier",
  );
  if (educationTierJudgment?.status === "matched" && educationTierJudgment.units === undefined) {
    throw new Error("STRUCTURED_RESUME_EDUCATION_TIER_UNITS_MISSING：学历层级扣分必须返回层级差");
  }
}

function validateSemanticRuleCoverage(output: DimensionAgentOutput): void {
  const returnedRuleIds = new Set(
    output.ruleJudgments.map((semanticJudgment) => semanticJudgment.ruleId),
  );
  if (
    returnedRuleIds.size !== output.ruleJudgments.length ||
    returnedRuleIds.size !== semanticRuleIds.length ||
    semanticRuleIds.some((ruleId) => !returnedRuleIds.has(ruleId))
  ) {
    throw new Error(
      `STRUCTURED_RESUME_SEMANTIC_RULE_COVERAGE_MISMATCH：预期 ${semanticRuleIds.length} 项，实际 ${returnedRuleIds.size} 项`,
    );
  }
}

const STRUCTURED_NARRATIVE_OUTPUT_EXAMPLE = JSON.stringify({
  dimensionComments: {
    educationBackground: "简历未提供足够的学历信息，无法确认该维度的更多细节。",
    experienceRelevance: "简历未提供足够的相关经验信息。",
    potential: "简历未提供足够的成长信息。",
    projectMatch: "简历未提供相关项目证据。",
    skillMatch: "简历未提供足够的技能应用证据。",
    stability: "简历未提供足够的任职连续性信息。",
  },
  levelRecommendation: {
    level: "待确认",
    rationale: "简历信息不足，无法可靠判断级别。",
  },
  overallComment: "简历信息有限，建议在后续环节补充核实。",
  recommendation: "待确认",
  summary: "候选人简历信息有限。",
  teamPositioning: {
    rationale: "当前简历信息不足以确定团队职责方向。",
    suggestion: "待面试确认",
  },
});

function buildPrompt(
  title: string,
  input: StructuredResumeWorkflowInput,
  guidance?: string,
  payload?: StructuredResumePromptPayload,
  outputExample?: string,
): string {
  return [
    title,
    ...(guidance ? [guidance] : []),
    STRUCTURED_RESUME_MISSING_DATA_GUIDANCE,
    "所有判断只能引用本次输入的结构化简历档案；不得要求、读取或重新解析简历原文。",
    "quote 必须是声明来源中的逐字连续片段；本流程只允许使用 resume_profile，并复制其中的单个字符串叶子值，不得跨字段拼接、改写或概括。",
    "每个 quote 必须从下方 resumeProfile JSON 的某一个字符串叶子值中直接复制，或复制其中的连续子串；不在该 JSON 中的文本不得作为 quote。",
    "不得输出扣分、时长合计、维度分、综合分或等级。",
    ...(outputExample
      ? [`输出结构示例（仅示意字段和缺失信息的表达方式，不要照抄示例业务内容）：${outputExample}`]
      : []),
    JSON.stringify(payload ?? input),
  ].join("\n");
}

function structuredResumeContext(
  input: StructuredResumeWorkflowInput,
  promptContext: StructuredResumePromptContext,
) {
  return {
    evaluationAsOf: input.resumeInput.evaluationAsOf,
    resumeProfile: promptContext.compactResumeProfile,
  };
}

const EVIDENCE_FRAGMENT_SEPARATOR = /[\s，。；：、,.!?！？:;（）()【】[\]/|—–-]+/u;
const EVIDENCE_TERMINAL_PUNCTUATION = /[，。；：、,.!?！？:;]+$/u;
const MIN_AUDITABLE_EVIDENCE_FRAGMENT_LENGTH = 8;

function auditableEvidenceFragments(quote: string): string[] {
  const withoutTerminalPunctuation = quote.trim().replace(EVIDENCE_TERMINAL_PUNCTUATION, "");
  return [...new Set([withoutTerminalPunctuation, ...quote.split(EVIDENCE_FRAGMENT_SEPARATOR)])]
    .map((fragment) => fragment.trim())
    .filter(
      (fragment) =>
        fragment.replaceAll(/\s+/g, "").length >= MIN_AUDITABLE_EVIDENCE_FRAGMENT_LENGTH &&
        fragment !== quote,
    )
    .toSorted((left, right) => right.length - left.length);
}

function findAuditableEvidenceCorrection(
  workflowInput: StructuredResumeWorkflowInput,
  evidence: z.infer<typeof structuredResumeEvidenceSchema>,
  allowResumeText: boolean,
): z.infer<typeof structuredResumeEvidenceSchema> | null {
  const sources: ("resume_profile" | "resume_text")[] = allowResumeText
    ? [evidence.source, evidence.source === "resume_text" ? "resume_profile" : "resume_text"]
    : ["resume_profile"];
  for (const quote of auditableEvidenceFragments(evidence.quote)) {
    for (const source of sources) {
      const corrected = { quote, source };
      if (
        areStructuredResumeEvidenceSourcesValid({
          evidence: [corrected],
          resumeProfile: workflowInput.resumeInput.resumeProfile,
          resumeText: allowResumeText ? workflowInput.resumeInput.resumeText : null,
        })
      ) {
        return corrected;
      }
    }
  }
  return null;
}

function validateEvidenceList(
  workflowInput: StructuredResumeWorkflowInput,
  evidence: z.infer<typeof structuredResumeEvidenceSchema>[],
  allowResumeText = false,
): void {
  const mismatches: string[] = [];
  for (const item of evidence) {
    if (
      areStructuredResumeEvidenceSourcesValid({
        evidence: [item],
        resumeProfile: workflowInput.resumeInput.resumeProfile,
        resumeText: allowResumeText ? workflowInput.resumeInput.resumeText : null,
      })
    ) {
      continue;
    }
    let correctedSource: "resume_profile" | "resume_text" = "resume_profile";
    if (allowResumeText && item.source === "resume_profile") {
      correctedSource = "resume_text";
    }
    if (
      areStructuredResumeEvidenceSourcesValid({
        evidence: [{ ...item, source: correctedSource }],
        resumeProfile: workflowInput.resumeInput.resumeProfile,
        resumeText: allowResumeText ? workflowInput.resumeInput.resumeText : null,
      })
    ) {
      item.source = correctedSource;
      continue;
    }
    const correctedEvidence = findAuditableEvidenceCorrection(workflowInput, item, allowResumeText);
    if (correctedEvidence) {
      item.quote = correctedEvidence.quote;
      item.source = correctedEvidence.source;
      continue;
    }
    const quote = item.quote.replaceAll(/\s+/g, " ").slice(0, 120);
    mismatches.push(`${item.source} 未找到逐字引文“${quote}”`);
  }
  if (mismatches.length > 0) {
    throw new Error(`STRUCTURED_RESUME_EVIDENCE_MISMATCH：${mismatches.join("；")}`);
  }
}

function retainAuditableEvidence(
  workflowInput: StructuredResumeWorkflowInput,
  evidence: z.infer<typeof structuredResumeEvidenceSchema>[],
): z.infer<typeof structuredResumeEvidenceSchema>[] {
  return evidence.flatMap((item) => {
    if (
      areStructuredResumeEvidenceSourcesValid({
        evidence: [item],
        resumeProfile: workflowInput.resumeInput.resumeProfile,
        resumeText: null,
      })
    ) {
      return [item];
    }
    const corrected = findAuditableEvidenceCorrection(workflowInput, item, false);
    return corrected ? [corrected] : [];
  });
}

function retainAuditableProfileEvidence(
  workflowInput: StructuredResumeWorkflowInput,
  evidence: z.infer<typeof structuredResumeEvidenceSchema>[],
): z.infer<typeof structuredResumeEvidenceSchema>[] {
  return evidence.flatMap((item) =>
    item.source === "resume_profile" ? retainAuditableEvidence(workflowInput, [item]) : [item],
  );
}

function parseRequiredExperienceYears(value: string): number | null {
  const match = value.normalize("NFKC").match(/(\d+(?:\.\d+)?)\s*年/u);
  if (!match) {
    return null;
  }
  const years = Number(match[1]);
  return Number.isFinite(years) && years > 0 ? years : null;
}

function parseAtomicRequiredExperienceYears(value: string): number | null {
  const normalized = value.normalize("NFKC");
  const yearThresholds = [...normalized.matchAll(/\d+(?:\.\d+)?\s*年/gu)];
  const hasTeamSizeRange = /\d+\s*(?:-|~|～|—|–|至|到)\s*\d+\s*人/u.test(normalized);
  if (yearThresholds.length !== 1 || hasTeamSizeRange) {
    return null;
  }
  return parseRequiredExperienceYears(normalized);
}

function normalizeGateOutputWithReusableFacts(
  input: StructuredResumeWorkflowInput,
  output: GateAgentRawOutput,
): GateAgentOutput {
  const reusableEpisodes = new Map(
    getReusableScoringFacts(input).employmentEpisodes.map((episode) => [
      `work-${episode.sourceIndex}`,
      episode,
    ]),
  );
  const normalized = structuredGateOutputSchema.parse({
    judgments: output.judgments.map((gateResult) => {
      const evidence = retainAuditableProfileEvidence(input, gateResult.evidence);
      const experienceEpisodes = gateResult.experienceEpisodes?.map((episode) => {
        const fact = reusableEpisodes.get(episode.id);
        if (!fact) {
          throw new Error(`STRUCTURED_RESUME_UNKNOWN_EXPERIENCE_EPISODE：${episode.id}`);
        }
        return {
          ...episode,
          current: fact.currentStatus === "current",
          endMonth: fact.endMonth,
          evidence: retainAuditableProfileEvidence(input, episode.evidence),
          startMonth: fact.startMonth,
        };
      });
      const lostEvidence =
        evidence.length < gateResult.evidence.length ||
        (gateResult.experienceEpisodes ?? []).some(
          (episode, index) =>
            episode.evidence.length > (experienceEpisodes?.[index]?.evidence.length ?? 0),
        );
      const hasEvidence =
        evidence.length > 0 ||
        (experienceEpisodes ?? []).some((episode) => episode.evidence.length > 0);
      return {
        ...gateResult,
        aiStatus:
          gateResult.aiStatus === "passed" && lostEvidence && !hasEvidence
            ? "failed"
            : gateResult.aiStatus,
        evidence,
        experienceEpisodes,
        reason:
          gateResult.aiStatus === "passed" && lostEvidence && !hasEvidence
            ? "模型引用的证据无法在简历结构化字段中核验，按无证据未通过处理。"
            : gateResult.reason,
      };
    }),
  });
  validateEvidenceList(
    input,
    normalized.judgments.flatMap((gateJudgment) => [
      ...gateJudgment.evidence,
      ...(gateJudgment.experienceEpisodes ?? []).flatMap((episode) => episode.evidence),
    ]),
  );
  const outputById = new Map(normalized.judgments.map((item) => [item.requirementId, item]));
  const numericExperienceRequirements = input.jobSnapshot.blueprint.hardGateRequirements.flatMap(
    (requirement) => {
      if (
        requirement.category !== "work_experience" ||
        parseAtomicRequiredExperienceYears(requirement.normalizedRequirement) === null
      ) {
        return [];
      }
      return [requirement];
    },
  );
  for (const requirement of numericExperienceRequirements) {
    const result = outputById.get(requirement.requirementId);
    if (!result) {
      const synthesized = {
        aiStatus: "failed" as const,
        evidence: [],
        experienceEpisodes: [],
        reason: "AI 未返回该数值经验要求的有效判断。",
        requirementId: requirement.requirementId,
      };
      normalized.judgments.push(synthesized);
      outputById.set(requirement.requirementId, synthesized);
      continue;
    }
    if (result?.aiStatus === "failed" && result.experienceEpisodes === undefined) {
      result.experienceEpisodes = [];
      continue;
    }
    if (result.experienceEpisodes === undefined) {
      throw new Error(
        `STRUCTURED_RESUME_EXPERIENCE_EPISODES_REQUIRED：${requirement.sourceText} 必须返回 experienceEpisodes`,
      );
    }
  }
  return structuredGateOutputSchema.parse(normalized);
}

function normalizedSkill(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

const SOCIAL_MEDIA_MARKETING_CHANNEL_PATTERN =
  /(?:Reddit|Quora|Facebook|Instagram|LinkedIn|TikTok|YouTube|小红书|微博|微信|知乎)\s*(?:营销|运营)/iu;

function findRelatedReusableSkillFact(
  expectedSkill: string,
  scoringFacts: ResumeScoringFacts,
): ResumeScoringFacts["skillFacts"][number] | undefined {
  if (!normalizedSkill(expectedSkill).includes("社交媒体营销")) {
    return undefined;
  }
  const relatedFacts = scoringFacts.skillFacts.filter((fact) =>
    SOCIAL_MEDIA_MARKETING_CHANNEL_PATTERN.test(fact.normalizedSkill),
  );
  return (
    relatedFacts.find((fact) => fact.evidenceLevel === "applied") ??
    relatedFacts.find((fact) => fact.evidenceLevel === "mentioned")
  );
}

function findProfileSkillApplicationEvidence(
  input: StructuredResumeWorkflowInput,
  expectedSkill: string,
): StructuredResumeSkillAssessment["evidence"] {
  const words = expectedSkill.normalize("NFKC").match(/[A-Za-z][A-Za-z0-9]*/gu) ?? [];
  if (words.length < 2) {
    return [];
  }
  const acronym = words.map((word) => word[0]).join("");
  if (acronym.length < 2) {
    return [];
  }
  const acronymPattern = new RegExp(`(?:^|[^A-Z0-9])${acronym}(?:$|[^A-Z0-9])`, "u");
  const summaries = [
    ...input.resumeInput.resumeProfile.workExperiences.map((item) => item.summary),
    ...input.resumeInput.resumeProfile.projectExperiences.map((item) => item.summary),
  ];
  const matchingSummary = summaries.find((summary) =>
    acronymPattern.test(summary?.normalize("NFKC").toLocaleUpperCase("en-US") ?? ""),
  );
  return matchingSummary ? [{ quote: matchingSummary, source: "resume_profile" }] : [];
}

export function normalizeDimensionOutputWithReusableFacts(
  input: StructuredResumeWorkflowInput,
  output: DimensionAgentOutput,
): ParsedDimensionFacts {
  const scoringFacts = getReusableScoringFacts(input);
  const reusableSkillFacts = new Map(
    scoringFacts.skillFacts.map((fact) => [normalizedSkill(fact.normalizedSkill), fact]),
  );
  const projectRequirements = buildProjectMatchRequirements(input);
  const projectRequirementIds = new Set(
    projectRequirements.map((requirement) => requirement.requirementId),
  );
  const experienceRequirementIds = new Set(
    (input.jobSnapshot.blueprint.requiredRelevantExperiences ?? []).map(
      (requirement) => requirement.requirementId,
    ),
  );
  const employmentById = new Map(output.employmentEpisodes.map((item) => [item.id, item]));
  const reusableEmploymentIds = new Set(
    scoringFacts.employmentEpisodes.map((fact) => `work-${fact.sourceIndex}`),
  );
  const experienceRequirementsById = new Map(
    output.experienceRequirements.map((requirement) => [requirement.requirementId, requirement]),
  );
  if (
    experienceRequirementsById.size !== output.experienceRequirements.length ||
    experienceRequirementsById.size !== experienceRequirementIds.size ||
    [...experienceRequirementIds].some(
      (requirementId) => !experienceRequirementsById.has(requirementId),
    ) ||
    [...experienceRequirementsById].some(
      ([requirementId, requirement]) =>
        !experienceRequirementIds.has(requirementId) ||
        requirement.episodeIds.some((episodeId) => !reusableEmploymentIds.has(episodeId)),
    )
  ) {
    throw new Error(
      `STRUCTURED_RESUME_EXPERIENCE_REQUIREMENT_COVERAGE_MISMATCH：预期 ${experienceRequirementIds.size} 项，实际 ${experienceRequirementsById.size} 项`,
    );
  }
  const projectFactsById = new Map(
    scoringFacts.projects.map((fact) => [`project-${fact.sourceIndex}`, fact]),
  );
  const projectJudgmentsById = new Map(output.projects.map((project) => [project.id, project]));
  if (
    projectJudgmentsById.size !== output.projects.length ||
    projectJudgmentsById.size !== projectFactsById.size ||
    [...projectFactsById.keys()].some((id) => !projectJudgmentsById.has(id)) ||
    [...projectJudgmentsById.keys()].some((id) => !projectFactsById.has(id))
  ) {
    throw new Error(
      `STRUCTURED_RESUME_PROJECT_COVERAGE_MISMATCH：预期 ${projectFactsById.size} 项，实际 ${projectJudgmentsById.size} 项`,
    );
  }
  return structuredDimensionOutputSchema.parse({
    employmentEpisodes: scoringFacts.employmentEpisodes.map((fact) => {
      const id = `work-${fact.sourceIndex}`;
      const employmentJudgment = employmentById.get(id);
      return {
        current: fact.currentStatus === "current",
        endMonth: fact.endMonth,
        evidence: employmentJudgment?.evidence ?? [],
        gapExplanation: fact.gapExplanation,
        id,
        primaryStatus: fact.primaryStatus,
        relevance: employmentJudgment?.relevance ?? "insufficient_evidence",
        relevanceReason:
          employmentJudgment?.relevanceReason ?? "评分事实存在，但岗位相关性证据不足。",
        startMonth: fact.startMonth,
      };
    }),
    experienceRequirements: output.experienceRequirements.map((requirement) => ({
      ...requirement,
      // The selected episode IDs own the deterministic experience calculation. An invalid
      // supplemental quote should not discard an otherwise complete Dimension judgment.
      evidence: retainAuditableEvidence(input, requirement.evidence),
    })),
    projects: [...projectFactsById].map(([id, fact]) => {
      const project = projectJudgmentsById.get(id);
      if (!project) {
        throw new Error(`STRUCTURED_RESUME_PROJECT_COVERAGE_MISMATCH：缺少 ${id}`);
      }
      if ("requirementJudgments" in project) {
        const normalizedRequirementJudgments = project.requirementJudgments.map(
          (projectJudgment) => {
            const requirement = projectRequirements.find(
              (candidate) => candidate.requirementId === projectJudgment.requirementId,
            );
            const deterministicEvidence = requirement
              ? deterministicTechnicalProjectEvidence(input, id, requirement)
              : [];
            return projectJudgment.status !== "matched" && deterministicEvidence.length > 0
              ? {
                  ...projectJudgment,
                  evidence: deterministicEvidence,
                  missingInputs: [],
                  reason:
                    "结构化项目事实同时命中至少两类复杂技术治理证据，按该技术治理要求归一化为命中。",
                  status: "matched" as const,
                }
              : projectJudgment;
          },
        );
        const judgmentsById = new Map(
          normalizedRequirementJudgments.map((requirementJudgment) => [
            requirementJudgment.requirementId,
            requirementJudgment,
          ]),
        );
        if (
          judgmentsById.size !== normalizedRequirementJudgments.length ||
          judgmentsById.size !== projectRequirementIds.size ||
          [...projectRequirementIds].some((requirementId) => !judgmentsById.has(requirementId)) ||
          [...judgmentsById].some(([requirementId]) => !projectRequirementIds.has(requirementId))
        ) {
          throw new Error(
            `STRUCTURED_RESUME_PROJECT_REQUIREMENT_COVERAGE_MISMATCH：${id} 预期 ${projectRequirementIds.size} 项，实际 ${judgmentsById.size} 项`,
          );
        }
        const matched = normalizedRequirementJudgments.filter(
          (requirementJudgment) => requirementJudgment.status === "matched",
        );
        const unresolved = normalizedRequirementJudgments.filter(
          (requirementJudgment) => requirementJudgment.status === "insufficient_evidence",
        );
        const { roleRelevance } = project;
        const relevant = roleRelevance?.status === "matched" || matched.length > 0;
        let relevanceStatus: "insufficient_evidence" | "not_relevant" | "relevant";
        if (relevant) {
          relevanceStatus = "relevant";
        } else if (roleRelevance?.status === "not_matched") {
          relevanceStatus = "not_relevant";
        } else {
          relevanceStatus = "insufficient_evidence";
        }
        return {
          current: fact.currentStatus === "current",
          endMonth: fact.endMonth,
          evaluatedRequirementIds: normalizedRequirementJudgments.map(
            (requirementJudgment) => requirementJudgment.requirementId,
          ),
          evidence: [
            ...(roleRelevance?.status === "matched" ? roleRelevance.evidence : []),
            ...matched.flatMap((requirementJudgment) => requirementJudgment.evidence),
          ],
          id,
          matchedRequirementIds: matched.map(
            (requirementJudgment) => requirementJudgment.requirementId,
          ),
          relevanceStatus,
          relevant,
          unresolvedRequirementIds: unresolved.map(
            (requirementJudgment) => requirementJudgment.requirementId,
          ),
        };
      }
      if (projectRequirementIds.size > 0) {
        throw new Error(
          `STRUCTURED_RESUME_PROJECT_REQUIREMENT_COVERAGE_MISMATCH：${id} 未返回逐项要求判断`,
        );
      }
      return {
        current: fact.currentStatus === "current",
        endMonth: fact.endMonth,
        evaluatedRequirementIds: [],
        evidence: project.evidence,
        id,
        matchedRequirementIds: [],
        relevanceStatus: project.relevant ? "relevant" : "not_relevant",
        relevant: project.relevant,
        unresolvedRequirementIds: [],
      };
    }),
    ruleJudgments: output.ruleJudgments,
    skillFacts: output.skillFacts.map((skill) => {
      const exactFact = reusableSkillFacts.get(normalizedSkill(skill.normalizedSkill));
      const relatedFact =
        exactFact ?? findRelatedReusableSkillFact(skill.normalizedSkill, scoringFacts);
      const reusableEvidence = retainAuditableProfileEvidence(
        input,
        (relatedFact?.evidence ?? []).map((quote) => ({ quote, source: "resume_profile" })),
      );
      if (relatedFact?.evidenceLevel === "applied" && reusableEvidence.length > 0) {
        return {
          ...skill,
          evidence: reusableEvidence,
          reason: "复用简历解析阶段已核验的技能实操事实。",
          status: "applied" as const,
        };
      }
      if (
        relatedFact?.evidenceLevel === "mentioned" &&
        reusableEvidence.length > 0 &&
        skill.status === "missing"
      ) {
        return {
          ...skill,
          evidence: reusableEvidence,
          reason: "复用简历解析阶段已核验的技能提及事实。",
          status: "shallow" as const,
        };
      }
      const profileApplicationEvidence = findProfileSkillApplicationEvidence(
        input,
        skill.normalizedSkill,
      );
      if (profileApplicationEvidence.length > 0) {
        return {
          ...skill,
          evidence: profileApplicationEvidence,
          reason: "简历经历字段包含可逐字核验的技能应用证据。",
          status: "applied" as const,
        };
      }
      return {
        ...skill,
        evidence: skill.status === "missing" ? [] : skill.evidence,
      };
    }),
  });
}

const RECENT_PROJECT_GROWTH_PATTERN =
  /(?:\bAI\b|\bGEO\b|\bLLM\b|从\s*0\s*到\s*1|增长|提升|突破|升级|重构|优化|自动化|新技术|新技能)/iu;

function recentProjectGrowthEvidence(
  input: StructuredResumeWorkflowInput,
): StructuredResumeRuleJudgment["evidence"] {
  const evaluationMonth = input.resumeInput.evaluationAsOf.slice(0, 7);
  const [evaluationYear, evaluationMonthNumber] = evaluationMonth.split("-").map(Number);
  const cutoffMonth = `${evaluationYear - 2}-${String(evaluationMonthNumber).padStart(2, "0")}`;
  const scoringFacts = getReusableScoringFacts(input);
  for (const fact of scoringFacts.projects) {
    const latestKnownMonth = fact.currentStatus === "current" ? evaluationMonth : fact.endMonth;
    if (!latestKnownMonth || latestKnownMonth < cutoffMonth) {
      continue;
    }
    const project = input.resumeInput.resumeProfile.projectExperiences[fact.sourceIndex];
    const growthEvidence = [project?.name, project?.summary].find((value): value is string =>
      Boolean(value && RECENT_PROJECT_GROWTH_PATTERN.test(value)),
    );
    if (growthEvidence) {
      return [{ quote: growthEvidence, source: "resume_profile" }];
    }
  }
  return [];
}

function sanitizeDimensionProfileEvidence(
  input: StructuredResumeWorkflowInput,
  output: DimensionAgentOutput,
): DimensionAgentOutput {
  for (const episode of output.employmentEpisodes) {
    const previousLength = episode.evidence.length;
    episode.evidence = retainAuditableProfileEvidence(input, episode.evidence);
    if (episode.evidence.length < previousLength) {
      episode.relevance = "insufficient_evidence";
      episode.relevanceReason = "模型引用的相关性证据无法在简历结构化字段中核验。";
    }
  }
  for (const requirement of output.experienceRequirements) {
    requirement.evidence = retainAuditableProfileEvidence(input, requirement.evidence);
  }
  for (const project of output.projects) {
    if ("requirementJudgments" in project) {
      if (project.roleRelevance) {
        const previousLength = project.roleRelevance.evidence.length;
        project.roleRelevance.evidence = retainAuditableProfileEvidence(
          input,
          project.roleRelevance.evidence,
        );
        if (
          project.roleRelevance.status === "matched" &&
          project.roleRelevance.evidence.length < previousLength
        ) {
          project.roleRelevance.status = "insufficient_evidence";
          project.roleRelevance.missingInputs = [
            "需补充可在简历结构化字段中核验的项目领域相关性证据。",
          ];
          project.roleRelevance.reason = "模型引用的项目领域证据无法在简历结构化字段中核验。";
        }
      }
      for (const requirement of project.requirementJudgments) {
        const previousLength = requirement.evidence.length;
        requirement.evidence = retainAuditableProfileEvidence(input, requirement.evidence);
        if (requirement.status === "matched" && requirement.evidence.length < previousLength) {
          requirement.status = "insufficient_evidence";
          requirement.missingInputs = ["需补充可在简历结构化字段中核验的项目证据。"];
          requirement.reason = "模型引用的项目证据无法在简历结构化字段中核验。";
        }
      }
    } else {
      const previousLength = project.evidence.length;
      project.evidence = retainAuditableProfileEvidence(input, project.evidence);
      if (project.relevant && project.evidence.length < previousLength) {
        project.relevant = false;
      }
    }
  }
  for (const ruleJudgment of output.ruleJudgments) {
    const previousLength = ruleJudgment.evidence.length;
    ruleJudgment.evidence = retainAuditableProfileEvidence(input, ruleJudgment.evidence);
    if (ruleJudgment.status === "matched" && ruleJudgment.evidence.length < previousLength) {
      ruleJudgment.status = "insufficient_evidence";
      ruleJudgment.missingInputs = ["需补充可在简历结构化字段中核验的规则证据。"];
      ruleJudgment.reason = "模型引用的规则证据无法在简历结构化字段中核验。";
    }
  }
  for (const skill of output.skillFacts) {
    const previousLength = skill.evidence.length;
    skill.evidence = retainAuditableProfileEvidence(input, skill.evidence);
    if (skill.status !== "missing" && skill.evidence.length < previousLength) {
      skill.status = "missing";
      skill.reason = "模型引用的技能证据无法在简历结构化字段中核验。";
    }
  }
  return output;
}

export async function judgeStructuredHardGates(
  input: StructuredResumeWorkflowInput,
  generate: StructuredResumeGenerator = generateStructuredWithMastraAgent,
  promptContext: StructuredResumePromptContext = createStructuredResumePromptContext(input),
) {
  const gateOwnedRequirements = input.jobSnapshot.blueprint.hardGateRequirements.filter(
    (requirement) => requirement.category !== "required_skills",
  );
  const output = await generate({
    agent: structuredResumeGateAgent,
    allowEmptyDefaults: true,
    fallbackToTextGeneration: true,
    maxOutputTokens: 32_000,
    observabilityLabel: "structured-resume-hard-gates",
    prompt: buildPrompt(
      "逐项判断 Gate 负责的冻结门槛；只返回 passed / failed / needs_verification。",
      input,
      [
        "简历没有写明或没有证据支持门槛要求时，判定 failed，不得仅因候选人可能补充信息而判定 needs_verification。",
        "needs_verification 仅用于简历已有相关证据但证据相互冲突、日期或含义无法可靠确定的情况。",
        "门槛写明数值范围时按闭区间精确判断；只出现高于上限或低于下限的证据不得视为命中，例如带过 8 人团队不等于带过 3-6 人团队。",
        "对每个包含明确年限的 work_experience 门槛，必须返回 experienceEpisodes：只能从 resumeProfile.scoringFacts.employmentEpisodes 选择满足该门槛特定口径的已有任职事实；每项只返回 id=work-{sourceIndex} 和 evidence，不得重复日期或状态字段；完全没有相关经历时返回空数组。",
        "上述数值经验要求的每个 judgment 都必须包含 experienceEpisodes 字段；即使判断为 failed 且没有相关经历，也必须显式返回空数组，禁止省略字段。",
        "required_skills 由统一技能事实层裁决，requiredRelevantExperiences 由 Dimension 裁决；不要返回这两类判断。",
        "能力类复合门槛必须逐项检索 projectExperiences：架构设计、分库分表、缓存、消息队列削峰、性能提升、吞吐指标和负责人角色都属于可用证据，不得在这些事实存在时笼统声称简历未提及。",
      ].join("\n"),
      {
        ...structuredResumeContext(input, promptContext),
        hardGateRequirements: gateOwnedRequirements,
      },
      STRUCTURED_GATE_OUTPUT_EXAMPLE,
    ),
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: structuredGateAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    validate: (candidate) => {
      normalizeGateOutputWithReusableFacts(input, candidate);
    },
  });
  return normalizeGateOutputWithReusableFacts(input, output);
}

export async function judgeStructuredDimensionEvidence(
  input: StructuredResumeWorkflowInput,
  generate: StructuredResumeGenerator = generateStructuredWithMastraAgent,
  promptContext: StructuredResumePromptContext = createStructuredResumePromptContext(input),
) {
  const output = await generate({
    agent: structuredResumeDimensionAgent,
    allowEmptyDefaults: true,
    fallbackToTextGeneration: true,
    maxOutputTokens: 32_000,
    observabilityLabel: "structured-resume-dimension-evidence",
    prompt: buildPrompt(
      "复用已有月级工作时间线、主职/并发关系，只判断窄口径岗位相关性和非时间类规则语义。不要重新解析日期，也不要计算月份或时间窗口。",
      input,
      STRUCTURED_DIMENSION_RULE_GUIDANCE,
      {
        ...structuredResumeContext(input, promptContext),
        enabledRuleIds: Object.entries(input.jobSnapshot.publishedConfig.deductionRules)
          .filter(([, rule]) => rule.enabled)
          .map(([ruleId]) => ruleId),
        experienceRequirements: input.jobSnapshot.blueprint.requiredRelevantExperiences,
        jobExpectations: {
          auxiliarySkills: input.jobSnapshot.blueprint.auxiliarySkills,
          coreSkills: input.jobSnapshot.blueprint.coreSkills,
          dimensionExpectations: input.jobSnapshot.blueprint.dimensionExpectations,
          educationExpectation: input.jobSnapshot.blueprint.educationExpectation,
        },
        projectRequirements: buildProjectMatchRequirements(input),
        requiredSemanticRuleIds: semanticRuleIds,
      },
      STRUCTURED_DIMENSION_OUTPUT_EXAMPLE,
    ),
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: structuredDimensionAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    validate: (candidate) => {
      const sanitized = sanitizeDimensionProfileEvidence(input, candidate);
      const normalized = normalizeDimensionOutputWithReusableFacts(input, sanitized);
      validateEvidenceList(input, [
        ...normalized.employmentEpisodes.flatMap((episode) => episode.evidence),
        ...normalized.experienceRequirements.flatMap((requirement) => requirement.evidence),
        ...normalized.projects.flatMap((project) => project.evidence),
        ...normalized.ruleJudgments.flatMap((semanticJudgment) => semanticJudgment.evidence),
        ...normalized.skillFacts.flatMap((skill) => skill.evidence),
        ...sanitized.projects.flatMap((project) =>
          "requirementJudgments" in project
            ? [
                ...(project.roleRelevance?.evidence ?? []),
                ...project.requirementJudgments.flatMap(
                  (requirementJudgment) => requirementJudgment.evidence,
                ),
              ]
            : [],
        ),
      ]);
      validateEducationTierUnits(sanitized);
      validateSemanticRuleCoverage(sanitized);
    },
  });
  const sanitizedOutput = sanitizeDimensionProfileEvidence(input, output);
  validateEducationTierUnits(sanitizedOutput);
  return normalizeDimensionOutputWithReusableFacts(input, sanitizedOutput);
}

type AdjustmentCondition =
  StructuredResumeWorkflowInput["jobSnapshot"]["publishedConfig"]["priorityConditions"][number];

function validAdjustmentJudgmentsByCondition(
  input: StructuredResumeWorkflowInput,
  conditions: AdjustmentCondition[],
  output: AdjustmentAgentOutput,
): Map<string, AdjustmentAgentOutput["judgments"][number]> {
  const grouped = new Map<string, AdjustmentAgentOutput["judgments"]>();
  for (const adjustmentJudgment of output.judgments) {
    const current = grouped.get(adjustmentJudgment.conditionId) ?? [];
    current.push(adjustmentJudgment);
    grouped.set(adjustmentJudgment.conditionId, current);
  }
  const valid = new Map<string, AdjustmentAgentOutput["judgments"][number]>();
  for (const condition of conditions) {
    const candidates = grouped.get(condition.id) ?? [];
    const [candidate] = candidates;
    if (!candidate || candidates.length !== 1) {
      continue;
    }
    const expectedClauseCount = buildAdjustmentConditionClauses(condition.condition).length;
    const clauseIndexes = new Set(
      candidate.clauseJudgments.map((clauseJudgment) => clauseJudgment.clauseIndex),
    );
    if (
      clauseIndexes.size !== candidate.clauseJudgments.length ||
      clauseIndexes.size !== expectedClauseCount ||
      [...clauseIndexes].some((clauseIndex) => clauseIndex >= expectedClauseCount)
    ) {
      continue;
    }
    try {
      validateEvidenceList(input, [
        ...candidate.evidence,
        ...candidate.clauseJudgments.flatMap((clauseJudgment) => clauseJudgment.evidence),
      ]);
      valid.set(condition.id, candidate);
    } catch {
      // Evidence-invalid items are repaired together with missing/incomplete conditions.
    }
  }
  return valid;
}

function createConservativeUnmatchedAdjustmentJudgment(condition: AdjustmentCondition) {
  return {
    clauseJudgments: buildAdjustmentConditionClauses(condition.condition).map(
      (_clause, clauseIndex) => ({
        clauseIndex,
        evidence: [],
        matched: false,
        reason: "AI 未返回该子条件的有效判断，按无证据未命中处理。",
      }),
    ),
    conditionId: condition.id,
    evidence: [],
    matched: false,
    reason: "AI 修复输出仍不完整，按无证据未命中处理。",
  };
}

export async function judgeStructuredAdjustments(
  input: StructuredResumeWorkflowInput,
  gateOutput?: GateAgentOutput,
  generate: StructuredResumeGenerator = generateStructuredWithMastraAgent,
  promptContext: StructuredResumePromptContext = createStructuredResumePromptContext(input),
  dimensionOutput?: ParsedDimensionFacts,
) {
  const normalizedDimensionOutput = dimensionOutput
    ? structuredDimensionOutputSchema.parse(dimensionOutput)
    : undefined;
  const canonicalGateOutput =
    gateOutput && normalizedDimensionOutput
      ? {
          // Function declarations are intentionally defined with the deterministic scoring
          // implementation below; they are initialized before this function can execute.
          // oxlint-disable-next-line no-use-before-define
          judgments: buildGateJudgments(
            input,
            gateOutput,
            normalizedDimensionOutput,
            // oxlint-disable-next-line no-use-before-define
            deriveStructuredSkillAssessments(input, normalizedDimensionOutput),
          ),
        }
      : gateOutput;
  const gateContext = canonicalGateOutput
    ? `已完成的归一化硬性门槛判断如下；遇到同义或重叠条件时必须保持事实一致：${JSON.stringify(canonicalGateOutput)}`
    : "没有可用的硬性门槛判断上下文。";
  const allConditions = [
    ...input.jobSnapshot.publishedConfig.priorityConditions,
    ...input.jobSnapshot.publishedConfig.exclusionConditions,
  ];
  const generateConditions = (
    conditions: AdjustmentCondition[],
    preservedJudgments: AdjustmentAgentOutput["judgments"] = [],
    isRepair = false,
  ) => {
    const conditionIds = new Set(conditions.map((condition) => condition.id));
    return generate({
      agent: structuredResumeAdjustmentAgent,
      allowEmptyDefaults: true,
      fallbackToTextGeneration: !isRepair,
      observabilityLabel: isRepair
        ? "structured-resume-adjustments-repair"
        : "structured-resume-adjustments",
      prompt: buildPrompt(
        isRepair
          ? "只补判下列缺失或无效的优先/排除条件。不得重判或修改 preservedJudgments。"
          : "逐项判断冻结的优先/排除条件。缺少证据必须 matched=false。",
        input,
        [
          "必须判断完整条件，不得只命中其中一部分。",
          "逗号、分号、且、并、同时连接的子条件默认按 AND；只有所有 AND 子条件均有明确证据时 matched=true。只有原文明确使用“或”“任一”等表达时才按 OR。",
          "conditionClauses 是代码拆分后的原子条件。每个条件的 clauseJudgments 必须按 clauseIndex 从 0 开始完整覆盖且不得重复；每个子条件独立判断并引用证据。",
          "完整条件是否命中由代码根据 clauseJudgments 计算：所有子条件 matched=true 且各自有证据时才命中。顶层 matched 仅作解释，不能覆盖未命中的子条件。",
          "“等”表示列举项是同类示例而非穷举；有明确证据属于同一类别时，不得仅因名称未逐字列出而判定未命中。",
          "硬性门槛中的 failed 或 needs_verification 事实，不得在同义或重叠的优先/排除条件中无新证据地改判为已命中。",
          gateContext,
        ].join("\n"),
        {
          ...structuredResumeContext(input, promptContext),
          canonicalDimensionFacts: normalizedDimensionOutput,
          conditionClauses: conditions.map((condition) => ({
            clauses: buildAdjustmentConditionClauses(condition.condition),
            conditionId: condition.id,
          })),
          exclusionConditions: input.jobSnapshot.publishedConfig.exclusionConditions.filter(
            (condition) => conditionIds.has(condition.id),
          ),
          preservedJudgments: isRepair ? preservedJudgments : undefined,
          priorityConditions: input.jobSnapshot.publishedConfig.priorityConditions.filter(
            (condition) => conditionIds.has(condition.id),
          ),
        },
        STRUCTURED_ADJUSTMENT_OUTPUT_EXAMPLE,
      ),
      retryOnInvalid: !isRepair,
      retryOnTransient: true,
      schema: structuredAdjustmentAgentOutputSchema,
      temperature: 0,
      timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    });
  };

  const initialOutput = await generateConditions(allConditions);
  const preservedById = validAdjustmentJudgmentsByCondition(input, allConditions, initialOutput);
  const repairConditions = allConditions.filter((condition) => !preservedById.has(condition.id));
  if (repairConditions.length > 0) {
    const repairOutput = await generateConditions(
      repairConditions,
      [...preservedById.values()],
      true,
    );
    const repairedById = validAdjustmentJudgmentsByCondition(input, repairConditions, repairOutput);
    for (const condition of repairConditions) {
      const repaired = repairedById.get(condition.id);
      if (repaired) {
        preservedById.set(condition.id, repaired);
      }
    }
  }
  const mergedOutput = structuredAdjustmentAgentOutputSchema.parse({
    judgments: allConditions.map((condition) => {
      const adjustmentJudgment = preservedById.get(condition.id);
      return adjustmentJudgment ?? createConservativeUnmatchedAdjustmentJudgment(condition);
    }),
  });
  validateAdjustmentClauseCoverage(input, mergedOutput);
  return mergedOutput;
}

function judgment(
  ruleId: StructuredResumeRuleJudgment["ruleId"],
  status: StructuredResumeRuleJudgment["status"],
  reason: string,
  units?: number,
  evidence: StructuredResumeRuleJudgment["evidence"] = [],
): StructuredResumeRuleJudgment {
  const result: StructuredResumeRuleJudgment = {
    evidence,
    reason,
    ruleId,
    status,
  };
  if (units !== undefined) {
    result.units = units;
  }
  return result;
}

function semanticRuleIsApplicable(
  input: StructuredResumeWorkflowInput,
  ruleId: (typeof semanticRuleIds)[number],
): boolean {
  const { blueprint } = input.jobSnapshot;
  const hasExperienceBenchmark =
    blueprint.requiredRelevantExperience !== null ||
    blueprint.dimensionExpectations.experienceRelevance.length > 0;
  const hasProjectBenchmark = blueprint.dimensionExpectations.projectMatch.length > 0;
  switch (ruleId) {
    case "education.below_tier": {
      return (blueprint.educationExpectation?.degreeLevel ?? null) !== null;
    }
    case "education.major_unrelated": {
      return (blueprint.educationExpectation?.majorExpectation ?? null) !== null;
    }
    case "experience.fragmented": {
      return hasExperienceBenchmark;
    }
    case "experience.industry_unrelated": {
      return (
        blueprint.dimensionExpectations.experienceRelevance.length > 0 ||
        (blueprint.requiredRelevantExperience !== null &&
          blueprint.requiredRelevantExperience.relevanceScope !== "total_employment")
      );
    }
    case "project.edge_participation":
    case "project.no_relevant_project":
    case "project.scale_low": {
      return hasProjectBenchmark;
    }
    default: {
      return true;
    }
  }
}

const EDUCATION_LEVEL_RANK = {
  associate: 1,
  bachelor: 2,
  doctorate: 4,
  master: 3,
} as const;

function resumeEducationLevelRank(value: string | null | undefined): number | null {
  const normalized = value?.normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
  if (!normalized) {
    return null;
  }
  if (/博士|doctor|ph\.?d/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.doctorate;
  }
  if (/硕士|研究生|master/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.master;
  }
  if (/本科|学士|bachelor/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.bachelor;
  }
  if (/大专|专科|高职|associate|college/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.associate;
  }
  return null;
}

function deriveEducationLevelJudgment(
  input: StructuredResumeWorkflowInput,
): StructuredResumeRuleJudgment {
  const requiredLevel = input.jobSnapshot.blueprint.educationExpectation?.degreeLevel ?? null;
  if (!requiredLevel) {
    return judgment("education.below_tier", "not_applicable", "岗位蓝图未设置学历层级。");
  }
  const candidates = (input.resumeInput.resumeProfile.educationExperiences ?? []).flatMap(
    (education) => {
      const values = [education.educationLevel, education.degree];
      return values.flatMap((value) => {
        const rank = resumeEducationLevelRank(value);
        return rank === null || !value ? [] : [{ quote: value, rank }];
      });
    },
  );
  const [highest] = candidates.toSorted((left, right) => right.rank - left.rank);
  if (!highest) {
    return judgment(
      "education.below_tier",
      "insufficient_evidence",
      "简历没有可归一化的学历层级。",
    );
  }
  const difference = EDUCATION_LEVEL_RANK[requiredLevel] - highest.rank;
  if (difference <= 0) {
    return {
      evidence: [{ quote: highest.quote, source: "resume_profile" }],
      reason: "由代码按标准学历层级顺序判定，候选人学历已达到岗位要求。",
      ruleId: "education.below_tier",
      status: "not_matched",
    };
  }
  return {
    evidence: [{ quote: highest.quote, source: "resume_profile" }],
    reason: `由代码按标准学历层级顺序判定，候选人学历低于岗位要求 ${difference} 档。`,
    ruleId: "education.below_tier",
    status: "matched",
    units: Math.min(difference, 3),
  };
}

export function deriveStructuredSkillAssessments(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
): StructuredResumeSkillAssessment[] {
  const expectations = new Map<
    string,
    {
      expectationType: "auxiliary" | "core";
      normalizedSkill: string;
      requirementGroupId: string;
      satisfactionMode: "all" | "any";
      sourceRef: StructuredResumeSkillAssessment["sourceRef"];
      sourceText: string;
    }
  >();
  for (const item of input.jobSnapshot.blueprint.coreSkills) {
    expectations.set(normalizedSkill(item.normalizedSkill), {
      expectationType: "core",
      normalizedSkill: item.normalizedSkill,
      requirementGroupId: item.requirementGroupId,
      satisfactionMode: item.satisfactionMode,
      sourceRef: item.sourceRef,
      sourceText: item.sourceText,
    });
  }
  for (const item of input.jobSnapshot.blueprint.auxiliarySkills) {
    const key = normalizedSkill(item.normalizedSkill);
    if (!expectations.has(key)) {
      expectations.set(key, {
        expectationType: "auxiliary",
        normalizedSkill: item.normalizedSkill,
        requirementGroupId: item.requirementGroupId,
        satisfactionMode: item.satisfactionMode,
        sourceRef: item.sourceRef,
        sourceText: item.sourceText,
      });
    }
  }

  const factBySkill = new Map<string, (typeof facts.skillFacts)[number]>();
  for (const fact of facts.skillFacts) {
    const key = normalizedSkill(fact.normalizedSkill);
    if (expectations.has(key) && !factBySkill.has(key)) {
      factBySkill.set(key, fact);
    }
  }
  const classified = [...expectations].map(([key, expectation]) => ({
    expectation,
    fact: factBySkill.get(key),
  }));
  return classified.map(({ expectation, fact }) => ({
    evidence: fact?.evidence ?? [],
    expectationType: expectation.expectationType,
    normalizedSkill: expectation.normalizedSkill,
    reason: fact?.reason ?? "AI 未返回该岗位技能的有效判断。",
    requirementGroupId: expectation.requirementGroupId,
    satisfactionMode: expectation.satisfactionMode,
    sourceRef: expectation.sourceRef,
    sourceText: expectation.sourceText,
    status: fact?.status ?? "insufficient_evidence",
  }));
}

function deriveSkillRuleJudgments(
  assessments: StructuredResumeSkillAssessment[],
): StructuredResumeRuleJudgment[] {
  if (assessments.length === 0) {
    return [
      judgment("skill.missing_core", "not_applicable", "岗位蓝图未设置核心技能。"),
      judgment("skill.missing_auxiliary", "not_applicable", "岗位蓝图未设置辅助技能。"),
      judgment("skill.shallow", "not_applicable", "岗位蓝图未设置技能期望。"),
      judgment("skill.no_related_skill", "not_applicable", "岗位蓝图未设置技能期望。"),
    ];
  }
  const grouped = new Map<string, StructuredResumeSkillAssessment[]>();
  for (const assessment of assessments) {
    const group = grouped.get(assessment.requirementGroupId) ?? [];
    group.push(assessment);
    grouped.set(assessment.requirementGroupId, group);
  }
  const effective = [...grouped.values()].map((group) => {
    const [first] = group;
    if (!first) {
      throw new Error("岗位技能要求组不能为空");
    }
    if (first.satisfactionMode === "all") {
      return {
        expectationType: first.expectationType,
        missing: group.filter((item) => item.status === "missing"),
        shallow: group.filter((item) => item.status === "shallow"),
        unresolved: group.some((item) => item.status === "insufficient_evidence"),
      };
    }
    if (group.some((item) => item.status === "applied")) {
      return {
        expectationType: first.expectationType,
        missing: [],
        shallow: [],
        unresolved: false,
      };
    }
    const shallow = group.find((item) => item.status === "shallow");
    if (shallow) {
      return {
        expectationType: first.expectationType,
        missing: [],
        shallow: [shallow],
        unresolved: false,
      };
    }
    const unresolved = group.some((item) => item.status === "insufficient_evidence");
    return {
      expectationType: first.expectationType,
      missing: unresolved ? [] : [first],
      shallow: [],
      unresolved,
    };
  });
  const unresolved = effective.some((group) => group.unresolved);
  const unresolvedCore = effective.some(
    (group) => group.expectationType === "core" && group.unresolved,
  );
  const unresolvedAuxiliary = effective.some(
    (group) => group.expectationType === "auxiliary" && group.unresolved,
  );
  const missingCore = effective.flatMap((group) =>
    group.expectationType === "core" ? group.missing : [],
  );
  const missingAuxiliary = effective.flatMap((group) =>
    group.expectationType === "auxiliary" ? group.missing : [],
  );
  const shallow = effective.flatMap((group) => group.shallow);
  const hasRelatedEvidence = assessments.some(
    (item) => item.status === "applied" || item.status === "shallow",
  );
  const ruleFromCount = (
    ruleId: "skill.missing_auxiliary" | "skill.missing_core" | "skill.shallow",
    items: StructuredResumeSkillAssessment[],
    applicable: boolean,
    hasUnresolvedFacts: boolean,
  ) => {
    if (!applicable) {
      return judgment(ruleId, "not_applicable", "岗位蓝图未设置该类技能期望。");
    }
    if (items.length > 0) {
      return {
        evidence: items.flatMap((item) => item.evidence),
        reason: `按岗位技能要求组归一化，共命中 ${items.length} 个扣分单位；任一满足组最多计 1 个单位。`,
        ruleId,
        status: "matched" as const,
        units: items.length,
      };
    }
    return judgment(
      ruleId,
      hasUnresolvedFacts ? "insufficient_evidence" : "not_matched",
      hasUnresolvedFacts ? "AI 未完整返回全部岗位技能事实。" : "逐项技能事实未命中该规则。",
    );
  };

  let noRelatedSkill = judgment(
    "skill.no_related_skill",
    "insufficient_evidence",
    "技能事实不完整，无法确认是否完全没有岗位相关技能。",
  );
  if (hasRelatedEvidence) {
    noRelatedSkill = judgment(
      "skill.no_related_skill",
      "not_matched",
      "至少一项岗位技能有应用或浅层证据。",
    );
  } else if (!unresolved) {
    noRelatedSkill = {
      evidence: assessments.flatMap((item) => item.evidence),
      reason: "全部去重后的岗位技能均为 missing。",
      ruleId: "skill.no_related_skill",
      status: "matched",
    };
  }
  return [
    ruleFromCount(
      "skill.missing_core",
      missingCore,
      assessments.some((item) => item.expectationType === "core"),
      unresolvedCore,
    ),
    ruleFromCount(
      "skill.missing_auxiliary",
      missingAuxiliary,
      assessments.some((item) => item.expectationType === "auxiliary"),
      unresolvedAuxiliary,
    ),
    ruleFromCount("skill.shallow", shallow, true, unresolved),
    noRelatedSkill,
  ];
}

function normalizedExperienceRequirementKey(value: string, years: number): string {
  const scope = normalizedSkill(value)
    .replaceAll(/\d+(?:\.\d+)?年/gu, "")
    .replaceAll(/至少|不少于|及以上|以上|满|相关|工作|经验|要求/gu, "")
    .replaceAll(/[^\p{L}\p{N}]/gu, "");
  return `${years}:${scope || "total"}`;
}

function linkedTeamSizeQualifiers(
  input: StructuredResumeWorkflowInput,
  requirement: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["hardGateRequirements"][number],
) {
  if (!/管理/u.test(requirement.normalizedRequirement)) {
    return [];
  }
  const requirementText = normalizedSkill(requirement.sourceText);
  return input.jobSnapshot.blueprint.hardGateRequirements.filter((candidate) => {
    if (
      candidate.requirementId === requirement.requirementId ||
      !/(\d+)\s*(?:-|~|～|—|–|至|到)\s*(\d+)\s*人/u.test(
        candidate.normalizedRequirement.normalize("NFKC"),
      ) ||
      !/团队|小组|管理|带过/u.test(candidate.normalizedRequirement)
    ) {
      return false;
    }
    if (
      candidate.sourceRef.kind === requirement.sourceRef.kind &&
      candidate.sourceRef.path === requirement.sourceRef.path
    ) {
      return true;
    }
    const qualifierText = normalizedSkill(candidate.sourceText);
    return input.jobSnapshot.blueprint.dimensionExpectations.experienceRelevance.some(
      (expectation) => {
        const sourceText = normalizedSkill(expectation.sourceText);
        return sourceText.includes(requirementText) && sourceText.includes(qualifierText);
      },
    );
  });
}

// oxlint-disable-next-line complexity -- one deterministic pass merges hard-gate and JD scoring experience requirements without double counting.
function deriveMissingExperienceYearsJudgment(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
  gateOutput?: GateAgentOutput,
): StructuredResumeRuleJudgment {
  const gateOutputById = new Map(
    (gateOutput?.judgments ?? []).map((item) => [item.requirementId, item]),
  );
  const canonicalExperienceById = new Map(
    (facts.experienceRequirements ?? []).map((item) => [item.requirementId, item]),
  );
  const employmentById = new Map(facts.employmentEpisodes.map((episode) => [episode.id, episode]));
  const normalizedGateById = new Map(
    gateOutput
      ? // oxlint-disable-next-line no-use-before-define -- the shared gate normalizer is declared below the rule reducer.
        buildBaseGateJudgments(input, gateOutput).map((item) => [item.requirementId, item])
      : [],
  );
  const hardGateRequirements = input.jobSnapshot.blueprint.hardGateRequirements
    .filter((requirement) => requirement.category === "work_experience")
    .flatMap((requirement) => {
      const years = parseAtomicRequiredExperienceYears(requirement.normalizedRequirement);
      return years === null ? [] : [{ requirement, years }];
    })
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            normalizedExperienceRequirementKey(
              candidate.requirement.normalizedRequirement,
              candidate.years,
            ) ===
            normalizedExperienceRequirementKey(item.requirement.normalizedRequirement, item.years),
        ) === index,
    )
    .map((item) => ({
      ...item,
      relevanceScope: "capability" as const,
      source: "hard_gate" as const,
    }));
  const scoringRequirements = (input.jobSnapshot.blueprint.requiredRelevantExperiences ?? []).map(
    (requirement) => ({
      relevanceScope: requirement.relevanceScope,
      requirement,
      source: "scoring" as const,
      years: requirement.years,
    }),
  );
  // Keep the scoring requirement when the same experience threshold is also a hard gate.
  // Gate remains independently evaluated, while the dimension score must retain its
  // canonical requirementId so it can reuse the normalized experience facts.
  const requirements = [...scoringRequirements, ...hardGateRequirements].filter(
    (item, index, all) =>
      all.findIndex(
        (candidate) =>
          normalizedExperienceRequirementKey(candidate.requirement.sourceText, candidate.years) ===
          normalizedExperienceRequirementKey(item.requirement.sourceText, item.years),
      ) === index,
  );
  const primary = input.jobSnapshot.blueprint.requiredRelevantExperience;

  if (requirements.length === 0) {
    if (!primary) {
      return judgment("experience.missing_year", "not_applicable", "岗位蓝图未设置相关经验年限。");
    }
    const relevant = computeRelevantExperience({
      episodes: facts.employmentEpisodes.map((episode) => ({
        endMonth:
          episode.endMonth ??
          (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
        relevance: episode.relevance,
        startMonth: episode.startMonth,
      })),
      profileWorkYears: input.resumeInput.resumeProfile.workYears ?? undefined,
      relevanceScope: primary.relevanceScope,
      requiredYears: primary.years,
    });
    return judgment(
      "experience.missing_year",
      relevant.status,
      "由代码按冻结口径合并相关工作月份后判定。",
      relevant.missingYearUnits || undefined,
    );
  }

  let hasInsufficientEvidence = false;
  let missingYearUnits = 0;
  const reasons: string[] = [];
  const evidence: z.infer<typeof structuredResumeEvidenceSchema>[] = [];
  for (const { relevanceScope, requirement, source, years } of requirements) {
    const canonicalExperience =
      source === "scoring" ? canonicalExperienceById.get(requirement.requirementId) : undefined;
    if (canonicalExperience) {
      evidence.push(...canonicalExperience.evidence);
      if (canonicalExperience.status === "insufficient_evidence") {
        hasInsufficientEvidence = true;
        reasons.push(`${requirement.sourceText}：统一事实层仍缺少必要输入`);
        continue;
      }
      if (
        canonicalExperience.status === "not_matched" ||
        canonicalExperience.episodeIds.length === 0
      ) {
        const isPrimaryRequirement =
          primary !== null &&
          normalizedExperienceRequirementKey(requirement.sourceText, years) ===
            normalizedExperienceRequirementKey(primary.sourceText, primary.years);
        const primaryRelevantEpisodes = isPrimaryRequirement
          ? facts.employmentEpisodes.filter((episode) => episode.relevance === "relevant")
          : [];
        if (primaryRelevantEpisodes.length > 0) {
          evidence.push(...primaryRelevantEpisodes.flatMap((episode) => episode.evidence));
          const relevant = computeRelevantExperience({
            episodes: primaryRelevantEpisodes.map((episode) => ({
              endMonth:
                episode.endMonth ??
                (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
              relevance: "relevant" as const,
              startMonth: episode.startMonth,
            })),
            profileWorkYears: undefined,
            relevanceScope,
            requiredYears: years,
          });
          if (relevant.status === "insufficient_evidence") {
            hasInsufficientEvidence = true;
            reasons.push(`${requirement.sourceText}：已有相关任职，但时间线不完整`);
          } else {
            missingYearUnits += relevant.missingYearUnits;
            reasons.push(
              `${requirement.sourceText}：${relevant.missingYearUnits > 0 ? `缺少 ${relevant.missingYearUnits} 年` : "已达到"}`,
            );
          }
          continue;
        }
        missingYearUnits += Math.ceil(years);
        reasons.push(`${requirement.sourceText}：统一事实层未发现相关经历`);
        continue;
      }
      const selectedEpisodes = canonicalExperience.episodeIds.flatMap((episodeId) => {
        const episode = employmentById.get(episodeId);
        return episode ? [episode] : [];
      });
      if (selectedEpisodes.length !== canonicalExperience.episodeIds.length) {
        hasInsufficientEvidence = true;
        reasons.push(`${requirement.sourceText}：统一事实层引用了未知任职事实`);
        continue;
      }
      const relevant = computeRelevantExperience({
        episodes: selectedEpisodes.map((episode) => ({
          endMonth:
            episode.endMonth ??
            (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
          relevance: "relevant" as const,
          startMonth: episode.startMonth,
        })),
        profileWorkYears: undefined,
        relevanceScope,
        requiredYears: years,
      });
      if (relevant.status === "insufficient_evidence") {
        hasInsufficientEvidence = true;
        reasons.push(`${requirement.sourceText}：统一事实层的相关经历时间线不完整`);
        continue;
      }
      missingYearUnits += relevant.missingYearUnits;
      reasons.push(
        `${requirement.sourceText}：${relevant.missingYearUnits > 0 ? `缺少 ${relevant.missingYearUnits} 年` : "已达到"}`,
      );
      continue;
    }
    const output = gateOutputById.get(requirement.requirementId);
    const linkedQualifiers =
      source === "hard_gate"
        ? linkedTeamSizeQualifiers(input, requirement).map((qualifier) =>
            normalizedGateById.get(qualifier.requirementId),
          )
        : [];
    if (linkedQualifiers.some((qualifier) => qualifier?.aiStatus === "needs_verification")) {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：关联的团队规模要求待核实`);
      continue;
    }
    const failedQualifier = linkedQualifiers.find((qualifier) => qualifier?.aiStatus === "failed");
    if (failedQualifier) {
      missingYearUnits += Math.ceil(years);
      evidence.push(...failedQualifier.evidence);
      reasons.push(`${requirement.sourceText}：未发现同时满足关联团队规模要求的管理经历`);
      continue;
    }
    if (!output && source === "hard_gate") {
      missingYearUnits += Math.ceil(years);
      reasons.push(`${requirement.sourceText}：AI 未返回该经验门槛，按未命中处理`);
      continue;
    }
    if (!output) {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：AI 未返回该经验评分要求的时间线`);
      continue;
    }
    if (output.aiStatus === "needs_verification") {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：证据待核实`);
      continue;
    }
    if (output.experienceEpisodes === undefined) {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：AI 未返回逐段经验时间线`);
      continue;
    }
    evidence.push(
      ...output.evidence,
      ...output.experienceEpisodes.flatMap((episode) => episode.evidence),
    );
    if (output.experienceEpisodes.length === 0) {
      missingYearUnits += Math.ceil(years);
      reasons.push(`${requirement.sourceText}：未发现相关经历`);
      continue;
    }
    const relevant = computeRelevantExperience({
      episodes: output.experienceEpisodes.map((episode) => ({
        endMonth:
          episode.endMonth ??
          (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
        relevance: "relevant" as const,
        startMonth: episode.startMonth,
      })),
      profileWorkYears: undefined,
      relevanceScope: "capability",
      requiredYears: years,
    });
    if (relevant.status === "insufficient_evidence") {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：相关经历时间线不完整`);
      continue;
    }
    missingYearUnits += relevant.missingYearUnits;
    reasons.push(
      `${requirement.sourceText}：${relevant.missingYearUnits > 0 ? `缺少 ${relevant.missingYearUnits} 年` : "已达到"}`,
    );
  }

  if (hasInsufficientEvidence && missingYearUnits === 0) {
    return {
      evidence,
      reason: reasons.join("；"),
      ruleId: "experience.missing_year",
      status: "insufficient_evidence",
    };
  }
  const judgmentResult: StructuredResumeRuleJudgment = {
    evidence,
    reason: reasons.join("；"),
    ruleId: "experience.missing_year",
    status: missingYearUnits > 0 ? "matched" : "not_matched",
  };
  if (missingYearUnits > 0) {
    judgmentResult.units = missingYearUnits;
  }
  return judgmentResult;
}

// oxlint-disable-next-line complexity -- this deterministic reducer covers the complete fixed rule catalog in one auditable pass.
export function deriveStructuredRuleJudgments(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
  gateOutput?: GateAgentOutput,
  skillAssessments = deriveStructuredSkillAssessments(input, facts),
): StructuredRuleJudgments {
  const judgments: StructuredRuleJudgments = {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  };
  const semanticByRuleId = new Map<
    (typeof semanticRuleIds)[number],
    (typeof facts.ruleJudgments)[number]
  >();
  for (const item of facts.ruleJudgments) {
    if (!semanticByRuleId.has(item.ruleId)) {
      semanticByRuleId.set(item.ruleId, item);
    }
  }
  const educationLevelJudgment = deriveEducationLevelJudgment(input);
  const projectBenchmark =
    input.jobSnapshot.blueprint.dimensionExpectations.projectMatch.length > 0;
  const hasRelevantProject = facts.projects.some((project) => project.relevant);
  const hasUnresolvedProjectRelevance = facts.projects.some(
    (project) => project.relevanceStatus === "insufficient_evidence",
  );
  const recentGrowthEvidence = recentProjectGrowthEvidence(input);
  const temporal = deriveTimelineFacts({
    employmentEpisodes: facts.employmentEpisodes,
    evaluationAsOf: input.resumeInput.evaluationAsOf,
    projects: facts.projects,
  });
  const relevantProjectIds = new Set(
    facts.projects.filter((project) => project.relevant).map((project) => project.id),
  );
  const hasCoreRelevantProjectRole = input.resumeInput.resumeProfile.projectExperiences.some(
    (project, index) =>
      relevantProjectIds.has(`project-${index}`) &&
      /(?:负责人|经理|组长|主程|\bPM\b)/iu.test(project.role ?? ""),
  );
  const technicalProjectRequirementIds = new Set(
    buildProjectMatchRequirements(input)
      .filter((requirement) =>
        /(?:高并发|大流量|服务拆分|缓存|限流|熔断|数据库优化|性能|技术治理|高可用)/u.test(
          `${requirement.expectation}${requirement.sourceText}`,
        ),
      )
      .map((requirement) => requirement.requirementId),
  );
  const hasMatchedTechnicalProject = facts.projects.some((project) =>
    (project.matchedRequirementIds ?? []).some((requirementId) =>
      technicalProjectRequirementIds.has(requirementId),
    ),
  );
  for (const ruleId of semanticRuleIds) {
    const item = semanticByRuleId.get(ruleId);
    const { dimension } = STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId];
    const applicable = semanticRuleIsApplicable(input, ruleId);
    let normalized = judgment(ruleId, "insufficient_evidence", "AI 未返回该规则的有效判断。");
    if (ruleId === "education.below_tier") {
      normalized = educationLevelJudgment;
    } else if (
      ruleId === "education.major_unrelated" &&
      educationLevelJudgment.status === "matched"
    ) {
      normalized = judgment(
        ruleId,
        "not_applicable",
        "候选人学历层级未达标，不重复应用专业不相关扣分。",
      );
    } else if (
      ruleId === "education.major_unrelated" &&
      educationLevelJudgment.status === "insufficient_evidence"
    ) {
      normalized = judgment(ruleId, "insufficient_evidence", "学历层级未决，无法判断专业匹配。");
    } else if (ruleId === "project.no_relevant_project" && applicable) {
      if (hasRelevantProject) {
        normalized = judgment(ruleId, "not_matched", "归一化项目事实中至少包含一个相关项目。");
      } else if (hasUnresolvedProjectRelevance) {
        normalized = judgment(
          ruleId,
          "insufficient_evidence",
          "项目领域相关性证据不足，不能据此认定完全没有相关项目。",
        );
      } else {
        normalized = judgment(ruleId, "matched", "归一化项目事实中没有相关项目。");
      }
    } else if (ruleId === "potential.no_growth_two_years" && recentGrowthEvidence.length > 0) {
      normalized = judgment(
        ruleId,
        "not_matched",
        "最近两年存在带日期且包含明确成长或提升结果的项目记录。",
        undefined,
        recentGrowthEvidence,
      );
    } else if (
      (ruleId === "project.edge_participation" || ruleId === "project.scale_low") &&
      applicable &&
      !hasRelevantProject
    ) {
      normalized = judgment(ruleId, "not_applicable", "没有相关项目，不重复应用项目质量扣分。");
    } else if (applicable && item) {
      normalized = {
        evidence: item.evidence,
        reason: item.reason,
        ruleId,
        status: item.status,
      };
      if (item.status === "not_applicable") {
        if (
          ruleId === "experience.fragmented" &&
          !temporal.hasUnresolvedPrimaryTimeline &&
          temporal.unexplainedGapMonths.length === 0
        ) {
          normalized = judgment(
            ruleId,
            "not_matched",
            "岗位存在相关经验基准；结构化主职时间线完整且没有未解释空档。",
          );
        } else if (
          ruleId === "experience.industry_unrelated" &&
          facts.employmentEpisodes.length > 0 &&
          facts.employmentEpisodes.every((episode) => episode.relevance === "relevant")
        ) {
          normalized = judgment(
            ruleId,
            "not_matched",
            "岗位存在相关性基准；逐段任职事实均已判定为相关。",
          );
        } else if (ruleId === "project.edge_participation" && hasCoreRelevantProjectRole) {
          normalized = judgment(
            ruleId,
            "not_matched",
            "相关项目中存在负责人、经理、组长、主程或 PM 等核心角色。",
          );
        } else if (ruleId === "project.scale_low" && hasMatchedTechnicalProject) {
          normalized = judgment(
            ruleId,
            "not_matched",
            "至少一个项目已命中复杂技术治理或高并发、高可用要求。",
          );
        } else {
          normalized = judgment(
            ruleId,
            "insufficient_evidence",
            "岗位已存在该规则所需基准，但模型未按基准完成有效判断。",
          );
        }
      }
    } else if (!applicable) {
      normalized = judgment(ruleId, "not_applicable", "岗位蓝图未包含该规则所需的来源基准。");
    }
    judgments[dimension].push(normalized);
  }
  judgments.skillMatch.push(...deriveSkillRuleJudgments(skillAssessments));

  judgments.experienceRelevance.push(
    deriveMissingExperienceYearsJudgment(input, facts, gateOutput),
  );

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
  let projectFreshness = judgment(
    "project.old_relevant_project",
    "not_applicable",
    "岗位蓝图未包含项目匹配基准。",
  );
  if (projectBenchmark && !hasRelevantProject) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      "not_applicable",
      "没有相关项目，不重复应用项目新鲜度扣分。",
    );
  } else if (projectBenchmark && temporal.hasUnresolvedRelevantProjectDate) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      "insufficient_evidence",
      "相关项目结束日期无法解析，项目新鲜度未决。",
    );
  } else if (projectBenchmark) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      temporal.oldProjectIds.length > 0 ? "matched" : "not_matched",
      "由代码按三年回看窗口计算相关项目新鲜度。",
    );
  }
  judgments.projectMatch.push(projectFreshness);
  for (const dimension of STRUCTURED_RESUME_DIMENSIONS) {
    judgments[dimension] = judgments[dimension].filter(
      ({ ruleId }) => input.jobSnapshot.publishedConfig.deductionRules[ruleId].enabled,
    );
  }
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

function buildBaseGateJudgments(
  input: StructuredResumeWorkflowInput,
  output: GateAgentOutput,
): StructuredResumeGateJudgment[] {
  const byId = new Map(output.judgments.map((item) => [item.requirementId, item]));
  const educationLevelJudgment = deriveEducationLevelJudgment(input);
  // oxlint-disable-next-line complexity -- one deterministic pass normalizes every supported gate family.
  return input.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => {
    const result = byId.get(requirement.requirementId);
    const normalizedRequirement = requirement.normalizedRequirement.normalize("NFKC");
    const { educationExpectation } = input.jobSnapshot.blueprint;
    const isStandardEducationLevelGate =
      requirement.category === "education" &&
      educationExpectation !== null &&
      educationExpectation.degreeLevel !== null &&
      normalizedSkill(educationExpectation.sourceText) ===
        normalizedSkill(requirement.sourceText) &&
      /^(?:博士|硕士|研究生|本科|学士|大专|专科|高职)(?:及以上|以上)?(?:学历|学位)?$/u.test(
        normalizedRequirement.replaceAll(/\s+/g, ""),
      );
    if (isStandardEducationLevelGate) {
      return {
        aiStatus: educationLevelJudgment.status === "not_matched" ? "passed" : "failed",
        category: requirement.category,
        evidence: educationLevelJudgment.evidence,
        reason:
          educationLevelJudgment.status === "insufficient_evidence"
            ? "简历没有可归一化的学历层级，按未命中处理。"
            : educationLevelJudgment.reason,
        requirementId: requirement.requirementId,
      };
    }
    const requiredExperienceYears =
      requirement.category === "work_experience"
        ? parseAtomicRequiredExperienceYears(normalizedRequirement)
        : null;
    if (requiredExperienceYears !== null && result?.experienceEpisodes !== undefined) {
      const experienceEvidence = [
        ...result.evidence,
        ...result.experienceEpisodes.flatMap((episode) => episode.evidence),
      ];
      if (result.experienceEpisodes.length === 0) {
        return {
          aiStatus: "failed",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: "简历中未发现满足该门槛口径的相关经历。",
          requirementId: requirement.requirementId,
        };
      }
      const relevant = computeRelevantExperience({
        episodes: result.experienceEpisodes.map((episode) => ({
          endMonth:
            episode.endMonth ??
            (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
          relevance: "relevant" as const,
          startMonth: episode.startMonth,
        })),
        profileWorkYears: undefined,
        relevanceScope: "capability",
        requiredYears: requiredExperienceYears,
      });
      if (relevant.status === "insufficient_evidence") {
        return {
          aiStatus: "needs_verification",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: "简历包含相关经历，但起止时间不完整或相互冲突，无法确认是否达到门槛年限。",
          requirementId: requirement.requirementId,
        };
      }
      if (relevant.missingYearUnits > 0) {
        return {
          aiStatus: "failed",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: `相关经历约 ${relevant.relevantYears?.toFixed(1)} 年，少于岗位要求的 ${requiredExperienceYears} 年。`,
          requirementId: requirement.requirementId,
        };
      }
      return {
        aiStatus: "passed",
        category: requirement.category,
        evidence: experienceEvidence,
        reason: `相关经历约 ${relevant.relevantYears?.toFixed(1)} 年，达到岗位要求的 ${requiredExperienceYears} 年。`,
        requirementId: requirement.requirementId,
      };
    }
    const teamSizeRange = normalizedRequirement.match(/(\d+)\s*(?:-|~|～|—|–|至|到)\s*(\d+)\s*人/u);
    const evidenceTeamSizes = (result?.evidence ?? []).flatMap((item) =>
      Array.from(item.quote.normalize("NFKC").matchAll(/(\d+)\s*人/gu), (match) =>
        Number(match[1]),
      ),
    );
    const hasOnlyOutOfRangeTeamSizes =
      result?.aiStatus === "passed" &&
      teamSizeRange !== null &&
      evidenceTeamSizes.length > 0 &&
      evidenceTeamSizes.every(
        (size) => size < Number(teamSizeRange[1]) || size > Number(teamSizeRange[2]),
      );
    if (hasOnlyOutOfRangeTeamSizes) {
      return {
        aiStatus: "failed",
        category: requirement.category,
        evidence: result.evidence,
        reason: `简历证据仅体现 ${evidenceTeamSizes.join("、")} 人团队，不在岗位要求的 ${teamSizeRange[1]}-${teamSizeRange[2]} 人范围内。`,
        requirementId: requirement.requirementId,
      };
    }
    const passedReasonAdmitsUnmetClause =
      result?.aiStatus === "passed" &&
      /(?:未达(?:到)?|未满足|不满足|不符合|缺少|无证据)/u.test(result.reason) &&
      !/(?:未发现|不存在|没有)[^。；]{0,12}(?:不满足|不符合)/u.test(result.reason);
    if (passedReasonAdmitsUnmetClause) {
      return {
        aiStatus: "failed",
        category: requirement.category,
        evidence: result.evidence,
        reason: `模型解释明确存在未满足子条件：${result.reason}`,
        requirementId: requirement.requirementId,
      };
    }
    return {
      aiStatus: result?.aiStatus ?? "failed",
      category: requirement.category,
      evidence: result?.evidence ?? [],
      reason: result?.reason ?? "AI 未返回该门槛的有效判断，按简历未命中处理。",
      requirementId: requirement.requirementId,
    };
  });
}

function linkedRequiredSkillAssessments(
  requirement: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["hardGateRequirements"][number],
  assessments: StructuredResumeSkillAssessment[],
): StructuredResumeSkillAssessment[] {
  if (requirement.category !== "required_skills") {
    return [];
  }
  const requirementText = normalizedSkill(requirement.normalizedRequirement);
  return assessments.filter((assessment) => {
    if (assessment.expectationType !== "core") {
      return false;
    }
    const skill = normalizedSkill(assessment.normalizedSkill);
    const source = normalizedSkill(assessment.sourceText);
    return (
      requirementText.includes(skill) || (source.length > 1 && requirementText.includes(source))
    );
  });
}

function expectedRequiredSkillGateStatus(
  requirement: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["hardGateRequirements"][number],
  assessments: StructuredResumeSkillAssessment[],
): StructuredResumeGateJudgment["aiStatus"] | null {
  const linked = linkedRequiredSkillAssessments(requirement, assessments);
  if (linked.length === 0) {
    return null;
  }
  const groups = new Map<string, StructuredResumeSkillAssessment[]>();
  for (const assessment of linked) {
    const group = groups.get(assessment.requirementGroupId) ?? [];
    group.push(assessment);
    groups.set(assessment.requirementGroupId, group);
  }
  const groupStatuses = [...groups.values()].map((group) => {
    const [first] = group;
    if (!first) {
      return "needs_verification" as const;
    }
    if (first.satisfactionMode === "any") {
      if (group.some((assessment) => assessment.status === "applied")) {
        return "passed" as const;
      }
      if (
        group.some(
          (assessment) =>
            assessment.status === "shallow" || assessment.status === "insufficient_evidence",
        )
      ) {
        return "needs_verification" as const;
      }
      return "failed" as const;
    }
    if (group.every((assessment) => assessment.status === "applied")) {
      return "passed" as const;
    }
    if (group.some((assessment) => assessment.status === "missing")) {
      return "failed" as const;
    }
    return "needs_verification" as const;
  });
  if (groupStatuses.some((status) => status === "failed")) {
    return "failed";
  }
  return groupStatuses.some((status) => status === "needs_verification")
    ? "needs_verification"
    : "passed";
}

function findVideoProjectEvidence(
  input: StructuredResumeWorkflowInput,
): z.infer<typeof structuredResumeEvidenceSchema> | null {
  const evidencePatterns = [
    /[^。；\n]{0,20}(?:直播|RTMP|HLS|HTTP-FLV|CDN)[^。；\n]{0,60}/iu,
    /[^。；\n]{0,20}视频[^。；\n]{0,60}/u,
  ] as const;
  for (const pattern of evidencePatterns) {
    for (const project of input.resumeInput.resumeProfile.projectExperiences) {
      const values = [project.name, project.role, project.summary, ...project.techStack];
      for (const value of values) {
        if (!value) {
          continue;
        }
        const match = value.match(pattern);
        if (match?.[0]) {
          return { quote: match[0].trim(), source: "resume_profile" };
        }
      }
    }
  }
  return null;
}

function buildGateJudgments(
  input: StructuredResumeWorkflowInput,
  output: GateAgentOutput,
  _facts: DimensionFacts,
  skillAssessments: StructuredResumeSkillAssessment[],
): StructuredResumeGateJudgment[] {
  const requirementById = new Map(
    input.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => [
      requirement.requirementId,
      requirement,
    ]),
  );
  return buildBaseGateJudgments(input, output).map((gateJudgment) => {
    const requirement = requirementById.get(gateJudgment.requirementId);
    if (!requirement) {
      return gateJudgment;
    }
    if (requirement.category !== "required_skills") {
      const videoEvidence = findVideoProjectEvidence(input);
      if (
        gateJudgment.aiStatus === "failed" &&
        videoEvidence &&
        /(?:视频|内容平台)/u.test(requirement.normalizedRequirement) &&
        /(?:没有(?:任何)?|无(?:任何)?|完全没有|未提及|未涉及)[^。；]{0,30}(?:视频|内容平台|相关证据)/u.test(
          gateJudgment.reason,
        )
      ) {
        return {
          ...gateJudgment,
          evidence: [...gateJudgment.evidence, videoEvidence],
          reason:
            "简历存在视频或直播相关片段，但不足以同时证明该复合门槛要求的内容平台、增长、活动体系及广告或会员商业化落地经验。",
        };
      }
      return gateJudgment;
    }
    const linkedAssessments = linkedRequiredSkillAssessments(requirement, skillAssessments);
    const expectedStatus =
      expectedRequiredSkillGateStatus(requirement, linkedAssessments) ?? "needs_verification";
    const canonicalEvidence = linkedAssessments.flatMap((assessment) => assessment.evidence);
    return {
      ...gateJudgment,
      aiStatus: expectedStatus,
      evidence: canonicalEvidence,
      reason:
        linkedAssessments.length > 0
          ? `由统一技能事实层按 ${linkedAssessments.length} 项冻结技能要求归纳为 ${expectedStatus}。`
          : "统一技能事实层未找到与该门槛关联的冻结技能要求，需人工核实。",
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
    const clauses = buildAdjustmentConditionClauses(condition.condition);
    const clauseByIndex = new Map(
      result?.clauseJudgments.map((clauseJudgment) => [clauseJudgment.clauseIndex, clauseJudgment]),
    );
    const hasCompleteClauseCoverage =
      clauseByIndex.size === clauses.length &&
      clauses.every((_, clauseIndex) => clauseByIndex.has(clauseIndex));
    const matched =
      hasCompleteClauseCoverage &&
      clauses.every((_, clauseIndex) => {
        const clauseJudgment = clauseByIndex.get(clauseIndex);
        return clauseJudgment?.matched === true && clauseJudgment.evidence.length > 0;
      });
    const unmatchedReasons = [...clauseByIndex.values()]
      .filter((clauseJudgment) => !clauseJudgment.matched)
      .map((clauseJudgment) => clauseJudgment.reason);
    return {
      conditionId: condition.id,
      evidence: matched
        ? [...clauseByIndex.values()].flatMap((clauseJudgment) => clauseJudgment.evidence)
        : [],
      kind,
      matched,
      points: condition.points,
      reason: unmatchedReasons.join("；") || result?.reason || "简历中没有命中该条件的证据。",
      sourceText: condition.condition,
    };
  });
}

function validateEvidenceSources(input: {
  adjustmentOutput: AdjustmentAgentOutput;
  dimensionOutput: DimensionFacts;
  gateOutput: GateAgentOutput;
  workflowInput: StructuredResumeWorkflowInput;
}): void {
  const evidenceLists = [
    ...input.gateOutput.judgments.map((item) => item.evidence),
    ...input.gateOutput.judgments.flatMap((item) =>
      (item.experienceEpisodes ?? []).map((episode) => episode.evidence),
    ),
    ...input.dimensionOutput.employmentEpisodes.map((item) => item.evidence),
    ...(input.dimensionOutput.experienceRequirements ?? []).map((item) => item.evidence),
    ...input.dimensionOutput.projects.map((item) => item.evidence),
    ...input.dimensionOutput.ruleJudgments.map((item) => item.evidence),
    ...input.dimensionOutput.skillFacts.map((item) => item.evidence),
    ...input.adjustmentOutput.judgments.map((item) => item.evidence),
    ...input.adjustmentOutput.judgments.flatMap((item) =>
      item.clauseJudgments.map((clauseJudgment) => clauseJudgment.evidence),
    ),
  ];
  validateEvidenceList(input.workflowInput, evidenceLists.flat(), true);
}

export function generateStructuredNarrative(
  input: {
    calculationResult: StructuredResumeCalculation;
    workflowInput: StructuredResumeWorkflowInput;
  },
  generate: StructuredResumeGenerator = generateStructuredWithMastraAgent,
) {
  const { calculation, dimensionRuleJudgments } = input.calculationResult;
  const narrativeDimensions = Object.fromEntries(
    STRUCTURED_RESUME_DIMENSIONS.map((dimension) => {
      const result = calculation.dimensions[dimension];
      return [
        dimension,
        {
          appliedDeductions: result.appliedDeductions,
          deductionTotal: result.deductionTotal,
          rawScore: result.rawScore,
          ruleJudgments: dimensionRuleJudgments[dimension],
          weight: result.weight,
          weightedContribution: result.weightedContributionHundredths / 100,
        },
      ];
    }),
  );
  return generate({
    agent: structuredResumeNarrativeAgent,
    fallbackToTextGeneration: true,
    observabilityLabel: "structured-resume-narrative",
    prompt: [
      "只解释已完成的计算，不得重算或修改结果。",
      "未命中的优先条件 appliedPoints=0，不加分也不扣分；未命中的排除条件同样不产生分数变化。",
      "只解释 appliedPoints 实际非零的加减分，不得把未应用的配置 points 写成已加分或已扣分。",
      "门槛状态不改变代码给出的分数等级；必须分别说明门槛状态和理论分数等级。",
      "dimensions.weightedContribution 的单位是分，直接按该值说明，不得放大 100 倍。",
      "overallComment 用 2-4 句话形成整体评语：基于简历事实说明最重要的岗位适配优势和主要风险。不得复述综合分、等级、门槛状态或推荐结论，不得重复 summary，不得创造新事实或改分。",
      "dimensionComments 必须覆盖六个维度。每个维度用 1-2 句话，只概括候选人在该维度的整体表现、主要优势和总体短板；不要输出规则名称、规则编号或逐项规则状态，不要枚举未扣分项和证据不足项，也不要重复分数、权重或扣分数值。实际扣分原因由代码单独展示，不要在评语中逐条复述。units=1 时只能表述为一项，不得写成多项、较多或大批缺失；没有 units 时不得自行推断数量。",
      "teamPositioning.suggestion 给出可执行的团队角色或职责方向，rationale 说明简历事实和岗位依据；不得把建议写成候选人已经具备的事实。",
      "levelRecommendation.level 使用“初级 / 初中级 / 中级 / 中高级 / 高级 / 资深 / 专家”或岗位已有的 P 级；证据不足时可以返回“待确认”。rationale 说明经验、职责范围、项目复杂度和管理证据；不得仅按工作年限判断。",
      "candidateFacts.dataPresence 是代码生成的事实存在性标记：hasEducation=true 时禁止声称简历未提供学历；hasProjects=true 时禁止声称简历没有项目。",
      "candidateFacts.projects.matchedRequirementIds 是统一事实层已经命中的项目要求；不得在任何评语字段中声称这些要求对应的项目、业务或经验缺失、不相关或不匹配。requirement 定义见 candidateFacts.projectRequirements。",
      STRUCTURED_RESUME_MISSING_DATA_GUIDANCE,
      `输出结构示例（仅示意字段和缺失信息的表达方式，不要照抄示例业务内容）：${STRUCTURED_NARRATIVE_OUTPUT_EXAMPLE}`,
      JSON.stringify({
        adjustments: calculation.adjustments,
        candidateFacts: {
          dataPresence: {
            hasEducation:
              (input.workflowInput.resumeInput.resumeProfile.educationExperiences ?? []).length > 0,
            hasProjects:
              input.workflowInput.resumeInput.resumeProfile.projectExperiences.length > 0,
            hasWorkExperiences:
              input.workflowInput.resumeInput.resumeProfile.workExperiences.length > 0,
          },
          educationExperiences:
            input.workflowInput.resumeInput.resumeProfile.educationExperiences ?? [],
          employmentEpisodes: input.calculationResult.normalizedDimensionOutput.employmentEpisodes,
          projectExperiences: input.workflowInput.resumeInput.resumeProfile.projectExperiences,
          projectRequirements: buildProjectMatchRequirements(input.workflowInput),
          projects: input.calculationResult.normalizedDimensionOutput.projects,
          skillAssessments: input.calculationResult.skillAssessments,
        },
        compositeScore: calculation.compositeScore,
        dimensions: narrativeDimensions,
        gates: calculation.gates,
        grade: calculation.grade,
        jobExpectations: input.workflowInput.jobSnapshot.blueprint.dimensionExpectations,
      }),
    ].join("\n"),
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: structuredNarrativeAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
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
  const completeDimensionOutput = structuredDimensionOutputSchema.parse({
    ...dimensionOutput,
    experienceRequirements: dimensionOutput.experienceRequirements ?? [],
    projects: dimensionOutput.projects.map((project) => ({
      ...project,
      evaluatedRequirementIds: project.evaluatedRequirementIds ?? [],
      matchedRequirementIds: project.matchedRequirementIds ?? [],
      unresolvedRequirementIds: project.unresolvedRequirementIds ?? [],
    })),
  });
  const normalizedDimensionOutput =
    workflowInput.jobSnapshot.blueprint.requiredRelevantExperience?.relevanceScope ===
    "total_employment"
      ? {
          ...completeDimensionOutput,
          employmentEpisodes: completeDimensionOutput.employmentEpisodes.map((episode) => ({
            ...episode,
            relevance: "relevant" as const,
            relevanceReason: "岗位采用总工作经验口径，代码将已解析任职统一计为相关经验。",
          })),
        }
      : completeDimensionOutput;
  const skillAssessments = deriveStructuredSkillAssessments(
    workflowInput,
    normalizedDimensionOutput,
  );
  const gateJudgments = buildGateJudgments(
    workflowInput,
    gateOutput,
    normalizedDimensionOutput,
    skillAssessments,
  );
  const dimensionRuleJudgments = deriveStructuredRuleJudgments(
    workflowInput,
    normalizedDimensionOutput,
    gateOutput,
    skillAssessments,
  );
  const adjustments = buildAdjustmentMatches(workflowInput, adjustmentOutput);
  const calculation = computeStructuredResumeEvaluation({
    adjustments,
    deductionRules: workflowInput.jobSnapshot.publishedConfig.deductionRules,
    dimensionRuleJudgments,
    gateJudgments,
    weights: workflowInput.jobSnapshot.publishedConfig.weights,
  });
  return { calculation, dimensionRuleJudgments, normalizedDimensionOutput, skillAssessments };
}

function isStructuredNarrativeFactuallyConsistent(
  summary: string,
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>,
): boolean {
  const expectedGateCounts = {
    failed: calculation.gates.judgments.filter((gateJudgment) => gateJudgment.aiStatus === "failed")
      .length,
    needsVerification: calculation.gates.judgments.filter(
      (gateJudgment) => gateJudgment.aiStatus === "needs_verification",
    ).length,
    total: calculation.gates.judgments.length,
  };
  const allMatchesEqual = (pattern: RegExp, expected: number) =>
    [...summary.matchAll(pattern)].every((match) => Number(match[1]) === expected);
  const weightedContributions = STRUCTURED_RESUME_DIMENSIONS.map(
    (dimension) => calculation.dimensions[dimension].weightedContributionHundredths / 100,
  );
  const hasValidWeightedContributions = [
    ...summary.matchAll(/加权贡献\s*(\d+(?:\.\d+)?)\s*分/g),
  ].every((match) =>
    weightedContributions.some((expected) => Math.abs(Number(match[1]) - expected) <= 0.1),
  );

  return (
    allMatchesEqual(/(?:综合评分|综合得分|最终得分)\s*(\d+)\s*分/g, calculation.compositeScore) &&
    allMatchesEqual(/(\d+)\s*项(?:硬性)?门槛/g, expectedGateCounts.total) &&
    allMatchesEqual(/(\d+)\s*项(?:门槛)?(?:未通过|失败)/g, expectedGateCounts.failed) &&
    allMatchesEqual(
      /(\d+)\s*项(?:门槛)?(?:待核实|需要核实)/g,
      expectedGateCounts.needsVerification,
    ) &&
    hasValidWeightedContributions
  );
}

function buildDeterministicNarrativeSummary(input: {
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>;
  workflowInput: StructuredResumeWorkflowInput;
}): string {
  const { calculation, workflowInput } = input;
  const failedJudgments = calculation.gates.judgments.filter(
    (gateJudgment) => gateJudgment.aiStatus === "failed",
  );
  const needsVerificationJudgments = calculation.gates.judgments.filter(
    (gateJudgment) => gateJudgment.aiStatus === "needs_verification",
  );
  const requirementById = new Map(
    workflowInput.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => [
      requirement.requirementId,
      requirement.normalizedRequirement,
    ]),
  );
  const describeRequirements = (judgments: typeof calculation.gates.judgments) =>
    judgments
      .map((gateJudgment) => requirementById.get(gateJudgment.requirementId))
      .filter((requirement): requirement is string => requirement !== undefined)
      .join("、");
  const gateSummary =
    calculation.gates.judgments.length === 0
      ? "岗位未配置硬性门槛。"
      : [
          `共评估${calculation.gates.judgments.length}项硬性门槛`,
          failedJudgments.length > 0 ? `，其中${failedJudgments.length}项未通过` : "，均已通过",
          needsVerificationJudgments.length > 0
            ? `、${needsVerificationJudgments.length}项待核实`
            : "",
          "。",
          failedJudgments.length > 0 ? `未通过项：${describeRequirements(failedJudgments)}。` : "",
          needsVerificationJudgments.length > 0
            ? `待核实项：${describeRequirements(needsVerificationJudgments)}。`
            : "",
        ].join("");
  const dimensionSummaries = STRUCTURED_RESUME_DIMENSIONS.map((dimension) => {
    const result = calculation.dimensions[dimension];
    return result.deductionTotal > 0
      ? `${STRUCTURED_DIMENSION_LABELS[dimension]}${result.rawScore}分（扣${result.deductionTotal}分）`
      : `${STRUCTURED_DIMENSION_LABELS[dimension]}${result.rawScore}分`;
  }).join("、");
  const adjustmentSummary =
    calculation.priorityPointTotal !== 0 || calculation.exclusionPointTotal !== 0
      ? `岗位条件调整：优先条件${calculation.priorityPointTotal}分，排除条件${calculation.exclusionPointTotal}分。`
      : "";

  return [
    `综合评分${calculation.compositeScore}分，等级为${STRUCTURED_GRADE_LABELS[calculation.grade]}；硬性门槛${STRUCTURED_GATE_LABELS[calculation.gates.effectiveStatus]}。`,
    gateSummary,
    `六维评分：${dimensionSummaries}。`,
    adjustmentSummary,
  ].join("");
}

const NARRATIVE_QUANTITATIVE_CLAIM_PATTERN =
  /\d+(?:\.\d+)?\s*(?:%|％|百万|万|亿|[WK](?![A-Za-z]))/giu;

function hasUnsupportedNarrativeQuantity(value: string, allowedCandidateFacts: string): boolean {
  return [...value.matchAll(NARRATIVE_QUANTITATIVE_CLAIM_PATTERN)].some((match) => {
    const claim = match[0].normalize("NFKC").replaceAll(/\s+/g, "").toLocaleUpperCase("en-US");
    return !allowedCandidateFacts.includes(claim);
  });
}

function reconcileNarrativeQuantities(
  narrative: z.infer<typeof structuredNarrativeAgentOutputSchema>,
  calculationResult: StructuredResumeCalculation,
  workflowInput: StructuredResumeWorkflowInput,
): z.infer<typeof structuredNarrativeAgentOutputSchema> {
  const allowedCandidateFacts = JSON.stringify({
    gates: calculationResult.calculation.gates,
    resumeProfile: workflowInput.resumeInput.resumeProfile,
  })
    .normalize("NFKC")
    .replaceAll(/\s+/g, "")
    .toLocaleUpperCase("en-US");
  const retainOrFallback = (value: string, fallback: string) =>
    hasUnsupportedNarrativeQuantity(value, allowedCandidateFacts) ? fallback : value;
  // SAFETY: every STRUCTURED_RESUME_DIMENSIONS key is emitted exactly once with a string value.
  const dimensionComments = Object.fromEntries(
    STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
      dimension,
      retainOrFallback(
        narrative.dimensionComments[dimension],
        `${STRUCTURED_DIMENSION_LABELS[dimension]}结论以结构化证据和扣分明细为准。`,
      ),
    ]),
  ) as typeof narrative.dimensionComments;
  return {
    ...narrative,
    dimensionComments,
    levelRecommendation: {
      ...narrative.levelRecommendation,
      rationale: retainOrFallback(
        narrative.levelRecommendation.rationale,
        "职级建议以结构化经历、职责范围、项目复杂度和管理证据为准。",
      ),
    },
    overallComment: retainOrFallback(
      narrative.overallComment,
      "候选人的岗位适配优势与主要风险以结构化证据、门槛和六维扣分结果为准。",
    ),
    summary: retainOrFallback(narrative.summary, "具体结论以结构化评分结果为准。"),
    teamPositioning: {
      ...narrative.teamPositioning,
      rationale: retainOrFallback(
        narrative.teamPositioning.rationale,
        "团队定位依据结构化岗位要求与候选人经历证据生成。",
      ),
    },
  };
}

function reconcileNarrativeFacts(
  narrative: z.infer<typeof structuredNarrativeAgentOutputSchema>,
  calculationResult: StructuredResumeCalculation,
  workflowInput: StructuredResumeWorkflowInput,
): z.infer<typeof structuredNarrativeAgentOutputSchema> {
  const educationCount = (workflowInput.resumeInput.resumeProfile.educationExperiences ?? [])
    .length;
  const relevantProjectCount = calculationResult.normalizedDimensionOutput.projects.filter(
    (project) => project.relevant,
  ).length;
  const matchedProjectRequirementIds = new Set(
    calculationResult.normalizedDimensionOutput.projects.flatMap(
      (project) => project.matchedRequirementIds ?? [],
    ),
  );
  const matchedVideoRequirements = buildProjectMatchRequirements(workflowInput).filter(
    (requirement) =>
      matchedProjectRequirementIds.has(requirement.requirementId) &&
      /(?:视频|内容平台)/u.test(requirement.expectation),
  );
  const deniesMatchedVideoRequirement = (value: string) =>
    matchedVideoRequirements.length > 0 &&
    /(?:(?:缺少|缺乏|没有|无)[^。；\n]{0,40}(?:视频|内容平台)|(?:视频|内容平台)[^。；\n]{0,30}(?:不匹配|不相关|未匹配))/u.test(
      value,
    );
  const educationBackground =
    educationCount > 0 &&
    /(?:未提供|没有|无)\s*(?:任何)?学历/u.test(narrative.dimensionComments.educationBackground)
      ? `简历包含 ${educationCount} 段教育经历；学历维度以结构化学历事实和岗位要求为准。`
      : narrative.dimensionComments.educationBackground;
  let { projectMatch } = narrative.dimensionComments;
  if (deniesMatchedVideoRequirement(projectMatch)) {
    projectMatch = `结构化项目事实已命中“${matchedVideoRequirements.map((requirement) => requirement.sourceText).join("、")}”；其他项目要求仍以逐项证据为准。`;
  } else if (
    relevantProjectCount > 0 &&
    /(?:所有项目.*(?:无关|不相关)|没有相关项目|项目匹配度为零)/u.test(projectMatch)
  ) {
    projectMatch = `结构化事实中包含 ${relevantProjectCount} 个相关项目；具体匹配程度以项目规则和证据为准。`;
  }
  const overallComment = deniesMatchedVideoRequirement(narrative.overallComment)
    ? "候选人存在与岗位项目要求直接匹配的项目证据；其他适配优势与风险应结合门槛和六维规则继续核实。"
    : narrative.overallComment;
  const summary = deniesMatchedVideoRequirement(narrative.summary)
    ? "候选人存在与岗位项目要求直接匹配的项目证据，具体适配结论以门槛和六维规则为准。"
    : narrative.summary;
  const teamPositioningRationale = deniesMatchedVideoRequirement(
    narrative.teamPositioning.rationale,
  )
    ? "候选人已有命中岗位项目要求的结构化项目证据，团队职责边界仍需结合面试进一步确认。"
    : narrative.teamPositioning.rationale;
  const factReconciled = {
    ...narrative,
    dimensionComments: {
      ...narrative.dimensionComments,
      educationBackground,
      projectMatch,
    },
    overallComment,
    summary,
    teamPositioning: {
      ...narrative.teamPositioning,
      rationale: teamPositioningRationale,
    },
  };
  return reconcileNarrativeQuantities(factReconciled, calculationResult, workflowInput);
}

export function assembleStructuredResumeEvaluation(input: {
  calculationResult: StructuredResumeCalculation;
  narrative: z.infer<typeof structuredNarrativeAgentOutputSchema>;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  const { calculationResult, narrative, workflowInput } = input;
  const { calculation, dimensionRuleJudgments, normalizedDimensionOutput } = calculationResult;
  const reconciledNarrative = reconcileNarrativeFacts(narrative, calculationResult, workflowInput);
  const narrativeSummary = isStructuredNarrativeFactuallyConsistent(
    reconciledNarrative.summary,
    calculation,
  )
    ? `综合评分${calculation.compositeScore}分，等级为${STRUCTURED_GRADE_LABELS[calculation.grade]}；硬性门槛${STRUCTURED_GATE_LABELS[calculation.gates.effectiveStatus]}。${reconciledNarrative.summary}`
    : buildDeterministicNarrativeSummary({ calculation, workflowInput });
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
    narrative: {
      ...reconciledNarrative,
      recommendation: STRUCTURED_GRADE_LABELS[calculation.grade],
      summary: narrativeSummary,
    },
    requiredRelevantExperience: required
      ? {
          relevanceScope: required.relevanceScope,
          years: required.years,
        }
      : null,
    runId: workflowInput.resumeInput.runId,
    schemaVersion: 1,
    skillAssessments: calculationResult.skillAssessments,
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
    calculationResult,
    workflowInput: input,
  });
  return assembleStructuredResumeEvaluation({
    calculationResult,
    narrative,
    workflowInput: input,
  });
}
