import { z } from "zod";

export const JOB_DESCRIPTION_STRUCTURED_CONFIG_VERSION = 1;
export const JOB_DESCRIPTION_HARD_GATE_MAX_LENGTH = 2000;
export const JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH = 500;
export const JOB_DESCRIPTION_SCORING_CONDITION_LIMIT = 20;

export const structuredResumeRuleIdSchema = z.enum([
  "education.below_tier",
  "education.major_unrelated",
  "experience.fragmented",
  "experience.industry_unrelated",
  "experience.missing_year",
  "potential.illogical_switches",
  "potential.no_growth_two_years",
  "potential.unexplained_gap_over_six_months",
  "project.edge_participation",
  "project.no_relevant_project",
  "project.old_relevant_project",
  "project.scale_low",
  "skill.missing_auxiliary",
  "skill.missing_core",
  "skill.no_related_skill",
  "skill.shallow",
  "stability.frequent_unrelated_industries",
  "stability.gap_over_six_months",
  "stability.gap_three_to_six_months",
  "stability.short_tenure",
  "stability.three_changes_one_year",
  "stability.two_changes_one_year",
  "stability.two_changes_two_years",
]);

const deductionRuleConfigSchema = z
  .object({
    enabled: z.boolean(),
    points: z.number().int().min(0).max(100),
  })
  .strict();

export const jobDescriptionDeductionRulesSchema = z
  .record(structuredResumeRuleIdSchema, deductionRuleConfigSchema)
  .superRefine((rules, context) => {
    for (const ruleId of ["project.no_relevant_project", "skill.no_related_skill"] as const) {
      if (rules[ruleId].points !== 0) {
        context.addIssue({
          code: "custom",
          message: "直接归零规则的扣分值必须为 0",
          path: [ruleId, "points"],
        });
      }
    }
  });

export type StructuredResumeRuleId = z.infer<typeof structuredResumeRuleIdSchema>;
export type JobDescriptionDeductionRules = z.infer<typeof jobDescriptionDeductionRulesSchema>;

export const DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES: JobDescriptionDeductionRules = {
  "education.below_tier": { enabled: true, points: 38 },
  "education.major_unrelated": { enabled: true, points: 14 },
  "experience.fragmented": { enabled: true, points: 13 },
  "experience.industry_unrelated": { enabled: true, points: 28 },
  "experience.missing_year": { enabled: true, points: 9 },
  "potential.illogical_switches": { enabled: true, points: 24 },
  "potential.no_growth_two_years": { enabled: true, points: 19 },
  "potential.unexplained_gap_over_six_months": { enabled: true, points: 14 },
  "project.edge_participation": { enabled: true, points: 23 },
  "project.no_relevant_project": { enabled: true, points: 0 },
  "project.old_relevant_project": { enabled: true, points: 12 },
  "project.scale_low": { enabled: true, points: 18 },
  "skill.missing_auxiliary": { enabled: true, points: 4 },
  "skill.missing_core": { enabled: true, points: 14 },
  "skill.no_related_skill": { enabled: true, points: 0 },
  "skill.shallow": { enabled: true, points: 9 },
  "stability.frequent_unrelated_industries": { enabled: true, points: 8 },
  "stability.gap_over_six_months": { enabled: true, points: 12 },
  "stability.gap_three_to_six_months": { enabled: true, points: 6 },
  "stability.short_tenure": { enabled: true, points: 12 },
  "stability.three_changes_one_year": { enabled: true, points: 40 },
  "stability.two_changes_one_year": { enabled: true, points: 30 },
  "stability.two_changes_two_years": { enabled: true, points: 13 },
};

export function createDefaultJobDescriptionDeductionRules(): JobDescriptionDeductionRules {
  return Object.fromEntries(
    Object.entries(DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES).map(([ruleId, config]) => [
      ruleId,
      { ...config },
    ]),
  ) as JobDescriptionDeductionRules;
}

const hardGateTextSchema = z.string().trim().max(JOB_DESCRIPTION_HARD_GATE_MAX_LENGTH);
const weightSchema = z.number().int().min(0).max(100);

export const jobDescriptionDimensionWeightsSchema = z
  .object({
    educationBackground: weightSchema,
    experienceRelevance: weightSchema,
    potential: weightSchema,
    projectMatch: weightSchema,
    skillMatch: weightSchema,
    stability: weightSchema,
  })
  .superRefine((weights, context) => {
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (total !== 100) {
      context.addIssue({
        code: "custom",
        message: "六个维度的权重总和必须等于 100%",
      });
    }
  });

export const jobDescriptionScoringConditionSchema = z.object({
  condition: z
    .string()
    .trim()
    .min(1, "请输入条件内容")
    .max(
      JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH,
      `条件内容不能超过 ${JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH} 字`,
    ),
  id: z.string().trim().min(1),
  points: z.number().int().min(1).max(100),
});

export const jobDescriptionStructuredConfigSchema = z
  .object({
    deductionRules: jobDescriptionDeductionRulesSchema,
    exclusionConditions: z
      .array(jobDescriptionScoringConditionSchema)
      .max(JOB_DESCRIPTION_SCORING_CONDITION_LIMIT),
    hardGates: z.object({
      education: hardGateTextSchema,
      languageAbility: hardGateTextSchema,
      other: hardGateTextSchema,
      requiredCertificates: hardGateTextSchema,
      requiredSkills: hardGateTextSchema,
      workExperience: hardGateTextSchema,
      workLocation: hardGateTextSchema,
    }),
    priorityConditions: z
      .array(jobDescriptionScoringConditionSchema)
      .max(JOB_DESCRIPTION_SCORING_CONDITION_LIMIT),
    version: z.literal(JOB_DESCRIPTION_STRUCTURED_CONFIG_VERSION),
    weights: jobDescriptionDimensionWeightsSchema,
  })
  .superRefine((config, context) => {
    const conditions = [
      ...config.priorityConditions.map((condition, index) => ({
        ...condition,
        index,
        list: "priorityConditions" as const,
      })),
      ...config.exclusionConditions.map((condition, index) => ({
        ...condition,
        index,
        list: "exclusionConditions" as const,
      })),
    ];
    const ids = new Map<string, (typeof conditions)[number]>();
    const normalizedTexts = new Map<string, (typeof conditions)[number]>();
    for (const condition of conditions) {
      const previousId = ids.get(condition.id);
      if (previousId) {
        context.addIssue({
          code: "custom",
          message: "优先与排除条件的 ID 不能重复",
          path: [condition.list, condition.index, "id"],
        });
      } else {
        ids.set(condition.id, condition);
      }

      const normalizedText = condition.condition
        .normalize("NFKC")
        .toLocaleLowerCase()
        .replaceAll(/\s+/g, "");
      const previousText = normalizedTexts.get(normalizedText);
      if (previousText) {
        context.addIssue({
          code: "custom",
          message: "优先与排除条件的内容不能重复",
          path: [condition.list, condition.index, "condition"],
        });
      } else {
        normalizedTexts.set(normalizedText, condition);
      }
    }
  });

export type JobDescriptionStructuredConfig = z.infer<typeof jobDescriptionStructuredConfigSchema>;
export type JobDescriptionScoringCondition = z.infer<typeof jobDescriptionScoringConditionSchema>;
export type JobDescriptionDimensionWeights = z.infer<typeof jobDescriptionDimensionWeightsSchema>;

export function createDefaultJobDescriptionStructuredConfig(): JobDescriptionStructuredConfig {
  return {
    deductionRules: createDefaultJobDescriptionDeductionRules(),
    exclusionConditions: [],
    hardGates: {
      education: "",
      languageAbility: "",
      other: "",
      requiredCertificates: "",
      requiredSkills: "",
      workExperience: "",
      workLocation: "",
    },
    priorityConditions: [],
    version: JOB_DESCRIPTION_STRUCTURED_CONFIG_VERSION,
    weights: {
      educationBackground: 10,
      experienceRelevance: 25,
      potential: 8,
      projectMatch: 15,
      skillMatch: 35,
      stability: 7,
    },
  };
}

export function parseStoredJobDescriptionStructuredConfig(
  value: unknown,
): JobDescriptionStructuredConfig {
  if (value && typeof value === "object" && !("deductionRules" in value)) {
    return jobDescriptionStructuredConfigSchema.parse({
      ...value,
      deductionRules: createDefaultJobDescriptionDeductionRules(),
    });
  }
  return jobDescriptionStructuredConfigSchema.parse(value);
}
