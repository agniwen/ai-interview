// oxlint-disable promise/avoid-new -- Node ws exposes readiness only through event callbacks.
import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue } from "@app/db-schema/json";
import { WebSocket } from "ws";
import { z } from "zod";
import { transcriptContext } from "./transcript-context";
import { createLiveTranscriptAudio } from "./live-transcript-audio";

const MAX_BUFFERED_BYTES = 256 * 1024;
const LOW_WATER_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;
const DRAIN_POLL_MS = 50;
const GRACEFUL_FINISH_TIMEOUT_MS = 1500;

export interface DashScopeRealtimeWsConnection {
  close: () => void;
  peekCorrectionAudio?: (itemId: string, originalText: string) => Buffer | null;
  peekRecentCorrectionAudio?: (durationMs: number) => Buffer | null;
  takeCorrectionAudio?: (itemId: string, originalText: string) => Buffer | null;
  sendCorrectionContext?: (updates: { key: string; text: string | null }[]) => void;
  /** Returns false above the WebSocket high-water mark so the renderer's draft queue owns backpressure. */
  sendPcm: (bytes: Uint8Array) => boolean;
}

export interface DashScopeRealtimeWsDependencies {
  baseUrl: string;
  context?: string[];
  language?: string;
  model: string;
  onClose?: (reason: string) => void;
  onDrain?: () => void;
  onEvent?: (event: JsonValue) => void;
  speechNoiseThreshold?: number;
  token: string;
  vocabulary?: Record<string, number>;
  webSocket?: RealtimeWebSocketConstructor;
}

interface DashScopeStreamingParameters extends JsonObject {
  format: string;
  heartbeat: boolean;
  language_hints?: string[];
  max_sentence_silence: number;
  multi_threshold_mode_enabled: boolean;
  sample_rate: number;
  semantic_punctuation_enabled: boolean;
  speech_noise_threshold?: number;
  vocabulary?: Record<string, number>;
}

interface DashScopeStreamingTaskInput extends JsonObject {
  context?: ReturnType<typeof transcriptContext>;
}

interface RealtimeWebSocket {
  bufferedAmount: number;
  close: () => void;
  on<K extends keyof RealtimeWebSocketEventMap>(
    event: K,
    callback: (...args: RealtimeWebSocketEventMap[K]) => void,
  ): RealtimeWebSocket;
  readyState: number;
  send: (data: string | Uint8Array, callback?: (error?: Error) => void) => void;
  terminate: () => void;
  url: string;
}

interface RealtimeWebSocketEventMap {
  close: [code: number, reason: Buffer];
  error: [error: { message?: string }];
  message: [data: Buffer | string, isBinary: boolean];
  open: [];
}

interface RealtimeWebSocketConstructor {
  new (
    url: string,
    options: { handshakeTimeout: number; headers: { Authorization: string } },
  ): RealtimeWebSocket;
  OPEN: number;
}

function pcmBytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
}

const streamingEventSchema = z.object({
  header: z.object({ event: z.string(), task_id: z.string() }),
  payload: z
    .object({
      output: z
        .object({
          sentence: z
            .object({
              begin_time: z.number().int().nonnegative(),
              end_time: z.number().int().nonnegative().nullable().optional(),
              heartbeat: z.boolean().optional(),
              sentence_end: z.boolean().optional(),
              sentence_id: z.number().int().nonnegative(),
              text: z.string().max(10_000),
              words: z
                .array(
                  z.object({
                    begin_time: z.number().int().nonnegative(),
                    end_time: z.number().int().nonnegative(),
                    punctuation: z.string().max(16).optional(),
                    text: z.string().min(1).max(256),
                  }),
                )
                .max(2000)
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

/**
 * 主进程直连 DashScope Qwen-ASR-Realtime：只有 Node WebSocket 能在握手时携带
 * Authorization 头，短期 temp token 由 Backend 签发，长期 ALIBABA_API_KEY 不进入桌面。
 * Connects to DashScope Qwen-ASR-Realtime from the main process so the handshake can
 * carry the Authorization header with a backend-issued temp token.
 */
export function connectDashScopeRealtimeWs(
  dependencies: DashScopeRealtimeWsDependencies,
): DashScopeRealtimeWsConnection {
  const WebSocketImpl = dependencies.webSocket ?? WebSocket;
  const streaming = dependencies.model.startsWith("qwen-audio-3.0-asr-flash-streaming");
  const taskId = randomUUID();
  const socket = new WebSocketImpl(
    streaming
      ? dependencies.baseUrl
      : `${dependencies.baseUrl}?model=${encodeURIComponent(dependencies.model)}`,
    {
      handshakeTimeout: CONNECTION_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${dependencies.token}` },
    },
  );
  let closed = false;
  let taskStarted = !streaming;
  let backpressureStartedAt: number | null = null;
  let bufferedBytesAtPause = 0;
  let backpressured = false;
  let drainCount = 0;
  let finishSent = false;
  let sendCallbackErrorCount = 0;
  let drainTimer: ReturnType<typeof setInterval> | null = null;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const stableContext = dependencies.context?.filter((text) => text.trim()).slice(0, 1) ?? [];
  let recentContext: { key: string; text: string }[] = [];
  const correction = streaming ? createLiveTranscriptAudio() : null;

  const notifyClose = (reason: string) => {
    if (closed) {
      return;
    }
    closed = true;
    correction?.close();
    if (drainTimer) {
      clearInterval(drainTimer);
      drainTimer = null;
    }
    if (reason !== "closed-by-client") {
      clearTimeout(finishTimer);
      socket.terminate();
    }
    dependencies.onClose?.(reason);
  };

  // ws 的 send 在 readyState 检查与真正写入之间若连接被关闭会同步抛异常；
  // 异常不能从 ipcMain 的 port 消息处理器冒出去（会打崩主进程、连累分片 ack）。
  // ws send can throw synchronously when the socket closes between the readyState
  // check and the write; it must never escape into the IPC port handler.
  const sendText = (payload: string | Uint8Array): boolean => {
    try {
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- ws exposes write completion only through this callback.
      socket.send(payload, (error) => {
        if (error) {
          sendCallbackErrorCount += 1;
          console.error("[live-transcript] provider send callback failed", {
            count: sendCallbackErrorCount,
            model: dependencies.model,
          });
          notifyClose(`provider-error:${error.message ?? "write-failed"}`);
        }
      });
      return true;
    } catch {
      return false;
    }
  };
  function sendJson(payload: JsonValue): boolean {
    return sendText(JSON.stringify(payload));
  }

  const sendStreamingContext = (updates: { key: string; text: string | null }[]) => {
    if (closed || !taskStarted) {
      return;
    }
    for (const update of updates) {
      recentContext = recentContext.filter((entry) => entry.key !== update.key);
      if (update.text?.trim()) {
        recentContext.push({ key: update.key, text: update.text });
      }
    }
    recentContext = recentContext.slice(-4);
    sendJson({
      header: { action: "continue-task", streaming: "duplex", task_id: taskId },
      payload: {
        input: {
          context: transcriptContext([
            ...stableContext,
            ...recentContext.map((entry) => entry.text),
          ]),
        },
      },
    });
  };

  const scheduleDrainPoll = () => {
    if (closed || !backpressured || drainTimer) {
      return;
    }
    drainTimer = setTimeout(() => {
      drainTimer = null;
      if (closed || socket.readyState !== WebSocketImpl.OPEN) {
        return;
      }
      if (socket.bufferedAmount <= LOW_WATER_BYTES) {
        backpressured = false;
        drainCount += 1;
        console.info("[live-transcript] provider backpressure recovered", {
          bufferedBytesAtPause,
          drainCount,
          durationMs:
            backpressureStartedAt === null ? 0 : Math.max(0, Date.now() - backpressureStartedAt),
          model: dependencies.model,
        });
        backpressureStartedAt = null;
        bufferedBytesAtPause = 0;
        dependencies.onDrain?.();
        return;
      }
      scheduleDrainPoll();
    }, DRAIN_POLL_MS);
    drainTimer.unref();
  };

  socket.on("open", () => {
    if (closed) {
      return;
    }
    console.info("[live-transcript] ws handshake ok", {
      model: dependencies.model,
      url: socket.url,
    });
    if (streaming) {
      const parameters: DashScopeStreamingParameters = {
        format: "pcm",
        heartbeat: true,
        max_sentence_silence: 800,
        multi_threshold_mode_enabled: true,
        sample_rate: 16_000,
        semantic_punctuation_enabled: false,
      };
      if (dependencies.speechNoiseThreshold !== undefined) {
        parameters.speech_noise_threshold = dependencies.speechNoiseThreshold;
      }
      if (dependencies.vocabulary && Object.keys(dependencies.vocabulary).length > 0) {
        parameters.vocabulary = dependencies.vocabulary;
      }
      if (dependencies.language) {
        parameters.language_hints = [dependencies.language];
      }
      const taskInput: DashScopeStreamingTaskInput = {};
      if (dependencies.context?.length) {
        taskInput.context = transcriptContext(dependencies.context);
      }
      if (
        !sendJson({
          header: { action: "run-task", streaming: "duplex", task_id: taskId },
          payload: {
            function: "recognition",
            input: taskInput,
            model: dependencies.model,
            parameters,
            task: "asr",
            task_group: "audio",
          },
        })
      ) {
        notifyClose("provider-error:start-failed");
      }
      return;
    }
    const baseSession = {
      input_audio_format: "pcm",
      sample_rate: 16_000,
      turn_detection: {
        silence_duration_ms: 400,
        threshold: 0,
        type: "server_vad",
      },
    };
    const session = dependencies.language
      ? { ...baseSession, input_audio_transcription: { language: dependencies.language } }
      : baseSession;
    sendJson({ event_id: randomUUID(), session, type: "session.update" });
  });

  // oxlint-disable-next-line complexity -- DashScope exposes one tagged event stream; keeping dispatch in one guarded function makes terminal handling explicit.
  const handleStreamingEvent = (event: JsonValue) => {
    const parsed = streamingEventSchema.safeParse(event);
    if (!parsed.success || parsed.data.header.task_id !== taskId) {
      return;
    }
    const { header, payload } = parsed.data;
    if (header.event === "task-started") {
      taskStarted = true;
      dependencies.onEvent?.({ type: "session.created" });
      dependencies.onDrain?.();
    } else if (header.event === "task-failed") {
      notifyClose("provider-error:task-failed");
    } else if (header.event === "task-finished") {
      notifyClose("provider-disconnected:task-finished");
    } else if (header.event === "result-generated") {
      const sentence = payload?.output?.sentence;
      if (!sentence || sentence.heartbeat || !sentence.text.trim()) {
        return;
      }
      const itemId = String(sentence.sentence_id);
      if (sentence.sentence_end && sentence.end_time !== null && sentence.end_time !== undefined) {
        correction?.complete({
          endMs: sentence.end_time,
          itemId,
          startMs: sentence.begin_time,
          text: sentence.text,
        });
      }
      dependencies.onEvent?.(
        sentence.sentence_end
          ? {
              end_ms: sentence.end_time,
              item_id: itemId,
              start_ms: sentence.begin_time,
              transcript: sentence.text,
              type: "conversation.item.input_audio_transcription.completed",
              words: (sentence.words ?? []).map((word) => ({
                end_ms: word.end_time,
                punctuation: word.punctuation ?? "",
                start_ms: word.begin_time,
                text: word.text,
              })),
            }
          : {
              item_id: itemId,
              text: sentence.text,
              type: "conversation.item.input_audio_transcription.text",
            },
      );
      if (sentence.sentence_end) {
        sendStreamingContext([{ key: `item:${itemId}`, text: sentence.text }]);
      }
    }
  };

  socket.on("message", (data: Buffer | string, isBinary: boolean) => {
    if (isBinary || closed) {
      return;
    }
    try {
      const providerEvent = z.json().safeParse(JSON.parse(data.toString()));
      if (providerEvent.success && streaming) {
        handleStreamingEvent(providerEvent.data);
      } else if (providerEvent.success) {
        dependencies.onEvent?.(providerEvent.data);
      }
    } catch {
      // Ignore malformed provider events without failing the sidecar.
    }
  });

  socket.on("error", (error: { message?: string }) => {
    notifyClose(`provider-error:${error.message ?? "unknown"}`);
  });

  socket.on("close", (code: number, reason: Buffer) => {
    const detail = reason.toString().trim();
    notifyClose(detail ? `provider-disconnected:${detail}` : `provider-disconnected:${code}`);
  });

  return {
    close: () => {
      if (closed) {
        return;
      }
      if (socket.readyState === WebSocketImpl.OPEN && !finishSent) {
        finishSent = true;
        const finish = streaming
          ? {
              header: { action: "finish-task", streaming: "duplex", task_id: taskId },
              payload: { input: {} },
            }
          : { event_id: randomUUID(), type: "session.finish" };
        if (sendJson(finish)) {
          finishTimer = setTimeout(() => {
            if (drainTimer) {
              clearInterval(drainTimer);
              drainTimer = null;
            }
            closed = true;
            socket.terminate();
          }, GRACEFUL_FINISH_TIMEOUT_MS);
          finishTimer.unref();
        } else {
          socket.terminate();
        }
      } else if (socket.readyState !== WebSocketImpl.OPEN) {
        socket.terminate();
      }
      notifyClose("closed-by-client");
    },
    peekCorrectionAudio: streaming ? correction?.peek : undefined,
    peekRecentCorrectionAudio: streaming ? correction?.peekRecent : undefined,
    sendCorrectionContext: streaming ? (texts) => sendStreamingContext(texts) : undefined,
    sendPcm: (bytes) => {
      if (closed || !taskStarted || socket.readyState !== WebSocketImpl.OPEN) {
        return false;
      }
      const payload = streaming
        ? bytes
        : JSON.stringify({
            audio: pcmBytesToBase64(bytes),
            event_id: randomUUID(),
            type: "input_audio_buffer.append",
          });
      const payloadBytes = Buffer.byteLength(payload);
      if (socket.bufferedAmount + payloadBytes > MAX_BUFFERED_BYTES) {
        if (!backpressured) {
          backpressured = true;
          backpressureStartedAt = Date.now();
          bufferedBytesAtPause = socket.bufferedAmount;
          console.warn("[live-transcript] provider backpressure started", {
            bufferedBytes: socket.bufferedAmount,
            model: dependencies.model,
            payloadBytes,
          });
        }
        scheduleDrainPoll();
        return false;
      }
      const accepted = sendText(payload);
      if (accepted) {
        correction?.appendPcm(bytes);
      }
      return accepted;
    },
    takeCorrectionAudio: correction ? correction.take : undefined,
  };
}
