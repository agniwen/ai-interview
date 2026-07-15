import type { JsonSchema } from "@mastra/playground-ui/utils/json-schema";
import { z } from "zod3";

export const promptBlockFormSchema = z.object({
  content: z.string(),
  description: z.string().max(500, "描述不能超过 500 个字符"),
  name: z.string().min(1, "名称为必填项").max(100, "名称不能超过 100 个字符"),
  rules: z.any().optional(),
  variables: z.custom<JsonSchema>().optional(),
});

export type PromptBlockFormValues = z.infer<typeof promptBlockFormSchema>;
