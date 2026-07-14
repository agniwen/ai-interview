import { z } from "zod3";

export const STORED_SCORER_TYPES = ["llm-judge"] as const;

export type StoredScorerType = (typeof STORED_SCORER_TYPES)[number];

const samplingConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ rate: z.number().min(0).max(1), type: z.literal("ratio") }),
]);

export const scorerFormSchema = z.object({
  defaultSampling: samplingConfigSchema.optional(),
  description: z.string().max(500, "Description must be 500 characters or less"),
  instructions: z.string(),
  model: z.object({
    name: z.string(),
    provider: z.string(),
  }),
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  scoreRange: z.object({
    max: z.number(),
    min: z.number(),
  }),
  type: z.enum(STORED_SCORER_TYPES),
});

export type ScorerFormValues = z.infer<typeof scorerFormSchema>;
