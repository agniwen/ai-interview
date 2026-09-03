import { z } from "zod";

const structuredResumeReviewDimensionSchema = z.object({
  rationale: z.string(),
  score: z.number().int().min(0).max(100),
  weight: z.number().int().min(0).max(100),
});

export const structuredResumeReviewSchema = z.object({
  adjustments: z.array(
    z.object({
      appliedPoints: z.number().int(),
      kind: z.enum(["exclusion", "priority"]),
      reason: z.string(),
      sourceText: z.string(),
    }),
  ),
  compositeScore: z.number().int().min(0).max(100),
  dimensions: z.object({
    educationBackground: structuredResumeReviewDimensionSchema,
    experienceRelevance: structuredResumeReviewDimensionSchema,
    potential: structuredResumeReviewDimensionSchema,
    projectMatch: structuredResumeReviewDimensionSchema,
    skillMatch: structuredResumeReviewDimensionSchema,
    stability: structuredResumeReviewDimensionSchema,
  }),
  gateJudgments: z.array(
    z.object({
      category: z.string(),
      reason: z.string(),
      status: z.enum(["failed", "needs_verification", "passed"]),
    }),
  ),
  gateStatus: z.enum(["failed", "needs_verification", "passed"]),
  grade: z.enum(["matched", "recommended", "unmatched"]),
  overallComment: z.string().nullable(),
  recommendation: z.string(),
  summary: z.string(),
});

export type StructuredResumeReview = z.infer<typeof structuredResumeReviewSchema>;
