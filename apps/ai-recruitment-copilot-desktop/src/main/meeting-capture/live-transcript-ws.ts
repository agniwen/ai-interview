// oxlint-disable promise/avoid-new -- Node ws exposes readiness only through event callbacks.
import { randomUUID } from "node:crypto";
import type { JsonValue } from "@arc/db-schema/json";
import { WebSocket } from "ws";
import { z } from "zod";

const MAX_BUFFERED_BYTES = 256 * 1024;
const LOW_WATER_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;
const DRAIN_POLL_MS = 50;
const GRACEFUL_FINISH_TIMEOUT_MS = 1500;

export interface DashScopeRealtimeWsConnection {
  close: () => void;
  /** Returns false above the WebSocket high-water mark so the renderer's draft queue owns backpressure. */
  sendPcm: (bytes: Uint8Array) => boolean;
}

export interface DashScopeRealtimeWsDependencies {
  baseUrl: string;
  language?: string;
  model: string;
  onClose?: (reason: string) => void;
  onDrain?: () => void;
  onEvent?: (event: JsonValue) => void;
  token: string;
  webSocket?: RealtimeWebSocketConstructor;
}

interface RealtimeWebSocket {
  bufferedAmount: number;
  close: () => void;
  on<K extends keyof RealtimeWebSocketEventMap>(
    event: K,
    callback: (...args: RealtimeWebSocketEventMap[K]) => void,
  ): RealtimeWebSocket;
  readyState: number;
  send: (data: string, callback?: (error?: Error) => void) => void;
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
  const socket = new WebSocketImpl(
    `${dependencies.baseUrl}?model=${encodeURIComponent(dependencies.model)}`,
    {
      handshakeTimeout: CONNECTION_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${dependencies.token}` },
    },
  );
  let closed = false;
  let backpressureStartedAt: number | null = null;
  let bufferedBytesAtPause = 0;
  let backpressured = false;
  let drainCount = 0;
  let finishSent = false;
  let sendCallbackErrorCount = 0;
  let drainTimer: ReturnType<typeof setInterval> | null = null;

  const notifyClose = (reason: string) => {
    if (closed) {
      return;
    }
    closed = true;
    if (drainTimer) {
      clearInterval(drainTimer);
      drainTimer = null;
    }
    dependencies.onClose?.(reason);
  };

  // ws 的 send 在 readyState 检查与真正写入之间若连接被关闭会同步抛异常；
  // 异常不能从 ipcMain 的 port 消息处理器冒出去（会打崩主进程、连累分片 ack）。
  // ws send can throw synchronously when the socket closes between the readyState
  // check and the write; it must never escape into the IPC port handler.
  const sendText = (payload: string): boolean => {
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
  const sendJson = (payload: JsonValue): boolean => sendText(JSON.stringify(payload));

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

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      return;
    }
    try {
      const providerEvent = z.json().safeParse(JSON.parse(data.toString()));
      if (providerEvent.success) {
        dependencies.onEvent?.(providerEvent.data);
      }
    } catch {
      // Ignore malformed provider events without failing the sidecar.
    }
  });

  socket.on("error", (error) => {
    notifyClose(`provider-error:${error.message ?? "unknown"}`);
  });

  socket.on("close", (code, reason) => {
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
        if (sendJson({ event_id: randomUUID(), type: "session.finish" })) {
          const timer = setTimeout(() => {
            if (drainTimer) {
              clearInterval(drainTimer);
              drainTimer = null;
            }
            closed = true;
            socket.terminate();
          }, GRACEFUL_FINISH_TIMEOUT_MS);
          timer.unref();
        } else {
          socket.terminate();
        }
      }
      notifyClose("closed-by-client");
    },
    sendPcm: (bytes) => {
      if (closed || socket.readyState !== WebSocketImpl.OPEN) {
        return false;
      }
      const payload = JSON.stringify({
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
      return sendText(payload);
    },
  };
}
