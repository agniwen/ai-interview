import { liveCorrectionEventSchema } from "@arc/shared/meeting-live-correction";
import type { LiveCorrectionEvent } from "@arc/shared/meeting-live-correction";
// oxlint-disable promise/avoid-new -- The IPC handshake is confirmed by the first provider event.
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import { z } from "zod";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";

const WORKLET_SAMPLE_RATE = 24_000;
const DASHSCOPE_SAMPLE_RATE = 16_000;
const MAX_INFLIGHT_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;

const dashScopeServerEventSchema = z.object({
  end_ms: z.number().int().nonnegative().optional(),
  item_id: z.string().optional(),
  model: z.string().optional(),
  original_text: z.string().optional(),
  start_ms: z.number().int().nonnegative().optional(),
  stash: z.string().optional(),
  status: z.string().optional(),
  text: z.string().optional(),
  transcript: z.string().optional(),
  type: z.string().optional(),
  words: z
    .array(
      z.object({
        end_ms: z.number().int().nonnegative(),
        punctuation: z.string().max(16),
        start_ms: z.number().int().nonnegative(),
        text: z.string().min(1).max(256),
      }),
    )
    .max(2000)
    .optional(),
});
type DashScopeServerEvent = z.infer<typeof dashScopeServerEventSchema>;
const portMessageSchema = z.object({
  byteLength: z.number().optional(),
  event: dashScopeServerEventSchema.optional(),
  reason: z.string().optional(),
  type: z.string().optional(),
});

/**
 * 主进程 AudioWorklet 以 24k 输出（OpenAI WebRTC 的既有格式），qwen 需要 16k；
 * 在渲染进程做线性重采样，不动共用的 worklet。
 * The shared AudioWorklet outputs 24k (the OpenAI format); Qwen needs 16k, so the
 * transport resamples linearly without touching the shared worklet.
 */
function resamplePcm16(input: Int16Array, fromRate: number, toRate: number): Int16Array {
  const ratio = fromRate / toRate;
  const outputLength = Math.round(input.length / ratio);
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const source = index * ratio;
    const sourceIndex = Math.floor(source);
    const fraction = source - sourceIndex;
    const left = input[sourceIndex] ?? 0;
    const right = input[Math.min(sourceIndex + 1, input.length - 1)] ?? left;
    output[index] = Math.round(left + (right - left) * fraction);
  }
  return output;
}

function completedTranscriptEvent(event: DashScopeServerEvent): LiveTranscriptEvent | null {
  if (!(event.item_id && event.transcript)) {
    return null;
  }
  const transcript: LiveTranscriptEvent = {
    itemId: event.item_id,
    text: event.transcript,
    type: "completed",
  };
  if (event.end_ms !== undefined) {
    transcript.endMs = event.end_ms;
  }
  if (event.start_ms !== undefined) {
    transcript.startMs = event.start_ms;
  }
  if (event.words) {
    transcript.words = event.words.map((word) => ({
      endMs: word.end_ms,
      punctuation: word.punctuation,
      startMs: word.start_ms,
      text: word.text,
    }));
  }
  return transcript;
}

function handleDashScopeEvent(
  event: DashScopeServerEvent,
  input: {
    onDisconnect: (reason: string) => void;
    onTranscript: (event: LiveTranscriptEvent) => void;
  },
): void {
  if (event.type === "meeting.transcription.correction-status") {
    if (
      event.item_id &&
      event.original_text &&
      (event.status === "started" || event.status === "finished")
    ) {
      input.onTranscript({
        itemId: event.item_id,
        originalText: event.original_text,
        text: "",
        type: event.status === "started" ? "correction-started" : "correction-finished",
      });
    }
    return;
  }
  if (event.type === "meeting.transcription.corrected") {
    if (event.item_id && event.model && event.original_text && event.transcript?.trim()) {
      input.onTranscript({
        correctionModel: event.model,
        itemId: event.item_id,
        originalText: event.original_text,
        text: event.transcript,
        type: "corrected",
      });
    }
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.text") {
    if (event.item_id) {
      const text = [event.text, event.stash].filter((part) => part !== undefined).join("");
      input.onTranscript({ itemId: event.item_id, text, type: "snapshot" });
    }
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const transcript = completedTranscriptEvent(event);
    if (transcript) {
      input.onTranscript(transcript);
    }
    return;
  }
  if (event.type === "error") {
    console.error("[meeting-capture-renderer] DashScope error event", { event });
    input.onDisconnect("provider-disconnected");
    return;
  }
  if (event.type === "session.finished") {
    console.info("[meeting-capture-renderer] DashScope session finished");
    input.onDisconnect("provider-disconnected");
  }
}

/**
 * 通过 preload 转发到主进程的 MessagePort 直连 DashScope Qwen-ASR-Realtime；
 * 主进程持有 temp token，业务 Backend 不代理实时 PCM。
 * Bridges the draft to the main-process DashScope WebSocket over a MessagePort;
 * only the short-lived temp token crosses into the desktop.
 */
export async function connectQwenRealtimeTranscription(input: {
  authorization: MeetingLiveTranscriptAuthorization;
  captureId: string;
  sectionId: string;
  onCorrection: (event: LiveCorrectionEvent) => void;
  onDisconnect: (reason: string) => void;
  onTranscript: (event: LiveTranscriptEvent) => void;
  onWritable: () => void;
}): Promise<LiveTranscriptConnection> {
  const { port1: clientPort, port2: serverPort } = new MessageChannel();
  let inFlightBytes = 0;
  let backpressured = false;
  let blockedFrameBytes = 0;
  let closing = false;
  let peakInFlightBytes = 0;
  let providerWritable = true;
  let renewTimer: ReturnType<typeof setTimeout> | undefined;
  const disconnect = (reason: string) => {
    clearTimeout(renewTimer);
    if (!closing) {
      input.onDisconnect(reason);
    }
  };
  const resumeIfWritable = () => {
    if (
      backpressured &&
      providerWritable &&
      inFlightBytes + blockedFrameBytes <= MAX_INFLIGHT_BYTES
    ) {
      backpressured = false;
      blockedFrameBytes = 0;
      console.info("[meeting-capture-renderer] Qwen IPC backpressure recovered", {
        inFlightBytes,
        peakInFlightBytes,
      });
      input.onWritable();
    }
  };

  const opened = new Promise<void>((resolve, reject) => {
    let handler: ((event: MessageEvent) => void) | null = null;
    const cleanup = () => {
      if (handler) {
        clientPort.removeEventListener("message", handler);
        handler = null;
      }
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("DashScope 实时字幕连接超时"));
    }, CONNECTION_TIMEOUT_MS);
    handler = (event: MessageEvent) => {
      const parsedMessage = portMessageSchema.safeParse(event.data);
      if (!parsedMessage.success) {
        return;
      }
      const message = parsedMessage.data;
      if (
        message?.type === "event" &&
        (message.event?.type === "session.created" || message.event?.type === "session.updated")
      ) {
        clearTimeout(timeout);
        cleanup();
        resolve();
        return;
      }
      if (message?.type === "close") {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(message.reason ?? "provider-disconnected"));
      }
    };
    clientPort.addEventListener("message", handler);
  });

  clientPort.addEventListener("message", (event: MessageEvent) => {
    const correction = z
      .object({ event: liveCorrectionEventSchema, type: z.literal("event") })
      .safeParse(event.data);
    if (correction.success && !closing) {
      input.onCorrection(correction.data.event);
      return;
    }
    const parsedMessage = portMessageSchema.safeParse(event.data);
    if (!parsedMessage.success || closing) {
      return;
    }
    const message = parsedMessage.data;
    if (message.type === "event" && message.event) {
      handleDashScopeEvent(message.event, {
        onDisconnect: disconnect,
        onTranscript: input.onTranscript,
      });
      return;
    }
    if (
      message.type === "pcm-ack" &&
      message.byteLength !== undefined &&
      Number.isSafeInteger(message.byteLength) &&
      message.byteLength > 0
    ) {
      inFlightBytes = Math.max(0, inFlightBytes - message.byteLength);
      resumeIfWritable();
      return;
    }
    if (message.type === "backpressure") {
      providerWritable = false;
      return;
    }
    if (message.type === "drain") {
      providerWritable = true;
      resumeIfWritable();
      return;
    }
    if (message.type === "close") {
      disconnect(message.reason ?? "provider-disconnected");
    }
  });
  clientPort.addEventListener("close", () => disconnect("provider-disconnected"));
  clientPort.start();
  window.postMessage(
    {
      authorization: {
        ...input.authorization,
        captureId: input.captureId,
        sectionId: input.sectionId,
      },
      type: "start-meeting-live-transcript-client",
    },
    "*",
    [serverPort],
  );

  try {
    await opened;
  } catch (error) {
    closing = true;
    clientPort.close();
    throw error;
  }
  input.onWritable();

  // The WebSocket may outlive its temporary key, but correction HTTP calls cannot.
  // Rotate via the existing track reconnect path before the key expires.
  const expiresInMs = Date.parse(input.authorization.expiresAt) - Date.now();
  if (Number.isFinite(expiresInMs)) {
    renewTimer = setTimeout(
      () => disconnect("authorization-expiring"),
      Math.max(1000, expiresInMs - 30_000),
    );
  }

  return {
    close: () => {
      closing = true;
      clearTimeout(renewTimer);
      clientPort.postMessage({ type: "close" }, []);
      clientPort.close();
    },
    correct: input.authorization.model.startsWith("qwen-audio-3.0-asr-flash-streaming")
      ? (batch) => {
          if (closing) {
            return false;
          }
          try {
            clientPort.postMessage({ batch, type: "correct" }, []);
            return true;
          } catch {
            // Correction is best effort; a closed port must not interrupt recording.
            return false;
          }
        }
      : undefined,
    sendPcm: (frame) => {
      if (closing) {
        return false;
      }
      const resampled = resamplePcm16(frame, WORKLET_SAMPLE_RATE, DASHSCOPE_SAMPLE_RATE);
      const bytes = new Uint8Array(resampled.buffer, resampled.byteOffset, resampled.byteLength);
      const { byteLength } = bytes;
      if (!providerWritable || inFlightBytes + byteLength > MAX_INFLIGHT_BYTES) {
        if (!backpressured) {
          console.warn("[meeting-capture-renderer] Qwen IPC backpressure started", {
            inFlightBytes,
            peakInFlightBytes,
            providerWritable,
          });
        }
        backpressured = true;
        blockedFrameBytes = byteLength;
        return false;
      }
      try {
        clientPort.postMessage({ bytes, type: "pcm" }, []);
        inFlightBytes += byteLength;
        peakInFlightBytes = Math.max(peakInFlightBytes, inFlightBytes);
        return true;
      } catch {
        return false;
      }
    },
  };
}
