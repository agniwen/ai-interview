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

// v3 维度 key 枚举 —— 与 chat 评审框架共用的 5 维度模型。
// v3 dimension keys — shared with the chat review framework.
const resumeReviewDimensionKeys = [
  "impactResults",
  "technicalDepth",
  "roleRelevance",
  "structureReadability",
  "signalCredibility",
] as const;

export const resumeReviewDimensionKeySchema = z.enum(resumeReviewDimensionKeys);
export type ResumeReviewDimensionKey = z.infer<typeof resumeReviewDimensionKeySchema>;

export const RESUME_REVIEW_SCHEMA_VERSION = 3;

export const RESUME_REVIEW_DIMENSION_DEFINITIONS: {
  checklist: readonly string[];
  key: ResumeReviewDimensionKey;
  label: string;
  weight: number;
}[] = [
  {
    checklist: [
      "是否有量化的业务或产品结果",
      "是否清楚说明负责范围与角色",
      "是否使用清晰的行动-结果式表述",
    ],
    key: "impactResults",
    label: "影响力与结果",
    weight: 0.3,
  },
  {
    checklist: [
      "是否写明具体技术栈细节",
      "是否体现架构设计或权衡思路",
      "是否体现性能、稳定性或扩展性相关工作",
    ],
    key: "technicalDepth",
    label: "技术深度",
    weight: 0.25,
  },
  {
    checklist: [
      "是否匹配目标岗位关键词",
      "项目经历是否与岗位职责相关",
      "内容排序和重点是否支撑岗位匹配度",
    ],
    key: "roleRelevance",
    label: "岗位相关性",
    weight: 0.2,
  },
  {
    checklist: ["项目符号和表述是否简洁", "时间线与格式是否一致", "层级是否清晰、便于快速扫读"],
    key: "structureReadability",
    label: "结构与可读性",
    weight: 0.15,
  },
  {
    checklist: ["是否避免夸大或失真的表述", "是否提供可验证的链接或作品", "成果是否具备清晰上下文"],
    key: "signalCredibility",
    label: "信号可信度",
    weight: 0.1,
  },
];

// v3 严格 schema —— 新写入路径用，保证共享 5 维度齐全。
// Strict v3 schema for new writes; guarantees all shared five dimensions are present.
export const resumeReviewSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  dimensions: z.object({
    impactResults: resumeReviewDimensionSchema,
    roleRelevance: resumeReviewDimensionSchema,
    signalCredibility: resumeReviewDimensionSchema,
    structureReadability: resumeReviewDimensionSchema,
    technicalDepth: resumeReviewDimensionSchema,
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
  schemaVersion: z.literal(RESUME_REVIEW_SCHEMA_VERSION),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmptyStringSchema,
    suggestion: nonEmptyStringSchema,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});

// 宽松 schema —— 读取路径用，兼容旧 v1/v2 数据。
// 旧 json 缺少新维度字段时不报错，消费方用 lodash get 取值，缺失就跳过展示。
// Loose schema for reads; tolerates legacy v1/v2 rows so DB reads don't throw.
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
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(RESUME_REVIEW_SCHEMA_VERSION)]),
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
