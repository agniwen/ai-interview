import { ipcMain } from "electron";
import type { IpcMainEvent } from "electron";
import { isTrustedMainFrame } from "./ipc";
import { connectDashScopeRealtimeWs } from "./live-transcript-ws";
import type { DashScopeRealtimeWsConnection } from "./live-transcript-ws";

const TOKEN_MAX_LENGTH = 4096;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const EXPIRES_AT_MAX_LENGTH = 64;

interface RendererAuthorization {
  baseUrl?: unknown;
  clientSecret?: unknown;
  expiresAt?: unknown;
  language?: unknown;
  model?: unknown;
  provider?: unknown;
  track?: unknown;
}

function isWssAliyunUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === "wss:" &&
      url.hostname.endsWith(".aliyuncs.com") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isLiveTranscriptAuthorization(value: unknown): value is RendererAuthorization {
  if (!(value && typeof value === "object")) {
    return false;
  }
  const authorization = value as RendererAuthorization;
  return (
    authorization.provider === "qwen" &&
    typeof authorization.clientSecret === "string" &&
    authorization.clientSecret.length > 0 &&
    authorization.clientSecret.length <= TOKEN_MAX_LENGTH &&
    typeof authorization.model === "string" &&
    authorization.model.length <= 128 &&
    MODEL_PATTERN.test(authorization.model) &&
    typeof authorization.expiresAt === "string" &&
    authorization.expiresAt.length <= EXPIRES_AT_MAX_LENGTH &&
    !Number.isNaN(Date.parse(authorization.expiresAt)) &&
    (authorization.track === "microphone" || authorization.track === "system") &&
    (authorization.language === undefined || typeof authorization.language === "string") &&
    isWssAliyunUrl(authorization.baseUrl)
  );
}

interface PcmFrameMessage {
  bytes?: Uint8Array;
  type?: string;
}

function isPcmFrame(data: unknown): data is PcmFrameMessage & { bytes: Uint8Array } {
  if (!(data && typeof data === "object")) {
    return false;
  }
  const message = data as PcmFrameMessage;
  return (
    message.type === "pcm" && message.bytes instanceof Uint8Array && message.bytes.byteLength > 0
  );
}

function isCloseMessage(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && (data as { type?: unknown }).type === "close");
}

/**
 * Live-transcript 传输通道：渲染进程用 MessagePort 把 16k PCM 帧交给主进程，
 * 由主进程以 temp token 直连 DashScope；结果事件与背压 drain 沿同一端口回传。
 * Renderer hands 16k PCM frames to the main process over a MessagePort; the main
 * process connects to DashScope with the temp token and relays events and drain acks back.
 */
export function registerLiveTranscriptIpc(): void {
  ipcMain.on("meeting-live-transcript:port", (event: IpcMainEvent, authorization: unknown) => {
    const [port] = event.ports;
    if (event.ports.length !== 1 || !isTrustedMainFrame(event)) {
      port?.close();
      return;
    }
    if (!isLiveTranscriptAuthorization(authorization)) {
      port.close();
      return;
    }
    const { baseUrl, clientSecret, language, model } = authorization as {
      baseUrl: string;
      clientSecret: string;
      language?: string;
      model: string;
    };
    let connection: DashScopeRealtimeWsConnection | null = null;
    let portClosed = false;
    const closePort = () => {
      if (portClosed) {
        return;
      }
      portClosed = true;
      port.close();
    };
    const deliver = (message: unknown) => {
      if (!portClosed) {
        port.postMessage(message);
      }
    };
    connection = connectDashScopeRealtimeWs({
      baseUrl,
      language,
      model,
      onClose: (reason) => {
        console.warn("[live-transcript] provider connection closed", {
          model,
          reason,
          track: (authorization as { track?: unknown }).track,
        });
        deliver({ reason, type: "close" });
      },
      onDrain: () => deliver({ type: "drain" }),
      onEvent: (providerEvent) => {
        const providerEventType = providerEvent as { error?: unknown; type?: unknown };
        if (
          providerEventType?.type === "error" ||
          providerEventType?.type === "conversation.item.input_audio_transcription.failed"
        ) {
          console.error("[live-transcript] provider error event", {
            event: providerEvent,
            model,
            track: (authorization as { track?: unknown }).track,
          });
        } else if (
          providerEventType?.type === "session.created" ||
          providerEventType?.type === "session.updated" ||
          providerEventType?.type === "session.finished"
        ) {
          console.info("[live-transcript] provider session event", {
            eventType: providerEventType.type,
            model,
            track: (authorization as { track?: unknown }).track,
          });
        }
        deliver({ event: providerEvent, type: "event" });
      },
      token: clientSecret,
    });
    console.info("[live-transcript] provider connection opened", {
      model,
      track: (authorization as { track?: unknown }).track,
    });
    port.on("message", ({ data }: { data: unknown }) => {
      if (isPcmFrame(data)) {
        connection?.sendPcm(data.bytes);
        return;
      }
      if (isCloseMessage(data)) {
        connection?.close();
        closePort();
      }
    });
    port.on("close", () => {
      connection?.close();
    });
    port.start();
  });
}
