// oxlint-disable sort-keys, promise/prefer-await-to-then -- Lifecycle hook order mirrors websocket flow; timer callbacks bridge async lease renewal.
import {
  connectDashScopeRealtimeWs,
  createLiveTranscriptCorrectionSession,
} from "@arc/meeting-live-transcript/server";
import type { DashScopeRealtimeWsConnection } from "@arc/meeting-live-transcript/server";
import { liveCorrectionBatchSchema } from "@arc/shared/meeting-live-correction";
import type { LiveCorrectionBatch } from "@arc/shared/meeting-live-correction";
import {
  heartbeatWorkspaceMeetingLiveTranscript,
  releaseWorkspaceMeetingLiveTranscript,
} from "@app/server/web/human-interview";
import { defineWebSocketHandler } from "nitro";
import { z } from "zod";
import { authorizeHumanInterviewLiveTranscriptUpgrade } from "../utils/human-interview-live-transcript-access";
import type { HumanInterviewLiveTranscriptContext } from "../utils/human-interview-live-transcript-access";
import { renewHumanInterviewLiveTranscriptLease } from "../utils/human-interview-live-transcript-session";

const MAX_PCM_FRAME_BYTES = 128 * 1024;
const HEARTBEAT_MS = 30_000;
const correctionMessageSchema = z.object({
  batch: liveCorrectionBatchSchema,
  type: z.literal("correct"),
});

interface RelaySession {
  cleanup: () => void;
  connection: DashScopeRealtimeWsConnection;
  context: HumanInterviewLiveTranscriptContext;
}

export function relayHumanInterviewTranscriptPcm(input: {
  bytes: Uint8Array;
  send: (message: string) => void;
  sendPcm: (bytes: Uint8Array) => boolean;
}): void {
  if (!input.sendPcm(input.bytes)) {
    input.send(JSON.stringify({ type: "backpressure" }));
  }
  input.send(JSON.stringify({ byteLength: input.bytes.byteLength, type: "pcm-ack" }));
}

export function relayHumanInterviewTranscriptMessage(input: {
  bytes: Uint8Array;
  close: (code: number, reason: string) => void;
  correct: (batch: LiveCorrectionBatch) => void;
  rawData: unknown;
  send: (message: string) => void;
  sendPcm: (bytes: Uint8Array) => boolean;
}): void {
  const rawText = z.string().safeParse(input.rawData);
  if (rawText.success) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText.data);
    } catch {
      input.close(1003, "invalid-correction-message");
      return;
    }
    const correction = correctionMessageSchema.safeParse(parsed);
    if (!correction.success) {
      input.close(1003, "invalid-correction-message");
      return;
    }
    input.correct(correction.data.batch);
    return;
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_PCM_FRAME_BYTES) {
    input.close(1009, "invalid-pcm-frame");
    return;
  }
  relayHumanInterviewTranscriptPcm({
    bytes: input.bytes,
    send: input.send,
    sendPcm: input.sendPcm,
  });
}

const sessions = new Map<string, RelaySession>();
const captureReferences = new Map<string, number>();
const captureCorrections = new Map<
  string,
  ReturnType<typeof createLiveTranscriptCorrectionSession>
>();

function captureKey(context: HumanInterviewLiveTranscriptContext): string {
  return `${context.organizationId}:${context.userId}:${context.captureId}`;
}

function retainCapture(context: HumanInterviewLiveTranscriptContext): void {
  const key = captureKey(context);
  captureReferences.set(key, (captureReferences.get(key) ?? 0) + 1);
}

async function releaseCaptureLease(context: HumanInterviewLiveTranscriptContext): Promise<void> {
  try {
    await releaseWorkspaceMeetingLiveTranscript({
      captureId: context.captureId,
      organizationId: context.organizationId,
      userId: context.userId,
    });
  } catch (error) {
    console.warn("failed to release human interview transcript lease", error);
  }
}

function releaseCapture(context: HumanInterviewLiveTranscriptContext): void {
  const key = captureKey(context);
  const remaining = Math.max(0, (captureReferences.get(key) ?? 1) - 1);
  if (remaining > 0) {
    captureReferences.set(key, remaining);
    return;
  }
  captureReferences.delete(key);
  void releaseCaptureLease(context);
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const context = await authorizeHumanInterviewLiveTranscriptUpgrade(request);
    return {
      context,
      headers: { "Sec-WebSocket-Protocol": "arc-human-interview-transcript" },
      protocol: "arc-human-interview-transcript",
    };
  },
  open(peer) {
    // SAFETY: upgrade() is the only route into this handler and attaches the validated context.
    const context = peer.context as HumanInterviewLiveTranscriptContext;
    const { authorization } = context;
    if (!authorization.baseUrl) {
      peer.close(1011, "transcript-provider-unavailable");
      return;
    }
    retainCapture(context);
    const key = captureKey(context);
    const correction =
      captureCorrections.get(key) ?? createLiveTranscriptCorrectionSession(globalThis.fetch);
    captureCorrections.set(key, correction);
    let cleaned = false;
    const heartbeat = setInterval(() => {
      void renewHumanInterviewLiveTranscriptLease({
        close: (reason) => peer.close(1011, reason),
        heartbeat: () =>
          heartbeatWorkspaceMeetingLiveTranscript({
            captureId: context.captureId,
            organizationId: context.organizationId,
            userId: context.userId,
          }),
      });
    }, HEARTBEAT_MS);
    heartbeat.unref();
    const cleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      clearInterval(heartbeat);
      sessions.delete(peer.id);
      if (!correction.remove(context.sectionId) && captureCorrections.get(key) === correction) {
        captureCorrections.delete(key);
      }
      releaseCapture(context);
    };
    const connection = connectDashScopeRealtimeWs({
      baseUrl: authorization.baseUrl,
      context: authorization.context,
      language: authorization.language,
      model: authorization.model,
      onClose: (reason) => {
        peer.send(JSON.stringify({ reason, type: "close" }));
        peer.close(1011, reason.slice(0, 120));
      },
      onDrain: () => peer.send(JSON.stringify({ type: "drain" })),
      onEvent: (event) => {
        correction.observe(context.sectionId, event);
        peer.send(JSON.stringify({ event, type: "event" }));
      },
      speechNoiseThreshold: authorization.speechNoiseThreshold,
      token: authorization.clientSecret,
      vocabulary: authorization.vocabulary,
    });
    correction.add({
      baseUrl: authorization.baseUrl,
      connection,
      language: authorization.language,
      onCorrection: (event) => peer.send(JSON.stringify({ event, type: "correction" })),
      sectionId: context.sectionId,
      token: authorization.clientSecret,
      track: context.track,
    });
    sessions.set(peer.id, { cleanup, connection, context });
  },
  message(peer, message) {
    const session = sessions.get(peer.id);
    if (!session) {
      peer.close(1011, "transcript-session-missing");
      return;
    }
    relayHumanInterviewTranscriptMessage({
      bytes: message.uint8Array(),
      close: (code, reason) => peer.close(code, reason),
      correct: (batch) => {
        captureCorrections
          .get(captureKey(session.context))
          ?.correct(session.context.sectionId, batch);
      },
      rawData: message.rawData,
      send: (payload) => peer.send(payload),
      sendPcm: session.connection.sendPcm,
    });
  },
  close(peer) {
    const session = sessions.get(peer.id);
    session?.connection.close();
    session?.cleanup();
  },
  error(peer) {
    const session = sessions.get(peer.id);
    session?.connection.close();
    session?.cleanup();
  },
});
