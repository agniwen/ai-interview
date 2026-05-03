import { z } from "zod";

export const jobDescriptionConfigSchema = z.union([
  z.object({
    departmentName: z.string().nullable(),
    jobDescriptionId: z.string().min(1),
    mode: z.literal("select"),
    name: z.string().min(1),
    prompt: z.string(),
  }),
  z.object({
    mode: z.literal("custom"),
    text: z.string(),
  }),
]);

export const upsertChatMessageSchema = z.object({
  message: z
    .object({
      id: z.string().min(1),
      role: z.enum(["system", "user", "assistant"]),
    })
    .loose(),
});

export const upsertConversationSchema = z.object({
  createdAt: z.number().int().nonnegative().optional(),
  id: z.string().min(1),
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  jobDescriptionConfig: jobDescriptionConfigSchema.nullable().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

export const patchConversationSchema = z.object({
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  jobDescriptionConfig: jobDescriptionConfigSchema.nullable().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
