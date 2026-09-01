/* oxlint-disable complexity -- Provider submit/poll/result validation is one externally atomic operation. */
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "../background-workloads/processors/meeting-transcription.processor.js";
import type { FinalTranscriptionAudioChunk } from "../background-workloads/processors/meeting-transcription.processor.js";

const submitSchema = z
  .object({ output: z.object({ task_id: z.string().min(1) }).passthrough() })
  .passthrough();
const pollSchema = z
  .object({
    output: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
        result: z.object({ transcription_url: z.string().nullish() }).passthrough().nullish(),
        results: z
          .array(
            z
              .object({
                subtask_status: z.string().nullish(),
                transcription_url: z.string().nullish(),
              })
              .passthrough(),
          )
          .nullish(),
        task_status: z.string(),
      })
      .passthrough(),
  })
  .passthrough();
const resultSchema = z
  .object({
    transcripts: z
      .array(
        z
          .object({
            sentences: z
              .array(
                z
                  .object({
                    begin_time: z.number().int().nonnegative(),
                    end_time: z.number().int().nonnegative(),
                    speaker_id: z.number().int().nonnegative().nullish(),
                    text: z.string(),
                  })
                  .passthrough(),
              )
              .nullish(),
          })
          .passthrough(),
      )
      .nullish(),
  })
  .passthrough();

function resultUrl(value: string): string {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.endsWith(".aliyuncs.com")) {
    throw new MeetingProviderResponseError("Qwen ASR returned an unsafe result URL");
  }
  return value;
}

export async function transcribeQwenChunk(input: {
  apiKey: string;
  audioUrl: string;
  baseUrl: string;
  chunk: FinalTranscriptionAudioChunk;
  model: string;
  pollIntervalMs: number;
  pollTimeoutMs: number;
}): Promise<CanonicalMeetingTranscript> {
  const { origin } = new URL(input.baseUrl);
  const headers = {
    Authorization: `Bearer ${input.apiKey}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };
  const submit = await fetch(`${origin}/api/v1/services/audio/asr/transcription`, {
    body: JSON.stringify({
      input: { file_url: input.audioUrl },
      model: input.model,
      parameters: {
        channel_id: [0],
        diarization_enabled:
          input.model.startsWith("qwen-audio-3.0-asr-flash-filetrans") &&
          input.chunk.track === "system"
            ? true
            : undefined,
        enable_itn: true,
      },
    }),
    headers,
    method: "POST",
    signal: AbortSignal.timeout(input.pollTimeoutMs),
  });
  if (submit.status === 429) {
    throw new MeetingProviderQuotaError();
  }
  if (!submit.ok) {
    throw new Error(`Qwen ASR submit failed (${submit.status})`);
  }
  const taskId = submitSchema.parse(await submit.json()).output.task_id;
  const deadline = Date.now() + input.pollTimeoutMs;
  let transcriptionUrl: string | null = null;
  while (Date.now() < deadline) {
    const poll = await fetch(`${origin}/api/v1/tasks/${taskId}`, {
      headers,
      signal: AbortSignal.timeout(input.pollTimeoutMs),
    });
    if (poll.status === 429) {
      throw new MeetingProviderQuotaError();
    }
    if (!poll.ok) {
      throw new Error(`Qwen ASR poll failed (${poll.status})`);
    }
    const body = pollSchema.parse(await poll.json()).output;
    if (body.task_status === "SUCCEEDED") {
      transcriptionUrl =
        body.result?.transcription_url ??
        (body.results ?? []).find((entry) => entry.subtask_status !== "FAILED")
          ?.transcription_url ??
        null;
      break;
    }
    if (["FAILED", "CANCELED"].includes(body.task_status)) {
      if (body.code === "SUCCESS_WITH_NO_VALID_FRAGMENT") {
        return { language: null, turns: [] };
      }
      throw new MeetingProviderResponseError(
        `Qwen ASR task failed: ${body.code ?? "unknown"} ${body.message ?? ""}`,
      );
    }
    await delay(input.pollIntervalMs);
  }
  if (!transcriptionUrl) {
    throw new Error(`Qwen ASR task ${taskId} timed out or returned no result`);
  }
  const response = await fetch(resultUrl(transcriptionUrl), {
    signal: AbortSignal.timeout(input.pollTimeoutMs),
  });
  if (!response.ok) {
    throw new Error(`Qwen ASR result failed (${response.status})`);
  }
  const body = resultSchema.parse(await response.json());
  const remoteSpeakers = new Map<number, string>();
  const turns = (body.transcripts ?? []).flatMap((transcript) =>
    (transcript.sentences ?? []).flatMap((sentence) => {
      const text = sentence.text.trim();
      const startMs = Math.max(input.chunk.startMs, input.chunk.startMs + sentence.begin_time);
      const endMs = Math.min(input.chunk.endMs, input.chunk.startMs + sentence.end_time);
      if (!text || endMs <= startMs) {
        return [];
      }
      const local = input.chunk.track === "microphone";
      const speakerId = sentence.speaker_id ?? 0;
      if (!remoteSpeakers.has(speakerId)) {
        remoteSpeakers.set(speakerId, `remote-${remoteSpeakers.size + 1}`);
      }
      return [
        {
          confidence: null,
          endMs,
          speakerKey: local ? "local" : (remoteSpeakers.get(speakerId) ?? "remote-1"),
          startMs,
          text,
          track: local ? ("local" as const) : ("remote" as const),
        },
      ];
    }),
  );
  return canonicalMeetingTranscriptSchema.parse({ language: null, turns });
}
