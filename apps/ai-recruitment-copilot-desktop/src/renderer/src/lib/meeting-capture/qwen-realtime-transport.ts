// oxlint-disable promise/avoid-new -- The IPC handshake is confirmed by the first provider event.
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";

const WORKLET_SAMPLE_RATE = 24_000;
const DASHSCOPE_SAMPLE_RATE = 16_000;
const MAX_INFLIGHT_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;

interface DashScopeServerEvent {
  item_id?: unknown;
  text?: unknown;
  transcript?: unknown;
  stash?: unknown;
  type?: unknown;
}

interface PortMessage {
  byteLength?: number;
  event?: DashScopeServerEvent;
  reason?: string;
  type?: string;
}

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

function handleDashScopeEvent(
  event: DashScopeServerEvent,
  input: {
    onDisconnect: (reason: string) => void;
    onTranscript: (event: LiveTranscriptEvent) => void;
  },
): void {
  if (event.type === "conversation.item.input_audio_transcription.text") {
    if (typeof event.item_id === "string") {
      const text = [event.text, event.stash].filter((part) => typeof part === "string").join("");
      input.onTranscript({ itemId: event.item_id, text, type: "snapshot" });
    }
    return;
  }
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    if (typeof event.item_id === "string" && typeof event.transcript === "string") {
      input.onTranscript({ itemId: event.item_id, text: event.transcript, type: "completed" });
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
  const disconnect = (reason: string) => {
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
    let handler: ((event: MessageEvent<PortMessage>) => void) | null = null;
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
    handler = (event: MessageEvent<PortMessage>) => {
      const message = event.data;
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

  clientPort.addEventListener("message", (event: MessageEvent<PortMessage>) => {
    const message = event.data;
    if (!message || closing) {
      return;
    }
    if (message.type === "event" && message.event) {
      handleDashScopeEvent(message.event, {
        onDisconnect: disconnect,
        onTranscript: input.onTranscript,
      });
      return;
    }
    if (
      message.type === "pcm-ack" &&
      typeof message.byteLength === "number" &&
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
      authorization: input.authorization,
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

  return {
    close: () => {
      closing = true;
      clientPort.postMessage({ type: "close" }, []);
      clientPort.close();
    },
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
