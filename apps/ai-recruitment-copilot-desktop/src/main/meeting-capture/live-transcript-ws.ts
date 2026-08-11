// oxlint-disable promise/avoid-new -- Node ws exposes readiness only through event callbacks.
import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const MAX_BUFFERED_BYTES = 256 * 1024;
const LOW_WATER_BYTES = 64 * 1024;
const CONNECTION_TIMEOUT_MS = 10_000;
const DRAIN_POLL_MS = 250;
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
  onEvent?: (event: unknown) => void;
  token: string;
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
  const socket = new WebSocket(
    `${dependencies.baseUrl}?model=${encodeURIComponent(dependencies.model)}`,
    {
      handshakeTimeout: CONNECTION_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${dependencies.token}` },
    },
  );
  let closed = false;
  let aboveLowWater = false;
  let finishSent = false;
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
  const sendJson = (payload: unknown): boolean => {
    try {
      socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  };

  socket.on("open", () => {
    if (closed) {
      return;
    }
    console.info("[live-transcript] ws handshake ok", {
      model: dependencies.model,
      url: socket.url,
    });
    const session: Record<string, unknown> = {
      input_audio_format: "pcm",
      sample_rate: 16_000,
      turn_detection: {
        silence_duration_ms: 400,
        threshold: 0,
        type: "server_vad",
      },
    };
    if (dependencies.language) {
      session.input_audio_transcription = { language: dependencies.language };
    }
    sendJson({ event_id: randomUUID(), session, type: "session.update" });
  });

  socket.on("message", (data, isBinary) => {
    if (isBinary) {
      return;
    }
    try {
      dependencies.onEvent?.(JSON.parse(data.toString()) as unknown);
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

  // Node ws has no bufferedamountlow event; poll the socket buffer and emit an
  // edge-triggered drain so the renderer resumes flushing its bounded queue.
  const drainTimerHandle = setInterval(() => {
    if (closed || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const buffered = socket.bufferedAmount;
    const wasAbove = aboveLowWater;
    aboveLowWater = buffered > LOW_WATER_BYTES;
    if (wasAbove && !aboveLowWater) {
      dependencies.onDrain?.();
    }
  }, DRAIN_POLL_MS);
  drainTimer = drainTimerHandle;

  return {
    close: () => {
      if (closed) {
        return;
      }
      if (socket.readyState === WebSocket.OPEN && !finishSent) {
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
      if (closed || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      if (socket.bufferedAmount + bytes.length > MAX_BUFFERED_BYTES) {
        return false;
      }
      return sendJson({
        audio: pcmBytesToBase64(bytes),
        event_id: randomUUID(),
        type: "input_audio_buffer.append",
      });
    },
  };
}
