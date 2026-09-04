import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { isMixedMeetingRecordingSource } from "@app/meeting-media";
import { canonicalMeetingTranscriptSchema } from "@app/shared/meeting-transcription";
import type {
  CanonicalMeetingTranscript,
  CanonicalMeetingTranscriptTurn,
} from "@app/shared/meeting-transcription";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "./meeting-transcription-provider";
import type {
  FinalTranscriptionAudioChunk,
  MeetingRecognitionHints,
  MeetingTranscriptionProvider,
} from "./meeting-transcription-provider";

/**
 * 阿里云百炼（DashScope）录音文件识别适配器。
 * Adapter for Alibaba Cloud Bailian (DashScope) non-real-time speech recognition.
 *
 * 流程：把每个 chunk 转成可公网访问的 URL → 异步提交任务（X-DashScope-Async: enable）
 * → 轮询任务状态 → 下载结果 JSON → 映射成 canonical turns。
 * Flow: expose each chunk as a public URL → submit an async task → poll until done
 * → download the result JSON → map to canonical turns.
 */

const submitTaskResponseSchema = z
  .object({
    output: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
        task_id: z.string().min(1),
        task_status: z.string().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

const pollTaskResponseSchema = z
  .object({
    output: z
      .object({
        // qwen3-asr-flash-filetrans 单任务响应：SUCCEEDED 时结果在 output.result.transcription_url；
        // 保留 results 数组分支以兼容其他 DashScope 模型的响应形态。
        result: z
          .object({
            transcription_url: z.string().nullish(),
          })
          .passthrough()
          .nullish(),
        results: z
          .array(
            z
              .object({
                code: z.string().nullish(),
                message: z.string().nullish(),
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

const transcriptionResultSchema = z
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

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_POLL_TIMEOUT_MS = 1_500_000;

interface QwenAsrTaskParameters {
  channel_id: number[];
  diarization_enabled?: boolean;
  enable_itn: boolean;
  vocabulary?: Record<string, number>;
}

interface QwenAsrTaskInput {
  file_url: string;
  context?: { role: "user"; content: { type: "input_text"; text: string }[] }[];
}

interface QwenAsrMeetingTranscriptionDependencies {
  apiKey: string;
  baseUrl?: string;
  createAudioUrl: (chunk: FinalTranscriptionAudioChunk, signal: AbortSignal) => Promise<string>;
  deleteAudioUrl?: (url: string, signal: AbortSignal) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  model: string;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

function qwenAsrOrigin(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Qwen ASR base URL is not a valid URL");
  }
  return url.origin;
}

/**
 * 结果下载只允许阿里云托管的 HTTPS 地址（transcription_url 来自 DashScope 响应，
 * 是 aliyuncs.com 域下的签名 OSS 链接），避免任意内网地址外联。
 * Only fetch DashScope-signed result URLs hosted on Aliyun-controlled domains.
 */
function assertDashScopeResultUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
  }
  if (!parsed.hostname.endsWith(".aliyuncs.com")) {
    throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
  }
  return url;
}

export function createQwenAsrMeetingTranscriptionProvider(
  dependencies: QwenAsrMeetingTranscriptionDependencies,
): MeetingTranscriptionProvider {
  const fetch = dependencies.fetch ?? globalThis.fetch;
  const origin = qwenAsrOrigin(dependencies.baseUrl ?? "https://dashscope.aliyuncs.com");
  const pollIntervalMs = dependencies.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = dependencies.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  const authHeaders = () => ({
    Authorization: `Bearer ${dependencies.apiKey}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  });

  async function submitTask(input: {
    audioUrl: string;
    chunk: FinalTranscriptionAudioChunk;
    signal: AbortSignal;
    recognitionHints?: MeetingRecognitionHints;
  }): Promise<string> {
    const parameters: QwenAsrTaskParameters = {
      channel_id: [0],
      enable_itn: true,
    };
    if (
      dependencies.model.startsWith("qwen-audio-3.0-asr-flash-filetrans") &&
      (input.chunk.track === "system" || isMixedMeetingRecordingSource(input.chunk))
    ) {
      parameters.diarization_enabled = true;
    }
    const terms = dependencies.model.startsWith("qwen-audio-3.0-asr-flash-filetrans")
      ? [...new Set(input.recognitionHints?.terms.map((term) => term.trim()))]
          .filter((term) => term.length >= 2 && term.length <= 40)
          .slice(0, 50)
      : [];
    const taskInput: QwenAsrTaskInput = { file_url: input.audioUrl };
    // Vocabulary has stricter per-term limits than the conversation context.
    const hotwords = terms.filter((term) =>
      /\P{ASCII}/u.test(term) ? [...term].length <= 15 : term.split(/\s+/u).length <= 7,
    );
    if (hotwords.length) {
      parameters.vocabulary = Object.fromEntries(hotwords.map((term) => [term, 2]));
    }
    if (terms.length) {
      let contextText = "";
      for (const term of terms) {
        const next = contextText ? `${contextText}、${term}` : term;
        if (next.length <= 400) {
          contextText = next;
        }
      }
      taskInput.context = [{ content: [{ text: contextText, type: "input_text" }], role: "user" }];
    }
    const response = await fetch(`${origin}/api/v1/services/audio/asr/transcription`, {
      body: JSON.stringify({
        input: taskInput,
        model: dependencies.model,
        parameters,
      }),
      headers: authHeaders(),
      method: "POST",
      signal: input.signal,
    });
    if (response.status === 429) {
      throw new MeetingProviderQuotaError();
    }
    if (!response.ok) {
      throw new Error(`Qwen ASR task submission failed with HTTP ${response.status}`);
    }
    let parsed: z.infer<typeof submitTaskResponseSchema>;
    try {
      parsed = submitTaskResponseSchema.parse(await response.json());
    } catch {
      throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
    }
    return parsed.output.task_id;
  }

  async function pollTask(input: { signal: AbortSignal; taskId: string }): Promise<string | null> {
    const deadline = Date.now() + pollTimeoutMs;
    while (Date.now() < deadline) {
      const response = await fetch(`${origin}/api/v1/tasks/${input.taskId}`, {
        headers: authHeaders(),
        method: "GET",
        signal: input.signal,
      });
      if (response.status === 429) {
        throw new MeetingProviderQuotaError();
      }
      if (!response.ok) {
        throw new Error(`Qwen ASR task query failed with HTTP ${response.status}`);
      }
      let parsed: z.infer<typeof pollTaskResponseSchema>;
      try {
        parsed = pollTaskResponseSchema.parse(await response.json());
      } catch {
        throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
      }
      if (parsed.output.task_status === "SUCCEEDED") {
        const transcriptionUrl =
          parsed.output.result?.transcription_url ??
          (parsed.output.results ?? []).find((result) => result.subtask_status !== "FAILED")
            ?.transcription_url;
        if (!transcriptionUrl) {
          const failure = (parsed.output.results ?? []).find(
            (result) => result.subtask_status === "FAILED",
          );
          throw new MeetingProviderResponseError(
            "partial-result",
            `Qwen ASR ${failure?.code ?? "subtask"}`,
          );
        }
        return transcriptionUrl;
      }
      if (parsed.output.task_status === "FAILED" || parsed.output.task_status === "CANCELED") {
        if (parsed.output.code === "SUCCESS_WITH_NO_VALID_FRAGMENT") {
          return null;
        }
        throw new MeetingProviderResponseError(
          "partial-result",
          "Qwen ASR",
          [parsed.output.code, parsed.output.message].filter(Boolean).join(": "),
        );
      }
      await delay(pollIntervalMs, undefined, { signal: input.signal });
    }
    throw new Error(`Qwen ASR task ${input.taskId} timed out after ${pollTimeoutMs}ms`);
  }

  async function fetchResult(input: { signal: AbortSignal; url: string }) {
    const response = await fetch(`${assertDashScopeResultUrl(input.url)}`, {
      method: "GET",
      signal: input.signal,
    });
    if (!response.ok) {
      throw new Error(`Qwen ASR result download failed with HTTP ${response.status}`);
    }
    let parsed: z.infer<typeof transcriptionResultSchema>;
    try {
      parsed = transcriptionResultSchema.parse(await response.json());
    } catch {
      throw new MeetingProviderResponseError("malformed-response", "Qwen ASR");
    }
    return parsed;
  }

  return {
    // oxlint-disable-next-line complexity -- provider polling, response validation, and speaker mapping share one ordered transcript pass.
    async transcribeFinal(input): Promise<CanonicalMeetingTranscript> {
      if (!dependencies.apiKey.trim()) {
        throw new Error("ALIBABA_API_KEY is not set for Meeting transcription");
      }
      const turns: CanonicalMeetingTranscriptTurn[] = [];
      const remoteSpeakers = new Map<string, string>();
      const chunks = [...input.chunks].toSorted(
        (left, right) => left.startMs - right.startMs || left.track.localeCompare(right.track),
      );
      for (const chunk of chunks) {
        const signal = input.signal
          ? AbortSignal.any([input.signal, AbortSignal.timeout(pollTimeoutMs)])
          : AbortSignal.timeout(pollTimeoutMs);
        const audioUrl = await dependencies.createAudioUrl(chunk, signal);
        try {
          const taskId = await submitTask({
            audioUrl,
            chunk,
            recognitionHints: input.recognitionHints,
            signal,
          });
          const resultUrl = await pollTask({ signal, taskId });
          if (!resultUrl) {
            continue;
          }
          const result = await fetchResult({ signal, url: resultUrl });
          for (const transcript of result.transcripts ?? []) {
            for (const sentence of transcript.sentences ?? []) {
              const text = sentence.text.trim();
              if (!text) {
                continue;
              }
              const startMs = Math.max(chunk.startMs, chunk.startMs + sentence.begin_time);
              const endMs = Math.min(chunk.endMs, chunk.startMs + sentence.end_time);
              if (endMs <= startMs) {
                continue;
              }
              const local = chunk.track === "microphone";
              const candidate = chunk.track === "candidate";
              if (!(local || candidate)) {
                const identity = `${chunk.index}:${sentence.speaker_id ?? 0}`;
                if (!remoteSpeakers.has(identity)) {
                  remoteSpeakers.set(identity, `remote-${remoteSpeakers.size + 1}`);
                }
              }
              let speakerKey = "remote-1";
              let track: "local" | "remote" = "remote";
              if (local) {
                speakerKey = "local";
                track = "local";
              } else if (!candidate) {
                speakerKey =
                  remoteSpeakers.get(`${chunk.index}:${sentence.speaker_id ?? 0}`) ?? "remote-1";
              }
              const turn: CanonicalMeetingTranscriptTurn = {
                confidence: null,
                endMs,
                speakerKey,
                startMs,
                text,
                track,
              };
              if (candidate && chunk.speakerDisplayName) {
                turn.speakerDisplayName = chunk.speakerDisplayName;
              }
              turns.push(turn);
            }
          }
        } finally {
          if (dependencies.deleteAudioUrl) {
            try {
              await dependencies.deleteAudioUrl(audioUrl, signal);
            } catch {
              // 临时音频对象清理失败不阻断转录结果。
            }
          }
        }
      }
      turns.sort(
        (left, right) =>
          left.startMs - right.startMs ||
          left.track.localeCompare(right.track) ||
          left.endMs - right.endMs,
      );
      return canonicalMeetingTranscriptSchema.parse({ language: input.languageHint, turns });
    },
  };
}
