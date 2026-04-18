import { z } from "zod";

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
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

export const patchConversationSchema = z.object({
  isTitleGenerating: z.boolean().optional(),
  jobDescription: z.string().optional(),
  resumeImports: z.record(z.string(), z.string()).optional(),
  title: z.string().optional(),
});

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
