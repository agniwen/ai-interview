import { z } from "zod";

export const resumeChatRequestSchema = z.object({
  chatId: z.string().min(1).optional(),
  enableThinking: z.boolean().optional(),
  jobDescription: z.string().optional(),
  /** Set when `trigger === "regenerate-message"`; identifies the assistant message to replace. */
  messageId: z.string().optional(),
  messages: z.array(z.any()),
  /**
   * 用户在 composer 选中的模型 id；服务端会对照白名单收敛，非法值回落到默认。
   * Model id picked by the user in the composer; server clamps it against the
   * whitelist and falls back to the default for unknown values.
   */
  model: z.string().optional(),
  /** Studio 招聘台记录 id；仅作为本轮模型上下文，不写入 chat_message。 */
  studioResumeId: z.string().min(1).optional(),
  /** Forwarded by `DefaultChatTransport` so the server can branch on intent (AI SDK v6 values). */
  trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
});

export const resumeTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});
