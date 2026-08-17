import { z } from "zod";

export const resumeChatRequestSchema = z
  .object({
    chatId: z.string().min(1).optional(),
    focus: z
      .discriminatedUnion("kind", [
        z
          .object({
            id: z.string().trim().min(1),
            kind: z.literal("resume_record"),
          })
          .strict(),
      ])
      .optional(),
    /** AI SDK conversation id; the persisted conversation uses chatId. */
    id: z.string().min(1).optional(),
    /** Set when `trigger === "regenerate-message"`; identifies the assistant message to replace. */
    messageId: z.string().optional(),
    messages: z.array(z.unknown()),
    /** Forwarded by `DefaultChatTransport` so the server can branch on intent (AI SDK v6 values). */
    trigger: z.enum(["submit-message", "regenerate-message"]).optional(),
  })
  .strict();

export type ResumeChatMessagesInput = z.input<typeof resumeChatRequestSchema>["messages"];

export const resumeTitleRequestSchema = z.object({
  hasFiles: z.boolean().optional(),
  text: z.string().trim().min(1).max(5000),
});
