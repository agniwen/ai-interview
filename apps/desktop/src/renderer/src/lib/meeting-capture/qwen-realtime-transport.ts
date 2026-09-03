import { liveCorrectionEventSchema } from "@app/shared/meeting-live-correction";
import type { LiveCorrectionEvent } from "@app/shared/meeting-live-correction";
import {
  DASHSCOPE_SAMPLE_RATE,
  WORKLET_SAMPLE_RATE,
  dashScopeServerEventSchema,
  handleDashScopeEvent,
  resamplePcm16,
} from "@app/meeting-live-transcript/qwen-events";
// oxlint-disable promise/avoid-new -- The IPC handshake is confirmed by the first provider event.
import type { MeetingLiveTranscriptAuthorization } from "@app/shared/meeting-transcription";
import { z } from "zod";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";

const MAX_INFLIGHT_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;

const portMessageSchema = z.object({
  byteLength: z.number().optional(),
  event: dashScopeServerEventSchema.optional(),
  reason: z.string().optional(),
  type: z.string().optional(),
});

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
