import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";

export const interviewToolsWorkspacePathSchema = z.object({ slug: z.string().min(1) });
export const jobMatchInputSchema = z.object({
  interviewRecordId: z.string().optional(),
  resumeProfile: resumeProfileSchema,
});
export const resumeReviewInputSchema = z.object({
  jobDescriptionId: z.string().trim().optional().nullable(),
  resumeProfile: resumeProfileSchema,
});
export const interviewQuestionInputSchema = resumeReviewInputSchema;
export const jobMatchResponseSchema = z.object({
  matchedId: z.string().nullable(),
  reason: z.string().nullable(),
});

export const resumeChatFocusSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().trim().min(1), kind: z.literal("resume_record") }).strict(),
]);
export const resumeChatRequestSchema = z
  .object({
    chatId: z.string().min(1).optional(),
    focus: resumeChatFocusSchema.optional(),
    id: z.string().min(1).optional(),
    messageId: z.string().optional(),
    messages: z.array(z.unknown()),
    trigger: z.enum(["regenerate-message", "submit-message"]).optional(),
  })
  .strict();
