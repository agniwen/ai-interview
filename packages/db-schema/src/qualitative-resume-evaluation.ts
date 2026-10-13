import { z } from "zod";

export const QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION = 3;
export const QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION = "qualitative-v3";

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
    schemaVersion: z.literal(2),
    seniorityRecommendation: optionalGuidanceSchema.nullable(),
    teamPositioning: optionalTeamPositioningSchema.nullable(),
  })
  .strict();

const qualitativeEvaluationPointFields = {
  content: z.string().trim().min(1).max(1000),
  jobRequirement: z.string().trim().min(1).max(500),
  point: z.string().trim().min(1).max(40),
};

/** V3 匹配依据：简短要求点 + 结论 + 简历原文证据 + 对应的岗位要求原文。 */
export const qualitativeMatchingEvidenceItemSchema = z
  .object({
    ...qualitativeEvaluationPointFields,
    resumeEvidence: z.string().trim().min(1).max(1000),
  })
  .strict();

/** V3 风险与待确认项：结构同匹配依据；简历缺少相关事实时简历证据为 null。 */
export const qualitativeRiskItemSchema = z
  .object({
    ...qualitativeEvaluationPointFields,
    resumeEvidence: z.string().trim().min(1).max(1000).nullable(),
  })
  .strict();

export const qualitativeResumeEvaluationV3Schema = qualitativeResumeEvaluationV2Schema
  .extend({
    detailedOverall: z
      .object({
        judgment: z.string().trim().min(1).max(2000),
        matchingEvidence: z.array(qualitativeMatchingEvidenceItemSchema).min(1).max(8),
        risks: z.array(qualitativeRiskItemSchema).min(1).max(8),
      })
      .strict(),
    schemaVersion: z.literal(QUALITATIVE_RESUME_EVALUATION_SCHEMA_VERSION),
  })
  .strict();

/** 新评价生成和写入使用的当前版本。 */
export const currentQualitativeResumeEvaluationSchema = qualitativeResumeEvaluationV3Schema;

/** 带六维等级的版本（V2 起），可绘制六维雷达图。 */
export const qualitativeResumeEvaluationWithDimensionLevelsSchema = z.discriminatedUnion(
  "schemaVersion",
  [qualitativeResumeEvaluationV2Schema, qualitativeResumeEvaluationV3Schema],
);

export const qualitativeResumeEvaluationSchema = z.discriminatedUnion("schemaVersion", [
  qualitativeResumeEvaluationV1Schema,
  qualitativeResumeEvaluationV2Schema,
  qualitativeResumeEvaluationV3Schema,
]);

export type QualitativeResumeEvaluationV1 = z.infer<typeof qualitativeResumeEvaluationV1Schema>;
export type QualitativeResumeEvaluationV2 = z.infer<typeof qualitativeResumeEvaluationV2Schema>;
export type QualitativeResumeEvaluationV3 = z.infer<typeof qualitativeResumeEvaluationV3Schema>;
export type CurrentQualitativeResumeEvaluation = QualitativeResumeEvaluationV3;
export type QualitativeResumeEvaluationWithDimensionLevels = z.infer<
  typeof qualitativeResumeEvaluationWithDimensionLevelsSchema
>;
export type QualitativeMatchingEvidenceItem = z.infer<typeof qualitativeMatchingEvidenceItemSchema>;
export type QualitativeRiskItem = z.infer<typeof qualitativeRiskItemSchema>;
/** 匹配依据 / 风险的单条结构化要点；V1/V2 的对应段落为受限 Markdown 字符串。 */
export type QualitativeEvaluationPoint = QualitativeRiskItem;
export type QualitativeEvaluationSection = string | QualitativeEvaluationPoint[];
export type QualitativeResumeEvaluation = z.infer<typeof qualitativeResumeEvaluationSchema>;
export type QualitativeRecommendationLevel = z.infer<typeof qualitativeRecommendationLevelSchema>;
export type QualitativeDimensionBasis = z.infer<typeof qualitativeDimensionBasisSchema>;
export type ResumeEvaluationContractMode = z.infer<typeof resumeEvaluationContractModeSchema>;
