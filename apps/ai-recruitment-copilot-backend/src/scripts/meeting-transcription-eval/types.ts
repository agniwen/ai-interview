import type { MeetingTranscriptionProviderId } from "@arc/shared/meeting-transcription";
import { z } from "zod";
import { meetingTranscriptionProviderSchema } from "@arc/shared/meeting-transcription";

export type BenchmarkEntityCategory = "english" | "technical";

export interface BenchmarkEntity {
  category: BenchmarkEntityCategory;
  text: string;
}

export interface BenchmarkInterval {
  endMs: number;
  referenceTexts: string[];
  startMs: number;
}

export interface MeetingTranscriptionBenchmarkScore {
  chineseCharacterErrorRate: number;
  englishEntityRecall: number;
  meanTimestampDriftMs: number;
  overlapSpeechLossRate: number;
  speakerErrorRate: number;
  technicalEntityRecall: number;
}

export type BenchmarkDeletionOutcome =
  | "deleted"
  | "delete-failed"
  | "not-applicable"
  | "unsupported";

export interface MeetingTranscriptionBenchmarkRun {
  actualCostUsd: number | null;
  caseId: string;
  deletion: BenchmarkDeletionOutcome;
  errorCode?:
    | "malformed-response"
    | "partial-result"
    | "provider-error"
    | "rate-limited"
    | "timeout";
  latencyMs: number;
  model: string;
  provider: MeetingTranscriptionProviderId;
  reconciledAttemptCostUsd?: number;
  region: string;
  retryCount: number;
  score: MeetingTranscriptionBenchmarkScore | null;
  status: "failed" | "succeeded";
}

const benchmarkScoreSchema = z.object({
  chineseCharacterErrorRate: z.number().nonnegative(),
  englishEntityRecall: z.number().min(0).max(1),
  meanTimestampDriftMs: z.number().nonnegative(),
  overlapSpeechLossRate: z.number().min(0).max(1),
  speakerErrorRate: z.number().min(0).max(1),
  technicalEntityRecall: z.number().min(0).max(1),
});

export const meetingTranscriptionBenchmarkRunSchema: z.ZodType<MeetingTranscriptionBenchmarkRun> =
  z.object({
    actualCostUsd: z.number().nonnegative().nullable(),
    caseId: z.string().min(1),
    deletion: z.enum(["deleted", "delete-failed", "not-applicable", "unsupported"]),
    errorCode: z
      .enum(["malformed-response", "partial-result", "provider-error", "rate-limited", "timeout"])
      .optional(),
    latencyMs: z.number().int().nonnegative(),
    model: z.string().min(1),
    provider: meetingTranscriptionProviderSchema,
    reconciledAttemptCostUsd: z.number().nonnegative().optional(),
    region: z.string().min(1),
    retryCount: z.number().int().nonnegative(),
    score: benchmarkScoreSchema.nullable(),
    status: z.enum(["failed", "succeeded"]),
  });
