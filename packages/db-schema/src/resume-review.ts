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

// v4 维度 key 枚举 —— 与产品简历评价/评分框架保持一致的 6 维度模型。
// v4 dimension keys — aligned with the product resume review/scoring framework.
const resumeReviewDimensionKeys = [
  "skillMatch",
  "experienceRelevance",
  "projectMatch",
  "educationBackground",
  "potential",
  "stability",
] as const;

export const resumeReviewDimensionKeySchema = z.enum(resumeReviewDimensionKeys);
export type ResumeReviewDimensionKey = z.infer<typeof resumeReviewDimensionKeySchema>;

export const RESUME_REVIEW_SCHEMA_VERSION = 4;

export const RESUME_REVIEW_DIMENSION_DEFINITIONS: {
  checklist: readonly string[];
  key: ResumeReviewDimensionKey;
  label: string;
  weight: number;
}[] = [
  {
    checklist: [
      "JD 核心技能与候选人技能是否语义匹配",
      "候选人是否在工作或项目中实际使用过这些技能",
      "是否覆盖必备技术栈而不是仅有相邻关键词",
    ],
    key: "skillMatch",
    label: "技能匹配度",
    weight: 0.35,
  },
  {
    checklist: [
      "行业背景或业务领域是否与岗位相关",
      "职责范围和岗位层级是否吻合",
      "技术栈、业务场景、团队环境是否具备迁移价值",
    ],
    key: "experienceRelevance",
    label: "经验相关性",
    weight: 0.25,
  },
  {
    checklist: [
      "关键项目复杂度是否对应岗位要求",
      "候选人在项目中的角色和职责是否清楚",
      "项目成果是否能支撑岗位胜任判断",
    ],
    key: "projectMatch",
    label: "项目匹配度",
    weight: 0.15,
  },
  {
    checklist: [
      "学历层次是否符合岗位预期",
      "专业方向是否与岗位相关",
      "教育背景是否补强岗位匹配判断",
    ],
    key: "educationBackground",
    label: "学历/背景",
    weight: 0.1,
  },
  {
    checklist: [
      "成长曲线是否清晰",
      "技术或业务广度是否支持后续发展",
      "是否体现学习能力和承担更复杂任务的潜力",
    ],
    key: "potential",
    label: "潜力评估",
    weight: 0.08,
  },
  {
    checklist: ["平均在职时长是否合理", "跳槽频率是否存在风险", "职业路径是否连贯且解释充分"],
    key: "stability",
    label: "稳定性评估",
    weight: 0.07,
  },
];

// v4 严格 schema —— 新写入路径用，保证产品 6 维度齐全。
// Strict v4 schema for new writes; guarantees all product six dimensions are present.
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
  schemaVersion: z.literal(RESUME_REVIEW_SCHEMA_VERSION),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmptyStringSchema,
    suggestion: nonEmptyStringSchema,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});

// 宽松 schema —— 读取路径用，兼容旧 v1/v2/v3 数据。
// 旧 json 缺少新维度字段时不报错，消费方用 lodash get 取值，缺失就跳过展示。
// Loose schema for reads; tolerates legacy v1/v2/v3 rows so DB reads don't throw.
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
  schemaVersion: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(RESUME_REVIEW_SCHEMA_VERSION),
  ]),
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
