import { z } from "zod";
import type { MeetingLiveTranscriptAuthorization } from "./meeting-transcription";

const blockSchema = z
  .object({
    id: z.string().min(1).max(1024),
    itemId: z.string().min(1).max(512),
    originalText: z
      .string()
      .min(1)
      .max(10_000)
      .refine((text) => text.trim().length > 0),
    sectionId: z.string().min(1).max(512),
    track: z.enum(["microphone", "system"]),
  })
  .refine((block) => block.id === `${block.sectionId}:${block.itemId}`);
const contextSchema = z.array(z.string().max(2000)).max(5);

export const liveCorrectionBatchSchema = z.object({
  batchId: z.string().uuid(),
  blocks: z
    .array(blockSchema)
    .min(1)
    .max(3)
    .refine((blocks) => new Set(blocks.map((block) => block.id)).size === blocks.length),
  context: z.object({ after: contextSchema, before: contextSchema }),
  lookahead: blockSchema.optional(),
});
export const liveCorrectionResultSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: z.string().min(1).max(1024),
        text: z.string().trim().min(1).max(10_000).nullable(),
      }),
    )
    .min(1)
    .max(3),
});
export const liveCorrectionEventSchema = z.discriminatedUnion("status", [
  z.object({
    batchId: z.string().uuid(),
    status: z.literal("finished"),
    type: z.literal("meeting.transcription.correction-batch"),
  }),
  z.object({
    batchId: z.string().uuid(),
    blocks: liveCorrectionResultSchema.shape.blocks,
    combinedTranscript: z.string().trim().min(1).max(30_000),
    model: z.string().min(1).max(128),
    status: z.literal("completed"),
    type: z.literal("meeting.transcription.correction-batch"),
  }),
]);

export type LiveCorrectionBatch = z.infer<typeof liveCorrectionBatchSchema>;
export type LiveCorrectionEvent = z.infer<typeof liveCorrectionEventSchema>;
export type LiveTranscriptPortAuthorization = MeetingLiveTranscriptAuthorization & {
  captureId: string;
  sectionId: string;
};
