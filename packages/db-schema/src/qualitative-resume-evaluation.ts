import { z } from "zod";

export const QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION = 2;
export const QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION = "qualitative-v2";

export const resumeEvaluationContractModeSchema = z.enum(["legacy", "structured", "qualitative"]);

export const qualitativeRecommendationLevelSchema = z.enum([
  "not_recommended",
  "undecided",
  "recommended",
  "highly_recommended",
]);

export const qualitativeDimensionBasisSchema = z.enum(["job", "general", "both"]);

const qualitativeDimensionEvaluationV1Schema = z
  .object({
    basis: qualitativeDimensionBasisSchema,
    evaluation: z.string().trim().min(1).max(2000),
  })
  .strict();

const qualitativeDimensionEvaluationV2Schema = qualitativeDimensionEvaluationV1Schema
  .extend({
    level: qualitativeRecommendationLevelSchema,
  })
  .strict();

const optionalGuidanceSchema = z
  .object({
    level: z.string().trim().min(1).max(200),
    rationale: z.string().trim().min(1).max(2000),
  })
  .strict();

const optionalTeamPositioningSchema = z
  .object({
    rationale: z.string().trim().min(1).max(2000),
    suggestion: z.string().trim().min(1).max(500),
  })
  .strict();

export const qualitativeResumeEvaluationV1Schema = z
  .object({
    conciseOverall: z.string().trim().min(1).max(500),
    detailedOverall: z
      .object({
        judgment: z.string().trim().min(1).max(2000),
        matchingEvidence: z.string().trim().min(1).max(4000),
        risks: z.string().trim().min(1).max(4000),
      })
      .strict(),
    dimensions: z
      .object({
        educationBackground: qualitativeDimensionEvaluationV1Schema,
        experienceRelevance: qualitativeDimensionEvaluationV1Schema,
        potential: qualitativeDimensionEvaluationV1Schema,
        projectMatch: qualitativeDimensionEvaluationV1Schema,
        skillMatch: qualitativeDimensionEvaluationV1Schema,
        stability: qualitativeDimensionEvaluationV1Schema,
      })
      .strict(),
    recommendationLevel: qualitativeRecommendationLevelSchema,
    schemaVersion: z.literal(1),
    seniorityRecommendation: optionalGuidanceSchema.nullable(),
    teamPositioning: optionalTeamPositioningSchema.nullable(),
  })
  .strict();

export const qualitativeResumeEvaluationV2Schema = z
  .object({
    conciseOverall: z.string().trim().min(1).max(500),
    detailedOverall: z
      .object({
        judgment: z.string().trim().min(1).max(2000),
        matchingEvidence: z.string().trim().min(1).max(4000),
        risks: z.string().trim().min(1).max(4000),
      })
      .strict(),
    dimensions: z
      .object({
        educationBackground: qualitativeDimensionEvaluationV2Schema,
        experienceRelevance: qualitativeDimensionEvaluationV2Schema,
        potential: qualitativeDimensionEvaluationV2Schema,
        projectMatch: qualitativeDimensionEvaluationV2Schema,
        skillMatch: qualitativeDimensionEvaluationV2Schema,
        stability: qualitativeDimensionEvaluationV2Schema,
      })
      .strict(),
    recommendationLevel: qualitativeRecommendationLevelSchema,
    schemaVersion: z.literal(QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION),
    seniorityRecommendation: optionalGuidanceSchema.nullable(),
    teamPositioning: optionalTeamPositioningSchema.nullable(),
  })
  .strict();

export const qualitativeResumeEvaluationSchema = z.discriminatedUnion("schemaVersion", [
  qualitativeResumeEvaluationV1Schema,
  qualitativeResumeEvaluationV2Schema,
]);

export type QualitativeResumeEvaluationV1 = z.infer<typeof qualitativeResumeEvaluationV1Schema>;
export type QualitativeResumeEvaluationV2 = z.infer<typeof qualitativeResumeEvaluationV2Schema>;
export type QualitativeResumeEvaluation = z.infer<typeof qualitativeResumeEvaluationSchema>;
export type QualitativeRecommendationLevel = z.infer<typeof qualitativeRecommendationLevelSchema>;
export type QualitativeDimensionBasis = z.infer<typeof qualitativeDimensionBasisSchema>;
export type ResumeEvaluationContractMode = z.infer<typeof resumeEvaluationContractModeSchema>;
