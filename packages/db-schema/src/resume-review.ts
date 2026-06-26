import { z } from "zod";

const scoreSchema = z.number().int().min(0).max(100);
const nonEmptyStringSchema = z.string().trim().min(1);

export const resumeReviewActionSchema = z.enum(["interview", "hold", "reject"]);
export type ResumeReviewAction = z.infer<typeof resumeReviewActionSchema>;

export const resumeReviewBiasCategorySchema = z.enum([
  "hard_gap",
  "soft_mismatch",
  "credibility_risk",
  "stability_signal",
]);
export type ResumeReviewBiasCategory = z.infer<typeof resumeReviewBiasCategorySchema>;

export const resumeReviewDimensionSchema = z.object({
  rationale: nonEmptyStringSchema,
  score: scoreSchema,
});

export const resumeReviewPointSchema = z.object({
  evidence: z.string().trim().nullable(),
  impact: nonEmptyStringSchema,
  point: nonEmptyStringSchema,
});

export const resumeReviewBiasItemSchema = z.object({
  category: resumeReviewBiasCategorySchema,
  description: nonEmptyStringSchema,
  impact: nonEmptyStringSchema,
});

// v2 维度 key 枚举 —— 6 维度评分模型。
// v2 dimension keys — the six-dimension scoring model.
export const resumeReviewDimensionKeySchema = z.enum([
  "skillMatch",
  "experienceRelevance",
  "projectMatch",
  "educationBackground",
  "potential",
  "stability",
]);
export type ResumeReviewDimensionKey = z.infer<typeof resumeReviewDimensionKeySchema>;

// v2 严格 schema —— 新写入路径用，保证 6 维度齐全。
// Strict v2 schema for new writes; guarantees all six dimensions are present.
export const resumeReviewSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  dimensions: z.object({
    educationBackground: resumeReviewDimensionSchema,
    experienceRelevance: resumeReviewDimensionSchema,
    potential: resumeReviewDimensionSchema,
    projectMatch: resumeReviewDimensionSchema,
    skillMatch: resumeReviewDimensionSchema,
    stability: resumeReviewDimensionSchema,
  }),
  levelRecommendation: z.object({
    level: nonEmptyStringSchema,
    rationale: nonEmptyStringSchema,
  }),
  nextStep: z.object({
    action: resumeReviewActionSchema,
    disclaimer: z.literal("以上为初步结论"),
    interviewFocus: z.array(nonEmptyStringSchema),
    rationale: nonEmptyStringSchema,
  }),
  overall: z.object({
    baseScore: scoreSchema,
    conclusion: nonEmptyStringSchema,
    scoreRationale: nonEmptyStringSchema,
  }),
  schemaVersion: z.literal(2),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmptyStringSchema,
    suggestion: nonEmptyStringSchema,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});

// 宽松 schema —— 读取路径用，兼容旧 v1 数据（5 维度 + overall.score）。
// 旧 json 缺少新维度字段时不报错，消费方用 lodash get 取值，缺失就跳过展示。
// Loose schema for reads; tolerates legacy v1 rows so DB reads don't throw.
// Consumers use lodash `get` to access fields; missing keys render as absent.
export const resumeReviewLooseSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  dimensions: z.record(z.string(), resumeReviewDimensionSchema),
  levelRecommendation: z.object({
    level: nonEmptyStringSchema,
    rationale: nonEmptyStringSchema,
  }),
  nextStep: z.object({
    action: resumeReviewActionSchema,
    disclaimer: z.literal("以上为初步结论"),
    interviewFocus: z.array(nonEmptyStringSchema),
    rationale: nonEmptyStringSchema,
  }),
  overall: z.object({
    baseScore: scoreSchema.optional(),
    conclusion: nonEmptyStringSchema,
    score: scoreSchema.optional(),
    scoreRationale: nonEmptyStringSchema,
  }),
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmptyStringSchema,
    suggestion: nonEmptyStringSchema,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});

export type ResumeReview = z.infer<typeof resumeReviewSchema>;
export type ResumeReviewLoose = z.infer<typeof resumeReviewLooseSchema>;
export type ResumeReviewDimension = z.infer<typeof resumeReviewDimensionSchema>;
export type ResumeReviewPoint = z.infer<typeof resumeReviewPointSchema>;
export type ResumeReviewBiasItem = z.infer<typeof resumeReviewBiasItemSchema>;
