import { z } from "zod";
import { interviewQuestionOutcomeSchema } from "@app/shared/interview/question-outcomes";

export const questionCheckpointPayloadSchema = z
  .object({
    conversationId: z.string().min(1),
    interviewRecordId: z.string().min(1),
    outcome: interviewQuestionOutcomeSchema,
    scheduleEntryId: z.string().min(1),
  })
  .strict();

export function parseQuestionCheckpoint(value: z.input<typeof questionCheckpointPayloadSchema>) {
  return questionCheckpointPayloadSchema.parse(value);
}
