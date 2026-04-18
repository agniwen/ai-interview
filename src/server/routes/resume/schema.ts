import { z } from "zod";

export const resumeChatRequestSchema = z.object({
  chatId: z.string().min(1).optional(),
  enableThinking: z.boolean().optional(),
  jobDescription: z.string().optional(),
  messages: z.array(z.any()),
});

export const resumeTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});
