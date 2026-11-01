import { z } from "zod";

export const humanTranscriptionModeSchema = z.enum(["legacy", "shadow", "server_realtime"]);
export const humanTranscriptionJobSchema = z.object({
  generation: z.number().int().positive(),
  kind: z.literal("human_interview_transcription"),
  meetingId: z.string().min(1).max(256),
  organizationId: z.string().min(1).max(256),
  roomName: z.string().startsWith("human_"),
  runId: z.string().min(1).max(256),
  schemaVersion: z.literal(1),
});
// Created once by each Agent execution, independently of dispatch metadata.
export const humanTranscriptionCallbackSchema = humanTranscriptionJobSchema.extend({
  executionId: z.uuid(),
});
export const humanTranscriptionEventSchema = z
  .object({
    endMs: z.number().nonnegative(),
    eventId: z.string().min(1).max(256),
    itemId: z.string().min(1).max(256),
    kind: z.enum(["final", "gap", "stream_started", "stream_ended"]),
    participantIdentity: z.string().min(1).max(256),
    providerTaskId: z.string().min(1).max(256),
    revision: z.number().int().nonnegative(),
    startMs: z.number().nonnegative(),
    streamEpoch: z.string().min(1).max(256),
    text: z.string().max(20_000).default(""),
    trackId: z.string().min(1).max(256),
  })
  .refine((event) => event.endMs >= event.startMs, { message: "音频区间无效" });
export const appendHumanTranscriptionSchema = humanTranscriptionCallbackSchema.extend({
  events: z.array(humanTranscriptionEventSchema).max(100),
});
export type HumanTranscriptionJob = z.infer<typeof humanTranscriptionJobSchema>;
export type HumanTranscriptionCallback = z.infer<typeof humanTranscriptionCallbackSchema>;
export type HumanTranscriptionEvent = z.infer<typeof humanTranscriptionEventSchema>;

// UI-only transport. Interim text must never enter the durable event endpoint.
export const HUMAN_TRANSCRIPTION_PREVIEW_TOPIC = "human-transcription.preview.v1";
export const humanTranscriptionPreviewSchema = z.object({
  event: z
    .object({
      ...humanTranscriptionEventSchema.shape,
      kind: z.enum(["interim", "final"]),
    })
    .refine((event) => event.endMs >= event.startMs, { message: "音频区间无效" }),
  executionId: z.uuid(),
  generation: z.number().int().positive(),
  runId: z.string().min(1).max(256),
  sequence: z.number().int().positive(),
});
export type HumanTranscriptionPreview = z.infer<typeof humanTranscriptionPreviewSchema>;
