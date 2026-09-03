import { z } from "zod";
import {
  jobEvaluationSourceRefSchema,
  jobEvaluationBlueprintSchema,
  relevantExperienceScopeSchema,
} from "./job-description-evaluation";
import {
  jobDescriptionDimensionWeightsSchema,
  jobDescriptionStructuredConfigSchema,
} from "./job-description-structured-config";

export const STRUCTURED_RESUME_EVALUATION_SCHEMA_VERSION = 1;

export const structuredResumeDimensionSchema = z.enum([
  "skillMatch",
  "experienceRelevance",
  "projectMatch",
  "educationBackground",
  "potential",
  "stability",
]);
export const structuredResumeRuleStatusSchema = z.enum([
  "insufficient_evidence",
  "matched",
  "not_applicable",
  "not_matched",
]);
export const structuredResumeGateStatusSchema = z.enum(["failed", "needs_verification", "passed"]);
export const structuredResumeGradeSchema = z.enum(["matched", "recommended", "unmatched"]);

export const structuredResumeEvidenceSchema = z
  .object({
    quote: z.string().trim().min(1),
    source: z.enum(["resume_profile", "resume_text"]),
  })
  .strict();

export const structuredResumeSkillAssessmentStatusSchema = z.enum([
  "applied",
  "insufficient_evidence",
  "missing",
  "shallow",
]);

export const structuredResumeSkillAssessmentSchema = z
  .object({
    evidence: z.array(structuredResumeEvidenceSchema),
    expectationType: z.enum(["auxiliary", "core"]),
    normalizedSkill: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    requirementGroupId: z.string().trim().min(1),
    satisfactionMode: z.enum(["all", "any"]),
    sourceRef: jobEvaluationSourceRefSchema,
    sourceText: z.string().trim().min(1),
    status: structuredResumeSkillAssessmentStatusSchema,
  })
  .strict()
  .superRefine((assessment, context) => {
    if (
      (assessment.status === "applied" || assessment.status === "shallow") &&
      assessment.evidence.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "已应用或浅层技能判定必须提供简历证据",
        path: ["evidence"],
      });
    }
  });

function normalizedSkillAssessmentKey(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

const correctionSchema = z
  .object({
    correctedAt: z.string().datetime(),
    correctedBy: z.string().trim().min(1),
    correctedStatus: structuredResumeGateStatusSchema,
  })
  .strict();

const gateJudgmentSchema = z
  .object({
    aiStatus: structuredResumeGateStatusSchema,
    category: z.string().trim().min(1),
    correction: correctionSchema.optional(),
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
  })
  .strict();

const baseRuleJudgmentSchema = z
  .object({
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    ruleId: z.string().trim().min(1),
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().positive().optional(),
  })
  .strict();
const ruleJudgmentSchema = baseRuleJudgmentSchema
  .extend({
    appliedPoints: z.number().int().min(0),
  })
  .strict();

const dimensionResultSchema = z
  .object({
    appliedDeductions: z.array(ruleJudgmentSchema),
    deductionTotal: z.number().int().min(0),
    insufficientEvidenceRuleIds: z.array(z.string().trim().min(1)),
    rawScore: z.number().int().min(0).max(100),
    ruleJudgments: z.array(baseRuleJudgmentSchema),
    weight: z.number().int().min(0).max(100),
    weightedContributionHundredths: z.number().int().min(0).max(10_000),
  })
  .strict();

const dimensionsSchema = z
  .object({
    educationBackground: dimensionResultSchema,
    experienceRelevance: dimensionResultSchema,
    potential: dimensionResultSchema,
    projectMatch: dimensionResultSchema,
    skillMatch: dimensionResultSchema,
    stability: dimensionResultSchema,
  })
  .strict();

const normalizedEpisodeSchema = z
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

const adjustmentMatchSchema = z
  .object({
    appliedPoints: z.number().int(),
    conditionId: z.string().trim().min(1),
    evidence: z.array(structuredResumeEvidenceSchema),
    kind: z.enum(["exclusion", "priority"]),
    matched: z.boolean(),
    points: z.number().int().min(1).max(100),
    reason: z.string().trim().min(1),
    sourceText: z.string().trim().min(1),
  })
  .strict();

export const structuredResumeEvaluationV1Schema = z
  .object({
    adjustments: z
      .object({
        exclusionPointTotal: z.number().int().min(0),
        matches: z.array(adjustmentMatchSchema),
        priorityPointTotal: z.number().int().min(0),
      })
      .strict(),
    blueprint: jobEvaluationBlueprintSchema,
    blueprintHash: z.string().trim().min(1),
    calculations: z
      .object({
        adjustedHundredths: z.number().int(),
        clampedHundredths: z.number().int().min(0).max(10_000),
        compositeScore: z.number().int().min(0).max(100),
        weightedBaseHundredths: z.number().int().min(0).max(10_000),
      })
      .strict(),
    deductionRuleSetVersion: z.number().int().positive(),
    dimensions: dimensionsSchema,
    engine: z
      .object({
        engineVersion: z.string().trim().min(1),
        modelId: z.string().trim().min(1),
        promptVersion: z.string().trim().min(1),
      })
      .strict(),
    evaluationAsOf: z.string().date(),
    evaluationMode: z.literal("structured"),
    gates: z
      .object({
        effectiveStatus: structuredResumeGateStatusSchema,
        judgments: z.array(gateJudgmentSchema),
        rawStatus: structuredResumeGateStatusSchema,
      })
      .strict(),
    generatedAt: z.string().datetime(),
    grade: structuredResumeGradeSchema,
    inputHash: z.string().trim().min(1),
    jobConfig: jobDescriptionStructuredConfigSchema,
    jobConfigHash: z.string().trim().min(1),
    jobId: z.string().trim().min(1),
    narrative: z
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
          .strict()
          .optional(),
        levelRecommendation: z
          .object({
            level: z.string().trim().min(1),
            rationale: z.string().trim().min(1),
          })
          .strict()
          .optional(),
        overallComment: z.string().trim().min(1).optional(),
        recommendation: z.string().trim().min(1),
        summary: z.string().trim().min(1),
        teamPositioning: z
          .object({
            rationale: z.string().trim().min(1),
            suggestion: z.string().trim().min(1),
          })
          .strict()
          .optional(),
      })
      .strict(),
    requiredRelevantExperience: z
      .object({
        relevanceScope: relevantExperienceScopeSchema,
        years: z.number().nonnegative(),
      })
      .strict()
      .nullable(),
    runId: z.string().trim().min(1),
    schemaVersion: z.literal(STRUCTURED_RESUME_EVALUATION_SCHEMA_VERSION),
    skillAssessments: z.array(structuredResumeSkillAssessmentSchema),
    skillExpectations: z
      .object({
        auxiliary: z.array(z.string().trim().min(1)),
        core: z.array(z.string().trim().min(1)),
      })
      .strict(),
    timeline: z
      .object({
        employmentEpisodes: z.array(normalizedEpisodeSchema),
        relevantMonths: z.number().int().min(0).nullable(),
        relevantYears: z.number().nonnegative().nullable(),
        relevantYearsSource: z.enum(["profile_work_years", "timeline"]).nullable(),
      })
      .strict(),
    weights: jobDescriptionDimensionWeightsSchema,
  })
  .strict()
  .superRefine((evaluation, context) => {
    const expectedBySkill = new Map<
      string,
      Pick<
        z.infer<typeof structuredResumeSkillAssessmentSchema>,
        | "expectationType"
        | "normalizedSkill"
        | "requirementGroupId"
        | "satisfactionMode"
        | "sourceRef"
        | "sourceText"
      >
    >();
    for (const skill of evaluation.blueprint.coreSkills) {
      expectedBySkill.set(normalizedSkillAssessmentKey(skill.normalizedSkill), {
        expectationType: "core",
        normalizedSkill: skill.normalizedSkill,
        requirementGroupId: skill.requirementGroupId,
        satisfactionMode: skill.satisfactionMode,
        sourceRef: skill.sourceRef,
        sourceText: skill.sourceText,
      });
    }
    for (const skill of evaluation.blueprint.auxiliarySkills) {
      const key = normalizedSkillAssessmentKey(skill.normalizedSkill);
      if (!expectedBySkill.has(key)) {
        expectedBySkill.set(key, {
          expectationType: "auxiliary",
          normalizedSkill: skill.normalizedSkill,
          requirementGroupId: skill.requirementGroupId,
          satisfactionMode: skill.satisfactionMode,
          sourceRef: skill.sourceRef,
          sourceText: skill.sourceText,
        });
      }
    }
    const seen = new Set<string>();
    for (const [index, assessment] of evaluation.skillAssessments.entries()) {
      const key = normalizedSkillAssessmentKey(assessment.normalizedSkill);
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: "同一岗位技能只能保存一条最终判定",
          path: ["skillAssessments", index],
        });
        continue;
      }
      seen.add(key);
      const expected = expectedBySkill.get(key);
      if (!expected) {
        context.addIssue({
          code: "custom",
          message: "技能判定必须来自已发布岗位蓝图",
          path: ["skillAssessments", index],
        });
        continue;
      }
      if (
        assessment.expectationType !== expected.expectationType ||
        assessment.normalizedSkill !== expected.normalizedSkill ||
        assessment.requirementGroupId !== expected.requirementGroupId ||
        assessment.satisfactionMode !== expected.satisfactionMode ||
        assessment.sourceText !== expected.sourceText ||
        assessment.sourceRef.kind !== expected.sourceRef.kind ||
        assessment.sourceRef.path !== expected.sourceRef.path
      ) {
        context.addIssue({
          code: "custom",
          message: "技能判定与已发布岗位蓝图的技能元数据不一致",
          path: ["skillAssessments", index],
        });
      }
    }
    for (const [key, expected] of expectedBySkill) {
      if (!seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: `缺少岗位技能“${expected.normalizedSkill}”的最终判定`,
          path: ["skillAssessments"],
        });
      }
    }
  });

export type StructuredResumeEvaluationV1 = z.infer<typeof structuredResumeEvaluationV1Schema>;
export type StructuredResumeGateStatus = z.infer<typeof structuredResumeGateStatusSchema>;
export type StructuredResumeGrade = z.infer<typeof structuredResumeGradeSchema>;
export type StructuredResumeSkillAssessment = z.infer<typeof structuredResumeSkillAssessmentSchema>;
