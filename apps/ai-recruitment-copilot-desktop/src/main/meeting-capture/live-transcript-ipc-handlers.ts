// oxlint-disable promise/prefer-await-to-callbacks -- MessagePort and provider callbacks are event based.
import type { JsonValue } from "@arc/db-schema/json";
import { z } from "zod";
import { liveCorrectionBatchSchema } from "@arc/shared/meeting-live-correction";
import { createLiveTranscriptCorrectionSession } from "./live-transcript-correction-session";
import type {
  DashScopeRealtimeWsConnection,
  DashScopeRealtimeWsDependencies,
} from "./live-transcript-ws";

const TOKEN_MAX_LENGTH = 4096;
const MODEL_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const EXPIRES_AT_MAX_LENGTH = 64;

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

const liveTranscriptAuthorizationSchema = z.object({
  baseUrl: z.custom<string>(isWssAliyunUrl),
  captureId: z.string().min(1).max(256),
  clientSecret: z.string().min(1).max(TOKEN_MAX_LENGTH),
  expiresAt: z
    .string()
    .max(EXPIRES_AT_MAX_LENGTH)
    .refine((value) => !Number.isNaN(Date.parse(value))),
  language: z.string().optional(),
  model: z.string().max(128).regex(MODEL_PATTERN),
  provider: z.literal("qwen"),
  sectionId: z.string().min(1).max(512),
  track: z.enum(["microphone", "system"]),
});

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    Object.prototype.toString.call(value) === "[object Uint8Array]" &&
    value.byteLength > 0
  );
}

const pcmFrameSchema = z.object({
  bytes: z.custom<Uint8Array>(isUint8Array),
  type: z.literal("pcm"),
});
const closeMessageSchema = z.object({ type: z.literal("close") });
const correctionMessageSchema = z.object({
  batch: liveCorrectionBatchSchema,
  type: z.literal("correct"),
});

type RendererPortMessage =
  | JsonValue
  | Uint8Array
  | { bytes: Uint8Array; type: "pcm" }
  | { type: "close" };
type MainToRendererMessage =
  | { byteLength: number; type: "pcm-ack" }
  | { event: JsonValue; type: "event" }
  | { reason: string; type: "close" }
  | { type: "backpressure" | "drain" };

export interface LiveTranscriptPort {
  close: () => void;
  on: {
    (event: "message", callback: (payload: { data: RendererPortMessage }) => void): void;
    (event: "close", callback: () => void): void;
  };
  postMessage: (message: MainToRendererMessage) => void;
  start: () => void;
}

export interface LiveTranscriptIpcEvent {
  ports: readonly LiveTranscriptPort[];
}

export interface LiveTranscriptIpcDependencies<Event extends LiveTranscriptIpcEvent> {
  fetch?: typeof globalThis.fetch;
  connect: (dependencies: DashScopeRealtimeWsDependencies) => DashScopeRealtimeWsConnection;
  isTrustedMainFrame: (event: Event) => boolean;
  onPort: (handler: (event: Event, rawAuthorization: JsonValue) => void) => void;
}

export function registerLiveTranscriptIpcHandlers<Event extends LiveTranscriptIpcEvent>(
  dependencies: LiveTranscriptIpcDependencies<Event>,
): void {
  const sessions = new Map<string, ReturnType<typeof createLiveTranscriptCorrectionSession>>();
  dependencies.onPort((event, rawAuthorization) => {
    const [port] = event.ports;
    if (event.ports.length !== 1 || !dependencies.isTrustedMainFrame(event)) {
      port?.close();
      return;
    }
    const parsedAuthorization = liveTranscriptAuthorizationSchema.safeParse(rawAuthorization);
    if (!parsedAuthorization.success) {
      port.close();
      return;
    }
    const { baseUrl, captureId, sectionId, clientSecret, language, model, track } =
      parsedAuthorization.data;
    let connection: DashScopeRealtimeWsConnection | null = null;
    let portClosed = false;
    const session =
      sessions.get(captureId) ?? createLiveTranscriptCorrectionSession(dependencies.fetch);
    sessions.set(captureId, session);
    let removed = false;
    const removeSection = () => {
      if (removed) {
        return;
      }
      removed = true;
      if (!session.remove(sectionId) && sessions.get(captureId) === session) {
        sessions.delete(captureId);
      }
    };
    const closePort = () => {
      if (portClosed) {
        return;
      }
      portClosed = true;
      removeSection();
      port.close();
    };
    const deliver = (message: MainToRendererMessage) => {
      if (!portClosed) {
        port.postMessage(message);
      }
    };
    connection = dependencies.connect({
      baseUrl,
      language,
      model,
      onClose: (reason) => {
        console.warn("[live-transcript] provider connection closed", {
          model,
          reason,
          track,
        });
        removeSection();
        deliver({ reason, type: "close" });
      },
      onDrain: () => deliver({ type: "drain" }),
      onEvent: (providerEvent) => {
        session.observe(sectionId, providerEvent);
        const providerEventType = z
          .object({ type: z.string().optional() })
          .safeParse(providerEvent);
        const eventType = providerEventType.success ? providerEventType.data.type : undefined;
        if (
          eventType === "error" ||
          eventType === "conversation.item.input_audio_transcription.failed"
        ) {
          console.error("[live-transcript] provider error event", {
            event: providerEvent,
            model,
            track,
          });
        } else if (
          eventType === "session.created" ||
          eventType === "session.updated" ||
          eventType === "session.finished"
        ) {
          console.info("[live-transcript] provider session event", {
            eventType,
            model,
            track,
          });
        }
        deliver({ event: providerEvent, type: "event" });
      },
      token: clientSecret,
    });
    session.add({
      baseUrl,
      connection,
      language,
      onCorrection: (correction) => deliver({ event: correction, type: "event" }),
      sectionId,
      token: clientSecret,
      track,
    });
    console.info("[live-transcript] provider connection opened", {
      model,
      track,
    });
    port.on("message", ({ data }) => {
      if (portClosed) {
        return;
      }
      const pcmFrame = pcmFrameSchema.safeParse(data);
      if (pcmFrame.success) {
        const accepted = connection?.sendPcm(pcmFrame.data.bytes) ?? false;
        if (!accepted) {
          deliver({ type: "backpressure" });
        }
        deliver({ byteLength: pcmFrame.data.bytes.byteLength, type: "pcm-ack" });
        return;
      }
      const correctionMessage = correctionMessageSchema.safeParse(data);
      if (correctionMessage.success) {
        session.correct(sectionId, correctionMessage.data.batch);
        return;
      }
      if (closeMessageSchema.safeParse(data).success) {
        connection?.close();
        closePort();
      }
    });
    port.on("close", () => {
      portClosed = true;
      removeSection();
      connection?.close();
    });
    port.start();
  });
}
