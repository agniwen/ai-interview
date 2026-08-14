import { z } from "zod3";

export const STORED_SCORER_TYPES = ["llm-judge"] as const;

export type StoredScorerType = (typeof STORED_SCORER_TYPES)[number];

const samplingConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ rate: z.number().min(0).max(1), type: z.literal("ratio") }),
]);

export const scorerFormSchema = z.object({
  defaultSampling: samplingConfigSchema.optional(),
  description: z.string().max(500, "描述不能超过 500 个字符"),
  instructions: z.string(),
  model: z.object({
    name: z.string(),
    provider: z.string(),
  }),
  name: z.string().min(1, "名称为必填项").max(100, "名称不能超过 100 个字符"),
  scoreRange: z.object({
    max: z.number(),
    min: z.number(),
  }),
  type: z.enum(STORED_SCORER_TYPES),
});

export type ScorerFormValues = z.infer<typeof scorerFormSchema>;
