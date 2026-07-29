import { z } from "zod";
import { jobDescriptionScoringConditionSchema } from "./job-description-structured-config";

export const JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION = 1;
export const JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY = 20;
export const JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS = 60;

export const jobEvaluationModeSchema = z.enum(["legacy", "structured"]);
export const jobLifecycleStatusSchema = z.enum(["draft", "published"]);

export const jobEvaluationSourceRefSchema = z
  .object({
    kind: z.enum(["hard_gate", "job_description"]),
    path: z.string().trim().min(1),
  })
  .strict();

const sourceBackedExpectationSchema = z
  .object({
    sourceRef: jobEvaluationSourceRefSchema,
    sourceText: z.string().trim().min(1),
  })
  .strict();

export const jobHardGateCategorySchema = z.enum([
  "education",
  "language_ability",
  "other",
  "required_certificates",
  "required_skills",
  "work_experience",
  "work_location",
]);

export const atomicGateRequirementSchema = sourceBackedExpectationSchema
  .extend({
    category: jobHardGateCategorySchema,
    normalizedRequirement: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
  })
  .strict();

export const jobSkillExpectationSchema = sourceBackedExpectationSchema
  .extend({
    normalizedSkill: z.string().trim().min(1),
  })
  .strict();

export const relevantExperienceScopeSchema = z.enum([
  "capability",
  "domain",
  "industry",
  "role",
  "total_employment",
]);

export const requiredRelevantExperienceSchema = sourceBackedExpectationSchema
  .extend({
    relevanceScope: relevantExperienceScopeSchema,
    scopeDescription: z.string().trim().min(1),
    years: z.number().nonnegative(),
  })
  .strict();

export const educationDegreeLevelSchema = z.enum(["associate", "bachelor", "doctorate", "master"]);

export const educationExpectationSchema = sourceBackedExpectationSchema
  .extend({
    degreeLevel: educationDegreeLevelSchema.nullable(),
    majorExpectation: z.string().trim().min(1).nullable(),
  })
  .strict();

const expectationListSchema = z.array(
  sourceBackedExpectationSchema.extend({ expectation: z.string().trim().min(1) }).strict(),
);

export const dimensionExpectationsSchema = z
  .object({
    educationBackground: expectationListSchema,
    experienceRelevance: expectationListSchema,
    potential: expectationListSchema,
    projectMatch: expectationListSchema,
    skillMatch: expectationListSchema,
    stability: expectationListSchema,
  })
  .strict();

export const frozenScoringConditionSchema = jobDescriptionScoringConditionSchema
  .extend({
    sourceText: z.string().trim().min(1),
  })
  .strict();

export const blueprintCompilerMetadataSchema = z
  .object({
    generatedAt: z.string().datetime(),
    modelId: z.string().trim().min(1),
    promptVersion: z.string().trim().min(1),
  })
  .strict();

export const jobEvaluationBlueprintSchema = z
  .object({
    auxiliarySkills: z.array(jobSkillExpectationSchema),
    compiler: blueprintCompilerMetadataSchema,
    coreSkills: z.array(jobSkillExpectationSchema),
    dimensionExpectations: dimensionExpectationsSchema,
    educationExpectation: educationExpectationSchema.nullable(),
    exclusionConditions: z.array(frozenScoringConditionSchema),
    hardGateRequirements: z.array(atomicGateRequirementSchema),
    priorityConditions: z.array(frozenScoringConditionSchema),
    requiredRelevantExperience: requiredRelevantExperienceSchema.nullable(),
    schemaVersion: z.literal(JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION),
  })
  .strict()
  .superRefine((blueprint, context) => {
    if (blueprint.hardGateRequirements.length > JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS) {
      context.addIssue({
        code: "custom",
        message: `硬性门槛原子项不能超过 ${JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS} 项`,
        path: ["hardGateRequirements"],
      });
    }
    const counts = new Map<string, number>();
    const requirementIds = new Set<string>();
    for (const requirement of blueprint.hardGateRequirements) {
      counts.set(requirement.category, (counts.get(requirement.category) ?? 0) + 1);
      if (requirementIds.has(requirement.requirementId)) {
        context.addIssue({
          code: "custom",
          message: "硬性门槛原子项 ID 不能重复",
          path: ["hardGateRequirements"],
        });
      }
      requirementIds.add(requirement.requirementId);
    }
    for (const [category, count] of counts) {
      if (count > JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY) {
        context.addIssue({
          code: "custom",
          message: `单个硬性门槛分类不能超过 ${JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY} 项`,
          path: ["hardGateRequirements", category],
        });
      }
    }
  });

export type JobEvaluationMode = z.infer<typeof jobEvaluationModeSchema>;
export type JobLifecycleStatus = z.infer<typeof jobLifecycleStatusSchema>;
export type JobEvaluationBlueprint = z.infer<typeof jobEvaluationBlueprintSchema>;
export type AtomicGateRequirement = z.infer<typeof atomicGateRequirementSchema>;
export type JobSkillExpectation = z.infer<typeof jobSkillExpectationSchema>;
export type RelevantExperienceScope = z.infer<typeof relevantExperienceScopeSchema>;
