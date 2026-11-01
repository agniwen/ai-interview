import { z } from "zod";

/** An evidence-review violation the AI could not resolve; shown beside its AI draft. */
export const humanInterviewEvaluationReviewFindingSchema = z
  .object({
    quote: z.string().trim().min(1).max(1000),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();
export type HumanInterviewEvaluationReviewFinding = z.infer<
  typeof humanInterviewEvaluationReviewFindingSchema
>;
