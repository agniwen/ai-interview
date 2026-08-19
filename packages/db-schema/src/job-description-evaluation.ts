import { z } from "zod";
import { jobDescriptionScoringConditionSchema } from "./job-description-structured-config";

export const JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION = 1;
export const JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS_PER_CATEGORY = 20;
export const JOB_EVALUATION_BLUEPRINT_MAX_REQUIREMENTS = 60;

export const jobEvaluationModeSchema = z.enum(["legacy", "structured"]);
export const jobLifecycleStatusSchema = z.enum(["draft", "published"]);

export const jobEvaluationSourceRefSchema = z
  .object({
    kind: z.enum(["hard_gate", "job_description", "manual"]),
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

export const jobSkillSatisfactionModeSchema = z.enum(["all", "any"]);

export const jobSkillExpectationSchema = sourceBackedExpectationSchema
  .extend({
    normalizedSkill: z.string().trim().min(1),
    requirementGroupId: z.string().trim().min(1),
    satisfactionMode: jobSkillSatisfactionModeSchema,
  })
  .strict();

export const jobSkillRequirementGroupDraftSchema = z
  .object({
    expectationType: z.enum(["auxiliary", "core"]),
    satisfactionMode: jobSkillSatisfactionModeSchema,
    skills: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
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

export const relevantExperienceRequirementSchema = requiredRelevantExperienceSchema
  .extend({ requirementId: z.string().trim().min(1) })
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

const editableExpectationListSchema = z.array(z.string().trim().min(1).max(500)).max(20);

export const jobEvaluationRuleDraftSchema = z
  .object({
    auxiliarySkills: z.array(z.string().trim().min(1).max(200)).max(50),
    coreSkills: z.array(z.string().trim().min(1).max(200)).max(50),
    dimensionExpectations: z
      .object({
        educationBackground: editableExpectationListSchema,
        experienceRelevance: editableExpectationListSchema,
        potential: editableExpectationListSchema,
        projectMatch: editableExpectationListSchema,
        skillMatch: editableExpectationListSchema,
        stability: editableExpectationListSchema,
      })
      .strict(),
    educationExpectation: z
      .object({
        degreeLevel: educationDegreeLevelSchema.nullable(),
        majorExpectation: z.string().trim().min(1).max(500).nullable(),
      })
      .strict()
      .nullable(),
    requiredRelevantExperience: z
      .object({
        relevanceScope: relevantExperienceScopeSchema,
        scopeDescription: z.string().trim().min(1).max(500),
        years: z.number().nonnegative().max(80),
      })
      .strict()
      .nullable(),
    skillRequirementGroups: z.array(jobSkillRequirementGroupDraftSchema).max(100),
  })
  .strict()
  .superRefine((draft, context) => {
    const core = new Set(draft.coreSkills.map((skill) => skill.normalize("NFKC").toLowerCase()));
    for (const [index, skill] of draft.auxiliarySkills.entries()) {
      if (core.has(skill.normalize("NFKC").toLowerCase())) {
        context.addIssue({
          code: "custom",
          message: "同一技能不能同时配置为核心技能和辅助技能",
          path: ["auxiliarySkills", index],
        });
      }
    }
    const expectedSkills = new Map<
      string,
      { expectationType: "auxiliary" | "core"; skill: string }
    >();
    for (const skill of draft.coreSkills) {
      expectedSkills.set(skill.normalize("NFKC").toLowerCase(), {
        expectationType: "core",
        skill,
      });
    }
    for (const skill of draft.auxiliarySkills) {
      expectedSkills.set(skill.normalize("NFKC").toLowerCase(), {
        expectationType: "auxiliary",
        skill,
      });
    }
    const groupedSkills = new Set<string>();
    for (const [groupIndex, group] of draft.skillRequirementGroups.entries()) {
      if (group.satisfactionMode === "any" && group.skills.length < 2) {
        context.addIssue({
          code: "custom",
          message: "任一满足的技能要求组至少需要两个可替代技能",
          path: ["skillRequirementGroups", groupIndex, "skills"],
        });
      }
      for (const [skillIndex, skill] of group.skills.entries()) {
        const key = skill.normalize("NFKC").toLowerCase();
        const expected = expectedSkills.get(key);
        if (!expected || expected.expectationType !== group.expectationType) {
          context.addIssue({
            code: "custom",
            message: "技能要求组只能引用同类型的岗位技能",
            path: ["skillRequirementGroups", groupIndex, "skills", skillIndex],
          });
          continue;
        }
        if (groupedSkills.has(key)) {
          context.addIssue({
            code: "custom",
            message: "每个岗位技能必须且只能属于一个技能要求组",
            path: ["skillRequirementGroups", groupIndex, "skills", skillIndex],
          });
        }
        groupedSkills.add(key);
      }
    }
    for (const [key, expected] of expectedSkills) {
      if (!groupedSkills.has(key)) {
        context.addIssue({
          code: "custom",
          message: `岗位技能“${expected.skill}”缺少技能要求组`,
          path: ["skillRequirementGroups"],
        });
      }
    }
  });

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
    requiredRelevantExperiences: z.array(relevantExperienceRequirementSchema).optional(),
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
    const skillGroups = new Map<
      string,
      { count: number; expectationType: "auxiliary" | "core"; satisfactionMode: "all" | "any" }
    >();
    for (const [expectationType, skills] of [
      ["core", blueprint.coreSkills],
      ["auxiliary", blueprint.auxiliarySkills],
    ] as const) {
      for (const skill of skills) {
        const group = skillGroups.get(skill.requirementGroupId);
        if (
          group &&
          (group.expectationType !== expectationType ||
            group.satisfactionMode !== skill.satisfactionMode)
        ) {
          context.addIssue({
            code: "custom",
            message: "同一技能要求组的技能类型和满足方式必须一致",
            path: [`${expectationType}Skills`],
          });
          continue;
        }
        skillGroups.set(skill.requirementGroupId, {
          count: (group?.count ?? 0) + 1,
          expectationType,
          satisfactionMode: skill.satisfactionMode,
        });
      }
    }
    for (const [groupId, group] of skillGroups) {
      if (group.satisfactionMode === "any" && group.count < 2) {
        context.addIssue({
          code: "custom",
          message: "任一满足的技能要求组至少需要两个可替代技能",
          path: [group.expectationType === "core" ? "coreSkills" : "auxiliarySkills", groupId],
        });
      }
    }
  });

export type JobEvaluationMode = z.infer<typeof jobEvaluationModeSchema>;
export type JobLifecycleStatus = z.infer<typeof jobLifecycleStatusSchema>;
export type JobEvaluationBlueprint = z.infer<typeof jobEvaluationBlueprintSchema>;
export type JobEvaluationRuleDraft = z.infer<typeof jobEvaluationRuleDraftSchema>;
export type AtomicGateRequirement = z.infer<typeof atomicGateRequirementSchema>;
export type JobSkillExpectation = z.infer<typeof jobSkillExpectationSchema>;
export type RelevantExperienceScope = z.infer<typeof relevantExperienceScopeSchema>;

export function toJobEvaluationRuleDraft(
  blueprint: JobEvaluationBlueprint,
): JobEvaluationRuleDraft {
  const skillRequirementGroups = new Map<
    string,
    JobEvaluationRuleDraft["skillRequirementGroups"][number]
  >();
  for (const [expectationType, skills] of [
    ["core", blueprint.coreSkills],
    ["auxiliary", blueprint.auxiliarySkills],
  ] as const) {
    for (const skill of skills) {
      const group = skillRequirementGroups.get(skill.requirementGroupId) ?? {
        expectationType,
        satisfactionMode: skill.satisfactionMode,
        skills: [],
      };
      group.skills.push(skill.normalizedSkill);
      skillRequirementGroups.set(skill.requirementGroupId, group);
    }
  }
  return {
    auxiliarySkills: blueprint.auxiliarySkills.map((skill) => skill.normalizedSkill),
    coreSkills: blueprint.coreSkills.map((skill) => skill.normalizedSkill),
    // SAFETY: blueprint.dimensionExpectations is schema-validated with the exact draft dimension keys.
    dimensionExpectations: Object.fromEntries(
      Object.entries(blueprint.dimensionExpectations).map(([dimension, expectations]) => [
        dimension,
        expectations.map((expectation) => expectation.expectation),
      ]),
    ) as JobEvaluationRuleDraft["dimensionExpectations"],
    educationExpectation: blueprint.educationExpectation
      ? {
          degreeLevel: blueprint.educationExpectation.degreeLevel,
          majorExpectation: blueprint.educationExpectation.majorExpectation,
        }
      : null,
    requiredRelevantExperience: blueprint.requiredRelevantExperience
      ? {
          relevanceScope: blueprint.requiredRelevantExperience.relevanceScope,
          scopeDescription: blueprint.requiredRelevantExperience.scopeDescription,
          years: blueprint.requiredRelevantExperience.years,
        }
      : null,
    skillRequirementGroups: [...skillRequirementGroups.values()],
  };
}
