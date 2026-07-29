import { z } from "zod";
import {
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

const ruleJudgmentSchema = z
  .object({
    appliedPoints: z.number().int().min(0),
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    ruleId: z.string().trim().min(1),
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().positive().optional(),
  })
  .strict();

const dimensionResultSchema = z
  .object({
    appliedDeductions: z.array(ruleJudgmentSchema),
    deductionTotal: z.number().int().min(0),
    insufficientEvidenceRuleIds: z.array(z.string().trim().min(1)),
    rawScore: z.number().int().min(0).max(100),
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
        recommendation: z.string().trim().min(1),
        summary: z.string().trim().min(1),
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
  .strict();

export type StructuredResumeEvaluationV1 = z.infer<typeof structuredResumeEvaluationV1Schema>;
export type StructuredResumeGateStatus = z.infer<typeof structuredResumeGateStatusSchema>;
export type StructuredResumeGrade = z.infer<typeof structuredResumeGradeSchema>;
