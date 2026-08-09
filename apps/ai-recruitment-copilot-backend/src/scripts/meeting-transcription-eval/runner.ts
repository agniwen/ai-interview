import { setTimeout as delay } from "node:timers/promises";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  MeetingTranscriptionProviderId,
} from "@arc/shared/meeting-transcription";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "../../server/routes/meetings/transcription/provider";
import { MEETING_TRANSCRIPTION_BENCHMARK_MAX_TRANSCRIPT_CHARS } from "./dataset";
import type { MeetingTranscriptionEvalCase } from "./dataset";
import { scoreMeetingTranscription } from "./metrics";
import type { MeetingTranscriptionBenchmarkRun } from "./types";

export interface MeetingTranscriptionBenchmarkAdapter {
  deleteArtifact?: (artifact: unknown) => Promise<void>;
  transcribe: (input: {
    benchmarkCase: MeetingTranscriptionEvalCase;
    signal: AbortSignal;
  }) => Promise<{
    artifact?: unknown;
    retryCount?: number;
    transcript: CanonicalMeetingTranscript;
  }>;
}

export class MeetingTranscriptionBenchmarkCallError extends Error {
  readonly artifact: unknown;
  readonly retryCount: number;

  constructor(cause: unknown, artifact: unknown, retryCount = 0) {
    super("Meeting transcription benchmark provider call failed after creating an artifact", {
      cause,
    });
    this.name = "MeetingTranscriptionBenchmarkCallError";
    this.artifact = artifact;
    this.retryCount = retryCount;
  }
}

async function cleanupArtifact(
  adapter: MeetingTranscriptionBenchmarkAdapter,
  artifact: unknown,
): Promise<MeetingTranscriptionBenchmarkRun["deletion"]> {
  if (artifact === undefined) {
    return "not-applicable";
  }
  if (!adapter.deleteArtifact) {
    return "unsupported";
  }
  try {
    await adapter.deleteArtifact(artifact);
    return "deleted";
  } catch {
    return "delete-failed";
  }
}

function classifyError(error: unknown): NonNullable<MeetingTranscriptionBenchmarkRun["errorCode"]> {
  if (error instanceof MeetingProviderQuotaError) {
    return "rate-limited";
  }
  if (error instanceof MeetingProviderResponseError) {
    return error.code;
  }
  if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)) {
    return "timeout";
  }
  return "provider-error";
}

function terminalError(error: unknown): boolean {
  return error instanceof MeetingProviderResponseError;
}

export async function runMeetingTranscriptionBenchmarkCase(input: {
  actualCostUsd: number | null;
  adapter: MeetingTranscriptionBenchmarkAdapter;
  benchmarkCase: MeetingTranscriptionEvalCase;
  maxAttempts: number;
  model: string;
  provider: MeetingTranscriptionProviderId;
  region: string;
  retryDelay?: (retryCount: number) => Promise<void>;
  timeoutMs?: number;
}): Promise<MeetingTranscriptionBenchmarkRun> {
  const startedAt = performance.now();
  let attempts = 0;
  let adapterRetryCount = 0;
  let artifact: unknown;
  let transcript: CanonicalMeetingTranscript | null = null;
  let failure: unknown;
  while (attempts < input.maxAttempts) {
    attempts += 1;
    try {
      const result = await input.adapter.transcribe({
        benchmarkCase: input.benchmarkCase,
        signal: AbortSignal.timeout(input.timeoutMs ?? 30 * 60 * 1000),
      });
      const parsed = canonicalMeetingTranscriptSchema.safeParse(result.transcript);
      if (!parsed.success) {
        throw new MeetingProviderResponseError("malformed-response", input.provider);
      }
      if (
        parsed.data.turns.reduce((total, turn) => total + turn.text.length, 0) >
        MEETING_TRANSCRIPTION_BENCHMARK_MAX_TRANSCRIPT_CHARS
      ) {
        throw new MeetingProviderResponseError("malformed-response", input.provider);
      }
      transcript = parsed.data;
      adapterRetryCount = result.retryCount ?? 0;
      ({ artifact } = result);
      break;
    } catch (error) {
      const providerError =
        error instanceof MeetingTranscriptionBenchmarkCallError ? error.cause : error;
      if (error instanceof MeetingTranscriptionBenchmarkCallError) {
        ({ artifact } = error);
        adapterRetryCount = error.retryCount;
      }
      failure = providerError;
      if (terminalError(providerError)) {
        break;
      }
      if (providerError instanceof MeetingProviderQuotaError && attempts < input.maxAttempts) {
        await (input.retryDelay?.(attempts) ?? delay(1000 * 2 ** (attempts - 1)));
        continue;
      }
      break;
    }
  }
  const latencyMs = Math.round(performance.now() - startedAt);
  if (!transcript) {
    return {
      actualCostUsd: input.actualCostUsd,
      caseId: input.benchmarkCase.id,
      deletion: await cleanupArtifact(input.adapter, artifact),
      errorCode: classifyError(failure),
      latencyMs,
      model: input.model,
      provider: input.provider,
      region: input.region,
      retryCount: Math.max(adapterRetryCount, attempts - 1),
      score: null,
      status: "failed",
    };
  }
  const deletion = await cleanupArtifact(input.adapter, artifact);
  return {
    actualCostUsd: input.actualCostUsd,
    caseId: input.benchmarkCase.id,
    deletion,
    latencyMs,
    model: input.model,
    provider: input.provider,
    region: input.region,
    retryCount: Math.max(adapterRetryCount, attempts - 1),
    score: scoreMeetingTranscription({
      entities: input.benchmarkCase.entities,
      evaluationDurationMs: Math.max(
        ...input.benchmarkCase.assets.map((asset) => asset.durationMs),
      ),
      overlapIntervals: input.benchmarkCase.overlapIntervals,
      prediction: transcript,
      reference: input.benchmarkCase.reference,
    }),
    status: "succeeded",
  };
}
