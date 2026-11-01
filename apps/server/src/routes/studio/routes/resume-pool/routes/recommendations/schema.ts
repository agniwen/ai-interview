import { z } from "zod";

export const jdRecommendationBodySchema = z.object({
  topN: z.number().int().min(1).max(50).optional(),
});
