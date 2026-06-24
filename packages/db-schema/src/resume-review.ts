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

export const resumeReviewSchema = z.object({
  biasScan: z.object({
    items: z.array(resumeReviewBiasItemSchema),
  }),
  dimensions: z.object({
    impactAndResults: resumeReviewDimensionSchema,
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
    conclusion: nonEmptyStringSchema,
    score: scoreSchema,
    scoreRationale: nonEmptyStringSchema,
  }),
  schemaVersion: z.literal(1),
  strengths: z.array(resumeReviewPointSchema).min(1).max(4),
  teamPositioning: z.object({
    rationale: nonEmptyStringSchema,
    suggestion: nonEmptyStringSchema,
  }),
  weaknesses: z.array(resumeReviewPointSchema).min(1).max(4),
});

export type ResumeReview = z.infer<typeof resumeReviewSchema>;
export type ResumeReviewDimension = z.infer<typeof resumeReviewDimensionSchema>;
export type ResumeReviewPoint = z.infer<typeof resumeReviewPointSchema>;
export type ResumeReviewBiasItem = z.infer<typeof resumeReviewBiasItemSchema>;
