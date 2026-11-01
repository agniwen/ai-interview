import { z } from "zod";
import { interviewDataCollectionResultsSchema } from "@app/shared/interview/question-outcomes";
import type { questionCheckpointPayloadSchema } from "./question-checkpoint";

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

export const reportPayloadSchema = z.object({
  agentId: z.string().nullish(),
  callSuccessful: z.string().nullish(),
  conversationId: z.string().min(1),
  dataCollectionResults: interviewDataCollectionResultsSchema.nullish(),
  endedAt: z.string().nullish(),
  interviewRecordId: z.string().min(1),
  metadata: jsonObjectSchema.nullish(),
  // Agent 端 metrics_collected 聚合：STT/LLM/TTS/EOU/打断的会话级总览与每轮 e2e。
  // 原样落到 interview_conversation.metrics，后续 Studio 渲染延迟/用量面板时直接查。
  // Aggregates emitted by the agent's metrics_collected listener: STT/LLM/TTS/
  // EOU/interruption totals plus per-turn e2e latency. Persisted as-is so the
  // Studio dashboard can render latency/usage panels without re-shaping.
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

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
export type CheckpointPayload = z.infer<typeof questionCheckpointPayloadSchema>;
export type ReportTranscript = ReportPayload["transcript"];
