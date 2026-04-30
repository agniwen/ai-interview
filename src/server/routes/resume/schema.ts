import { z } from "zod";

export const resumeChatRequestSchema = z.object({
  chatId: z.string().min(1).optional(),
  enableThinking: z.boolean().optional(),
  jobDescription: z.string().optional(),
  /** Set when `trigger === "regenerate-message"`; identifies the assistant message to replace. */
  messageId: z.string().optional(),
  messages: z.array(z.any()),
  /** Forwarded by `DefaultChatTransport` so the server can branch on intent (AI SDK v6 values). */
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

export const resumeTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});
