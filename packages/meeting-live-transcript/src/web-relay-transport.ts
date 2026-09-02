// oxlint-disable promise/avoid-new -- Browser WebSocket readiness is callback-only.
import { liveCorrectionEventSchema } from "@app/shared/meeting-live-correction";
import type { LiveCorrectionEvent } from "@app/shared/meeting-live-correction";
import type { MeetingLiveTranscriptTrack } from "@app/shared/meeting-transcription";
import { z } from "zod";
import type { LiveTranscriptConnection, LiveTranscriptEvent } from "./live-transcript-draft";
import {
  DASHSCOPE_SAMPLE_RATE,
  WORKLET_SAMPLE_RATE,
  dashScopeServerEventSchema,
  handleDashScopeEvent,
  resamplePcm16,
} from "./qwen-events";

const CONNECTION_TIMEOUT_MS = 10_000;
const MAX_INFLIGHT_BYTES = 64 * 1024;

export interface HumanInterviewTranscriptRelayAuthorization {
  captureId: string;
  inviteToken: string;
  track: MeetingLiveTranscriptTrack;
}

const relayMessageSchema = z.discriminatedUnion("type", [
  z.object({ event: dashScopeServerEventSchema, type: z.literal("event") }),
  z.object({ event: liveCorrectionEventSchema, type: z.literal("correction") }),
  z.object({ byteLength: z.number().int().positive(), type: z.literal("pcm-ack") }),
  z.object({ type: z.literal("backpressure") }),
  z.object({ type: z.literal("drain") }),
  z.object({ reason: z.string().optional(), type: z.literal("close") }),
]);

function encodeProtocolValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function relayUrl(): string {
  const protocol = globalThis.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${globalThis.location.host}/_human-interview-live-transcript`;
}

export async function connectHumanInterviewTranscriptRelay(input: {
  authorization: HumanInterviewTranscriptRelayAuthorization;
  captureId: string;
  sectionId: string;
  onCorrection: (event: LiveCorrectionEvent) => void;
  onDisconnect: (reason: string) => void;
  onTranscript: (event: LiveTranscriptEvent) => void;
  onWritable: () => void;
}): Promise<LiveTranscriptConnection> {
  const protocol = [
    "arc-human-interview-transcript",
    `arc-invite.${encodeProtocolValue(input.authorization.inviteToken)}`,
    `arc-capture.${input.captureId}`,
    `arc-track.${input.authorization.track}`,
    `arc-section.${encodeProtocolValue(input.sectionId)}`,
  ];
  const socket = new WebSocket(relayUrl(), protocol);
  socket.binaryType = "arraybuffer";
  let backpressured = false;
  let blockedFrameBytes = 0;
  let closing = false;
  let inFlightBytes = 0;
  let providerWritable = true;
  const resumeIfWritable = () => {
    if (
      backpressured &&
      providerWritable &&
      inFlightBytes + blockedFrameBytes <= MAX_INFLIGHT_BYTES
    ) {
      backpressured = false;
      blockedFrameBytes = 0;
      input.onWritable();
    }
  };
  const opened = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("实时字幕连接超时")), CONNECTION_TIMEOUT_MS);
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      reject(new Error("实时字幕连接失败"));
    });
    socket.addEventListener("message", (event) => {
      const data = z.string().safeParse(event.data);
      if (!data.success) {
        return;
      }
      const raw = JSON.parse(data.data);
      const parsed = relayMessageSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      const message = parsed.data;
      if (message.type === "event") {
        if (message.event.type === "session.created" || message.event.type === "session.updated") {
          clearTimeout(timeout);
          resolve();
        }
        handleDashScopeEvent(message.event, input);
      } else if (message.type === "correction") {
        input.onCorrection(message.event);
      } else if (message.type === "pcm-ack") {
        inFlightBytes = Math.max(0, inFlightBytes - message.byteLength);
        resumeIfWritable();
      } else if (message.type === "backpressure") {
        providerWritable = false;
      } else if (message.type === "drain") {
        providerWritable = true;
        resumeIfWritable();
      } else if (message.type === "close" && !closing) {
        input.onDisconnect(message.reason ?? "provider-disconnected");
      }
    });
  });
  socket.addEventListener("close", () => {
    if (!closing) {
      input.onDisconnect("provider-disconnected");
    }
  });
  try {
    await opened;
  } catch (error) {
    closing = true;
    socket.close();
    throw error;
  }
  input.onWritable();
  return {
    close: () => {
      closing = true;
      socket.close(1000, "closed-by-client");
    },
    correct: (batch) => {
      if (closing || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      socket.send(JSON.stringify({ batch, type: "correct" }));
      return true;
    },
    sendPcm: (frame) => {
      if (closing || socket.readyState !== WebSocket.OPEN) {
        return false;
      }
      const resampled = resamplePcm16(frame, WORKLET_SAMPLE_RATE, DASHSCOPE_SAMPLE_RATE);
      const bytes = new Uint8Array(resampled.buffer, resampled.byteOffset, resampled.byteLength);
      if (!providerWritable || inFlightBytes + bytes.byteLength > MAX_INFLIGHT_BYTES) {
        backpressured = true;
        blockedFrameBytes = bytes.byteLength;
        return false;
      }
      const payload = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(payload).set(bytes);
      socket.send(payload);
      inFlightBytes += bytes.byteLength;
      return true;
    },
  };
}
