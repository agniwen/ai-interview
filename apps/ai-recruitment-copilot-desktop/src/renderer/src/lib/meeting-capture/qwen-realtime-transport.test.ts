import type { LiveCorrectionBatch } from "@arc/shared/meeting-live-correction";
// oxlint-disable no-promise-executor-return, promise/avoid-new -- MessagePort delivery is confirmed through deferred callbacks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import type { LiveTranscriptEvent } from "./live-transcript-draft";
import { connectQwenRealtimeTranscription } from "./qwen-realtime-transport";

const AUTHORIZATION: MeetingLiveTranscriptAuthorization = {
  baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
  clientSecret: "st-temp-token",
  expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
  model: "qwen-audio-3.0-asr-flash-streaming",
  provider: "qwen",
  track: "microphone",
};

const BATCH: LiveCorrectionBatch = {
  batchId: "00000000-0000-4000-8000-000000000001",
  blocks: [0, 1, 2].map((i) => ({
    id: `capture:microphone:0:${i}`,
    itemId: String(i),
    originalText: `原文${i}`,
    sectionId: "capture:microphone:0",
    track: "microphone",
  })),
  context: { after: [], before: [] },
};
const CORRECTION_INPUT = {
  captureId: "capture",
  onCorrection: vi.fn(),
  sectionId: "capture:microphone:0",
};
type TranscriptEvent = LiveTranscriptEvent;

interface HandshakeMessage {
  authorization: MeetingLiveTranscriptAuthorization;
  type: "start-meeting-live-transcript-client";
}

let serverPort: MessagePort | null = null;
let postedHandshake: HandshakeMessage | null = null;
let receivedPcm: Uint8Array[] = [];
let acknowledgePcm = false;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  serverPort = null;
  postedHandshake = null;
  receivedPcm = [];
  acknowledgePcm = false;
  vi.stubGlobal("window", {
    postMessage: (message: HandshakeMessage, _targetOrigin: string, transfer: MessagePort[]) => {
      postedHandshake = message;
      [serverPort] = transfer;
      serverPort?.addEventListener("message", (event: MessageEvent) => {
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        const data = event.data as { type?: string };
        if (data?.type === "pcm" && event.data.bytes instanceof Uint8Array) {
          receivedPcm.push(event.data.bytes);
          if (acknowledgePcm) {
            serverPort?.postMessage(
              { byteLength: event.data.bytes.byteLength, type: "pcm-ack" },
              [],
            );
          }
        }
      });
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  serverPort?.close();
});

async function openConnection() {
  const transcripts: TranscriptEvent[] = [];
  const disconnects: string[] = [];
  const writableCalls: unknown[] = [];
  const pending = connectQwenRealtimeTranscription({
    ...CORRECTION_INPUT,
    authorization: AUTHORIZATION,
    onDisconnect: (reason) => disconnects.push(reason),
    onTranscript: (event) => transcripts.push(event),
    onWritable: () => writableCalls.push(null),
  });
  await tick();
  serverPort?.postMessage({ event: { type: "session.created" }, type: "event" }, []);
  const connection = await pending;
  return { connection, disconnects, transcripts, writableCalls };
}

describe("connectQwenRealtimeTranscription", () => {
  it("sends explicit block correction requests over the port only while open", async () => {
    const { connection } = await openConnection();
    const onMessage = vi.fn();
    serverPort?.addEventListener("message", onMessage);
    connection.correct?.(BATCH);
    await tick();
    expect(onMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ data: { batch: BATCH, type: "correct" } }),
    );
    connection.close();
    await tick();
    onMessage.mockClear();
    connection.correct?.(BATCH);
    await tick();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("delivers a batch result without losing its block payload at the schema boundary", async () => {
    const { connection } = await openConnection();
    const event = {
      batchId: BATCH.batchId,
      blocks: BATCH.blocks.map((block) => ({ id: block.id, text: "校正" })),
      combinedTranscript: "完整合并音频识别",
      model: "model",
      status: "completed",
      type: "meeting.transcription.correction-batch",
    };
    serverPort?.postMessage({ event, type: "event" }, []);
    await tick();
    expect(CORRECTION_INPUT.onCorrection).toHaveBeenCalledWith(event);
    connection.close();
  });

  it("forwards per-sentence correction status and ignores malformed status events", async () => {
    const { connection, transcripts } = await openConnection();
    for (const status of ["started", "finished", "unknown", undefined]) {
      serverPort?.postMessage(
        {
          event: {
            item_id: "3",
            original_text: "原稿",
            status,
            type: "meeting.transcription.correction-status",
          },
          type: "event",
        },
        [],
      );
    }
    await tick();
    expect(transcripts).toEqual([
      { itemId: "3", originalText: "原稿", text: "", type: "correction-started" },
      { itemId: "3", originalText: "原稿", text: "", type: "correction-finished" },
    ]);
    connection.close();
  });

  it("forwards correction provenance separately from realtime completion", async () => {
    const { connection, transcripts } = await openConnection();
    serverPort?.postMessage(
      {
        event: {
          item_id: "3",
          model: "qwen-audio-3.0-asr-flash",
          original_text: "原稿",
          transcript: "校正版",
          type: "meeting.transcription.corrected",
        },
        type: "event",
      },
      [],
    );
    await tick();
    expect(transcripts).toEqual([
      {
        correctionModel: "qwen-audio-3.0-asr-flash",
        itemId: "3",
        originalText: "原稿",
        text: "校正版",
        type: "corrected",
      },
    ]);
    connection.close();
  });
  it("hands the authorization to the preload handshake and resolves on session.created", async () => {
    const { connection, writableCalls } = await openConnection();
    expect(postedHandshake).toMatchObject({
      authorization: { ...AUTHORIZATION, captureId: "capture", sectionId: "capture:microphone:0" },
      type: "start-meeting-live-transcript-client",
    });
    expect(writableCalls.length).toBeGreaterThan(0);
    connection.close();
  });

  it("rotates the connection before its correction key expires", async () => {
    const timer = vi.spyOn(globalThis, "setTimeout");
    try {
      const { connection, disconnects } = await openConnection();
      const renewal = timer.mock.calls.find(
        ([, delay]) => delay !== undefined && delay > 1_700_000,
      );
      if (!renewal) {
        throw new Error("Missing temporary-key renewal timer");
      }
      renewal[0]();
      expect(disconnects).toEqual(["authorization-expiring"]);
      connection.close();
      renewal[0]();
      expect(disconnects).toEqual(["authorization-expiring"]);
    } finally {
      timer.mockRestore();
    }
  });

  it("routes text + stash partials and completed transcripts to onTranscript", async () => {
    const { connection, transcripts } = await openConnection();
    serverPort?.postMessage(
      {
        event: {
          item_id: "item-1",
          stash: "Thank",
          text: "",
          type: "conversation.item.input_audio_transcription.text",
        },
        type: "event",
      },
      [],
    );
    serverPort?.postMessage(
      {
        event: {
          item_id: "item-1",
          stash: " you",
          text: "Thank",
          type: "conversation.item.input_audio_transcription.text",
        },
        type: "event",
      },
      [],
    );
    serverPort?.postMessage(
      {
        event: {
          end_ms: 920,
          item_id: "item-2",
          start_ms: 170,
          transcript: "今天天气怎么样",
          type: "conversation.item.input_audio_transcription.completed",
          words: [
            { end_ms: 503, punctuation: "", start_ms: 170, text: "今天" },
            { end_ms: 920, punctuation: "？", start_ms: 503, text: "天气怎么样" },
          ],
        },
        type: "event",
      },
      [],
    );
    await tick();
    expect(transcripts).toEqual([
      { itemId: "item-1", text: "Thank", type: "snapshot" },
      { itemId: "item-1", text: "Thank you", type: "snapshot" },
      {
        endMs: 920,
        itemId: "item-2",
        startMs: 170,
        text: "今天天气怎么样",
        type: "completed",
        words: [
          { endMs: 503, punctuation: "", startMs: 170, text: "今天" },
          { endMs: 920, punctuation: "？", startMs: 503, text: "天气怎么样" },
        ],
      },
    ]);
    connection.close();
  });

  it("disconnects on a provider error event and on a main-process close", async () => {
    const { connection, disconnects } = await openConnection();
    serverPort?.postMessage({ event: { type: "error" }, type: "event" }, []);
    await tick();
    expect(disconnects).toContain("provider-disconnected");
    serverPort?.postMessage({ reason: "provider-disconnected:1006", type: "close" }, []);
    await tick();
    expect(disconnects).toEqual(["provider-disconnected", "provider-disconnected:1006"]);
    connection.close();
  });

  it("resamples 24k frames to 16k and enforces in-flight backpressure until acknowledged", async () => {
    const { connection, writableCalls } = await openConnection();
    const frame = new Int16Array(2400);
    for (let index = 0; index < frame.length; index += 1) {
      frame[index] = index % 1000;
    }
    let accepted = 0;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (!connection.sendPcm(frame)) {
        break;
      }
      accepted += 1;
    }
    await tick();
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThan(200);
    const last = receivedPcm.at(-1);
    expect(last?.byteLength).toBe(1600 * 2);
    const writableBefore = writableCalls.length;
    serverPort?.postMessage(
      { byteLength: accepted * (last?.byteLength ?? 0), type: "pcm-ack" },
      [],
    );
    await tick();
    expect(writableCalls.length).toBeGreaterThan(writableBefore);
    expect(connection.sendPcm(frame)).toBe(true);
    connection.close();
  });

  it("clones PCM frames without transferring their ArrayBuffer ownership", async () => {
    const postMessage = vi.spyOn(MessagePort.prototype, "postMessage");
    const { connection } = await openConnection();

    expect(connection.sendPcm(new Int16Array(2400))).toBe(true);
    const pcmCall = postMessage.mock.calls.find(
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      ([message]) => (message as { type?: unknown })?.type === "pcm",
    );

    expect(Array.isArray(pcmCall?.[1]) ? pcmCall[1].length : 0).toBe(0);
    connection.close();
  });

  it("pauses on provider backpressure and resumes after drain", async () => {
    const { connection } = await openConnection();
    const frame = new Int16Array(2400);

    serverPort?.postMessage({ type: "backpressure" }, []);
    await tick();
    expect(connection.sendPcm(frame)).toBe(false);

    serverPort?.postMessage({ type: "drain" }, []);
    await tick();
    expect(connection.sendPcm(frame)).toBe(true);
    connection.close();
  });

  it("accepts ten minutes of 100 ms PCM frames under normal acknowledgements", async () => {
    acknowledgePcm = true;
    const { connection } = await openConnection();
    const frame = new Int16Array(2400);

    for (let batch = 0; batch < 600; batch += 1) {
      for (let frameIndex = 0; frameIndex < 10; frameIndex += 1) {
        expect(connection.sendPcm(frame)).toBe(true);
      }
      await tick();
      await tick();
    }

    expect(receivedPcm).toHaveLength(6000);
    connection.close();
  });

  it("rejects when the provider closes before session.created", async () => {
    const pending = connectQwenRealtimeTranscription({
      ...CORRECTION_INPUT,
      authorization: AUTHORIZATION,
      onDisconnect: vi.fn(),
      onTranscript: vi.fn(),
      onWritable: vi.fn(),
    });
    await tick();
    serverPort?.postMessage({ reason: "provider-disconnected:401", type: "close" }, []);
    await expect(pending).rejects.toThrow("provider-disconnected:401");
  });

  it("closes the port without further transcripts after close()", async () => {
    const { connection, transcripts } = await openConnection();
    connection.close();
    serverPort?.postMessage(
      {
        event: {
          item_id: "item-late",
          transcript: "迟到结果",
          type: "conversation.item.input_audio_transcription.completed",
        },
        type: "event",
      },
      [],
    );
    await tick();
    expect(transcripts).toEqual([]);
  });
});
