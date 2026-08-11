// oxlint-disable no-promise-executor-return, promise/avoid-new -- MessagePort delivery is confirmed through deferred callbacks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingLiveTranscriptAuthorization } from "@arc/shared/meeting-transcription";
import { connectQwenRealtimeTranscription } from "./qwen-realtime-transport";

const AUTHORIZATION: MeetingLiveTranscriptAuthorization = {
  baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
  clientSecret: "st-temp-token",
  expiresAt: "2026-08-09T01:21:00.000Z",
  model: "qwen3-asr-flash-realtime",
  provider: "qwen",
  track: "microphone",
};

interface TranscriptEvent {
  itemId: string;
  text: string;
  type: "completed" | "delta" | "snapshot";
}

let serverPort: MessagePort | null = null;
let postedHandshake: unknown = null;
let receivedPcm: Uint8Array[] = [];
let acknowledgePcm = false;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  serverPort = null;
  postedHandshake = null;
  receivedPcm = [];
  acknowledgePcm = false;
  vi.stubGlobal("window", {
    postMessage: (message: unknown, _targetOrigin: string, transfer: MessagePort[]) => {
      postedHandshake = message;
      [serverPort] = transfer;
      serverPort?.addEventListener("message", (event: MessageEvent) => {
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
  it("hands the authorization to the preload handshake and resolves on session.created", async () => {
    const { writableCalls } = await openConnection();
    expect(postedHandshake).toMatchObject({
      authorization: AUTHORIZATION,
      type: "start-meeting-live-transcript-client",
    });
    expect(writableCalls.length).toBeGreaterThan(0);
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
          item_id: "item-2",
          transcript: "今天天气怎么样",
          type: "conversation.item.input_audio_transcription.completed",
        },
        type: "event",
      },
      [],
    );
    await tick();
    expect(transcripts).toEqual([
      { itemId: "item-1", text: "Thank", type: "snapshot" },
      { itemId: "item-1", text: "Thank you", type: "snapshot" },
      { itemId: "item-2", text: "今天天气怎么样", type: "completed" },
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
      ([message]) => (message as { type?: unknown })?.type === "pcm",
    );

    expect(pcmCall?.[1]?.length).toBe(0);
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
