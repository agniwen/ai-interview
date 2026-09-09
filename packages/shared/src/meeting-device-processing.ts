import { z } from "zod";
import {
  canonicalMeetingTranscriptTurnSchema,
  meetingLiveTranscriptDraftSchema,
} from "./meeting-transcription";
import {
  meetingIntelligenceGenerationProgressSchema,
  meetingIntelligencePayloadSchema,
  meetingIntelligenceTemplateSchema,
} from "./meeting-intelligence";
import { meetingLiveSummarySnapshotSchema } from "./meeting-live-summary";

export const echoProcessingOwnershipSchema = z.object({
  accountId: z.string().min(1),
  deviceId: z.uuid(),
});
export const echoDeviceEpochSchema = z.object({ epoch: z.number().int().positive() });
export const echoDeviceOperationSchema = echoDeviceEpochSchema.extend({ operationId: z.uuid() });
export const echoTranscriptTurnSchema = canonicalMeetingTranscriptTurnSchema.safeExtend({
  id: z.string().min(1).max(200),
});
export const echoTranscriptSchema = z
  .object({
    language: z.string().nullable(),
    model: z.string().min(1),
    pipelineVersion: z.string().min(1),
    provider: z.string().min(1),
    region: z.string().min(1),
    revisionId: z.string().min(1).max(200),
    turns: echoTranscriptTurnSchema.array().max(100_000),
  })
  .refine(
    (input) => new Set(input.turns.map((turn) => turn.id)).size === input.turns.length,
    "转录轮次 ID 不能重复",
  );
export type EchoTranscript = z.infer<typeof echoTranscriptSchema>;

export const echoDeviceContextSchema = z.object({
  accountId: z.string().nullable(),
  deviceId: z.string().nullable(),
  epoch: z.number().int().positive(),
  intelligence: meetingIntelligencePayloadSchema.nullable(),
  intelligenceModel: z.object({ model: z.string(), provider: z.string() }),
  intelligenceRevisionId: z.string().nullable(),
  liveSummary: meetingLiveSummarySnapshotSchema.nullable(),
  liveTranscriptDraft: meetingLiveTranscriptDraftSchema.nullable(),
  manifestSha256: z.string(),
  meetingId: z.string(),
  playbackReady: z.boolean(),
  processingComplete: z.boolean(),
  processingOwner: z.enum(["device", "worker"]),
  recoveryCopyDeleteAfter: z.string().nullable(),
  savedAt: z.string(),
  sourceVerified: z.boolean(),
  startedAt: z.string(),
  suggestedTemplate: meetingIntelligenceTemplateSchema,
  title: z.string(),
  transcript: echoTranscriptSchema.nullable(),
  transcription: z.object({
    languageHint: z.string().nullable(),
    model: z.string(),
    pipelineVersion: z.string(),
    provider: z.literal("qwen"),
    region: z.string(),
  }),
});
export type EchoDeviceContext = z.infer<typeof echoDeviceContextSchema>;

export const echoArtifactSchema = z.object({
  artifactId: z.uuid(),
  contentType: z.literal("audio/webm"),
  durationMs: z.number().int().positive().max(86_400_000),
  kind: z.enum(["chunk", "playback"]),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive().max(4_294_967_296),
});
export const echoArtifactRequestSchema = echoDeviceEpochSchema.extend({
  artifact: echoArtifactSchema,
});
export const echoArtifactUploadSchema = z.object({
  headers: z.record(z.string(), z.string()),
  method: z.literal("PUT"),
  url: z.url(),
});
export const echoTranscriptionChunkSchema = z
  .object({
    endMs: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    startMs: z.number().int().nonnegative(),
    track: z.enum(["microphone", "system"]),
  })
  .refine(
    (chunk) => chunk.endMs > chunk.startMs && chunk.endMs - chunk.startMs <= 1_800_000,
    "转写分段时长无效",
  );
export const echoSubmitTranscriptionSchema = echoDeviceOperationSchema.extend({
  artifact: echoArtifactSchema,
  chunk: echoTranscriptionChunkSchema,
  model: z.string().min(1),
});
export const echoPollTranscriptionSchema = echoDeviceEpochSchema.extend({ submissionId: z.uuid() });
export const echoIntelligenceStepSchema = echoDeviceOperationSchema.extend({
  generator: z.object({ model: z.string(), provider: z.string() }),
  progress: meetingIntelligenceGenerationProgressSchema.nullable(),
  template: meetingIntelligenceTemplateSchema,
  transcript: echoTranscriptSchema,
});
export const echoIntelligenceStepResultSchema = z.discriminatedUnion("state", [
  z.object({
    progress: meetingIntelligenceGenerationProgressSchema,
    state: z.literal("checkpoint"),
  }),
  z.object({ content: meetingIntelligencePayloadSchema, state: z.literal("ready") }),
]);
export const echoSyncTranscriptSchema = echoDeviceOperationSchema.extend({
  expectedTranscriptRevisionId: z.string().nullable(),
  transcript: echoTranscriptSchema,
});
export const echoSyncIntelligenceSchema = echoDeviceOperationSchema.extend({
  content: meetingIntelligencePayloadSchema,
  expectedIntelligenceRevisionId: z.string().nullable(),
  generationOperationId: z.uuid(),
  transcriptRevisionId: z.string(),
});

export const echoAdoptionSchema = z.object({
  context: echoDeviceContextSchema,
  sources: z
    .object({
      contentType: z.string(),
      durationMs: z.number().nonnegative(),
      fragmentCount: z.number().int().nonnegative(),
      segments: z
        .object({
          durationMs: z.number().nonnegative(),
          offsetBytes: z.number().int().nonnegative(),
          sizeBytes: z.number().int().positive(),
        })
        .array()
        .nullable(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      sizeBytes: z.number().int().positive().max(2_000_000_000),
      track: z.enum(["microphone", "system"]),
      url: z.url(),
    })
    .array()
    .max(2),
});

export const echoDeletionStateSchema = z.object({
  canAdvance: z.boolean(),
  manifestSha256: z.string(),
  nextAttemptAt: z.string(),
  state: z.enum(["retained", "purging", "deleted"]),
});
