import { z } from "zod";

export const JOB_DESCRIPTION_STRUCTURED_CONFIG_VERSION = 1;
export const JOB_DESCRIPTION_HARD_GATE_MAX_LENGTH = 2000;
export const JOB_DESCRIPTION_SCORING_CONDITION_MAX_LENGTH = 500;
export const JOB_DESCRIPTION_SCORING_CONDITION_LIMIT = 20;

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

export const jobDescriptionStructuredConfigSchema = z.object({
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
});

export type JobDescriptionStructuredConfig = z.infer<typeof jobDescriptionStructuredConfigSchema>;
export type JobDescriptionScoringCondition = z.infer<typeof jobDescriptionScoringConditionSchema>;
export type JobDescriptionDimensionWeights = z.infer<typeof jobDescriptionDimensionWeightsSchema>;

export function createDefaultJobDescriptionStructuredConfig(): JobDescriptionStructuredConfig {
  return {
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
