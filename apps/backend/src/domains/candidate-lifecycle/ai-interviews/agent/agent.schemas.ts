import { z } from "zod";
import {
  interviewDataCollectionResultsSchema,
  interviewQuestionOutcomeSchema,
} from "@arc/shared/interview/question-outcomes";

const transcriptTurnSchema = z.object({
  message: z.string(),
  role: z.enum(["agent", "user"]),
  timeInCallSecs: z.number().optional(),
});
const jsonObjectSchema = z.record(z.string(), z.json());
const recordingPayloadSchema = z
  .object({
    durationSecs: z.number().int().nullish(),
    egressId: z.string().min(1),
    fileKey: z.string().min(1),
    status: z.enum(["pending", "active", "completed", "failed"]),
  })
  .nullish();

export const questionCheckpointPayloadSchema = z
  .object({
    conversationId: z.string().min(1),
    interviewRecordId: z.string().min(1),
    outcome: interviewQuestionOutcomeSchema,
    scheduleEntryId: z.string().min(1),
  })
  .strict();

export const reportPayloadSchema = z.object({
  agentId: z.string().nullish(),
  callSuccessful: z.string().nullish(),
  conversationId: z.string().min(1),
  dataCollectionResults: interviewDataCollectionResultsSchema.nullish(),
  endedAt: z.string().nullish(),
  interviewRecordId: z.string().min(1),
  metadata: jsonObjectSchema.nullish(),
  metrics: jsonObjectSchema.nullish(),
  recording: recordingPayloadSchema,
  scheduleEntryId: z.string().min(1),
  startedAt: z.string().nullish(),
  status: z.string().default("completed"),
  transcript: z.array(transcriptTurnSchema).default([]),
});

export const retryNotificationPayloadSchema = z
  .object({
    conversationId: z.string().min(1),
    interviewRecordId: z.string().min(1),
  })
  .partial();

export const retrySummariesResponseSchema = z.object({
  keyInformation: z.object({
    retried: z.number().int().nonnegative(),
    scanned: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  retried: z.number().int().nonnegative(),
  scanned: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
