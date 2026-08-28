// oxlint-disable no-promise-executor-return, prefer-await-to-callbacks, promise/avoid-new -- The fake MessagePort mirrors Electron's event API.
import { runInNewContext } from "node:vm";
import { liveCorrectionEventSchema } from "@arc/shared/meeting-live-correction";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@arc/db-schema/json";
import { registerLiveTranscriptIpcHandlers } from "./live-transcript-ipc-handlers";
import type { LiveTranscriptIpcEvent, LiveTranscriptPort } from "./live-transcript-ipc-handlers";
import type {
  DashScopeRealtimeWsConnection,
  DashScopeRealtimeWsDependencies,
} from "./live-transcript-ws";

interface PortEvent {
  data: JsonValue | Uint8Array | { bytes: Uint8Array; type: "pcm" } | { type: "close" };
}
interface LiveTranscriptAuthorization extends Record<string, JsonValue> {
  baseUrl: string;
  clientSecret: string;
  expiresAt: string;
  model: string;
  provider: "qwen";
  track: "microphone" | "system";
}
type PostedMessage =
  | { byteLength: number; type: "pcm-ack" }
  | { event: JsonValue; type: "event" }
  | { reason: string; type: "close" }
  | { type: "backpressure" | "drain" };

class FakePort implements LiveTranscriptPort {
  private readonly closeListeners: (() => void)[] = [];
  private readonly messageListeners: ((payload: PortEvent) => void)[] = [];
  readonly posted: PostedMessage[] = [];
  readonly close = vi.fn(() => {
    for (const callback of this.closeListeners) {
      callback();
    }
  });
  readonly postMessage = vi.fn((message: PostedMessage) => {
    this.posted.push(message);
  });
  readonly start = vi.fn();

  on(event: "message", callback: (payload: PortEvent) => void): void;
  on(event: "close", callback: () => void): void;
  on(event: "message" | "close", callback: ((payload: PortEvent) => void) | (() => void)): void {
    if (event === "message") {
      // SAFETY: The event discriminator selects the matching listener contract.
      this.messageListeners.push(callback as (payload: PortEvent) => void);
      return;
    }
    // SAFETY: The event discriminator selects the matching listener contract.
    this.closeListeners.push(callback as () => void);
  }

  emit(event: "message", payload: PortEvent): void;
  emit(event: "close"): void;
  emit(event: "message" | "close", payload?: PortEvent): void {
    if (event === "message") {
      for (const callback of this.messageListeners) {
        callback(payload ?? { data: { type: "close" } });
      }
      return;
    }
    for (const callback of this.closeListeners) {
      callback();
    }
  }
}

const connectDashScopeRealtimeWsMock = vi.fn(
  (_dependencies: DashScopeRealtimeWsDependencies): DashScopeRealtimeWsConnection => ({
    close: vi.fn(),
    sendPcm: vi.fn().mockReturnValue(true),
  }),
);
const isTrustedMainFrameMock = vi.fn().mockReturnValue(true);
let registeredHandler:
  | ((event: LiveTranscriptIpcEvent, authorization: JsonValue) => void)
  | undefined;

function createFakePort(): FakePort {
  return new FakePort();
}

function registerAndGetHandler(fetch?: typeof globalThis.fetch) {
  registerLiveTranscriptIpcHandlers({
    connect: connectDashScopeRealtimeWsMock,
    fetch,
    isTrustedMainFrame: isTrustedMainFrameMock,
    onPort: (handler) => {
      registeredHandler = handler;
    },
  });
  if (!registeredHandler) {
    throw new Error("live-transcript port IPC was not registered");
  }
  return registeredHandler;
}

function validAuthorization(): LiveTranscriptAuthorization {
  return {
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    captureId: "capture",
    clientSecret: "st-temp-token",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
    sectionId: "capture:microphone:0",
    track: "microphone",
  };
}

describe("registerLiveTranscriptIpcHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandler = undefined;
    isTrustedMainFrameMock.mockReturnValue(true);
    connectDashScopeRealtimeWsMock.mockImplementation(
      (_dependencies: DashScopeRealtimeWsDependencies): DashScopeRealtimeWsConnection => ({
        close: vi.fn(),
        sendPcm: vi.fn().mockReturnValue(true),
      }),
    );
  });

  it("combines both ports into one correction request and returns all three blocks together", async () => {
    const take = vi.fn(() => Buffer.alloc(32_000));
    const peek = vi.fn(() => Buffer.alloc(32_000));
    connectDashScopeRealtimeWsMock.mockImplementation(() => ({
      close: vi.fn(),
      peekCorrectionAudio: peek,
      sendPcm: () => true,
      takeCorrectionAudio: take,
    }));
    const blocks = [0, 1, 2].map((i) => {
      const track = i === 1 ? "system" : "microphone";
      const sectionId = `capture:${track}:0`;
      return {
        id: `${sectionId}:${i}`,
        itemId: String(i),
        originalText: `实时${i}`,
        sectionId,
        track,
      };
    });
    const batch = {
      batchId: "00000000-0000-4000-8000-000000000001",
      blocks,
      context: { after: [], before: [] },
      lookahead: {
        id: "capture:system:0:3",
        itemId: "3",
        originalText: "右侧后半句",
        sectionId: "capture:system:0",
        track: "system" as const,
      },
    };
    const result = blocks.map((block) => ({ id: block.id, text: "校正" }));
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ output: { text: "整段识别" } }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            { finish_reason: "stop", message: { content: JSON.stringify({ blocks: result }) } },
          ],
        }),
      );
    const handler = registerAndGetHandler(fetch);
    const mic = createFakePort();
    const system = createFakePort();
    handler({ ports: [mic] }, validAuthorization());
    handler(
      { ports: [system] },
      { ...validAuthorization(), sectionId: "capture:system:0", track: "system" },
    );
    const observe = (block: (typeof blocks)[number]) => {
      const [provider] =
        connectDashScopeRealtimeWsMock.mock.calls[block.track === "system" ? 1 : 0];
      provider.onEvent?.({
        item_id: block.itemId,
        transcript: block.originalText,
        type: "conversation.item.input_audio_transcription.completed",
      });
    };
    for (const block of blocks) {
      observe(block);
    }
    observe(batch.lookahead);
    mic.emit("message", {
      data: { batch: { ...batch, blocks: [] }, type: "correct" },
    });
    expect(take).not.toHaveBeenCalled();
    mic.emit("message", { data: { batch, type: "correct" } });
    await vi.waitFor(() =>
      expect(mic.posted).toContainEqual({
        event: expect.objectContaining({ blocks: result, status: "completed" }),
        type: "event",
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(take.mock.calls).toEqual([
      ["0", "实时0"],
      ["1", "实时1"],
      ["2", "实时2"],
    ]);
    expect(peek).toHaveBeenCalledWith("3", "右侧后半句");
    // A repeated provider final must not downgrade previously corrected context.
    observe(blocks[0]);
    const nextBlocks = blocks.map((block) => ({
      ...block,
      id: `${block.id}-next`,
      itemId: `${block.itemId}-next`,
    }));
    for (const block of nextBlocks) {
      observe(block);
    }
    fetch
      .mockResolvedValueOnce(Response.json({ output: { text: "下一组识别" } }))
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  blocks: nextBlocks.map((block) => ({ id: block.id, text: "下一组校正" })),
                }),
              },
            },
          ],
        }),
      );
    mic.emit("message", {
      data: {
        batch: { ...batch, batchId: "00000000-0000-4000-8000-000000000002", blocks: nextBlocks },
        type: "correct",
      },
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(4));
    const [[, nextOptions]] = fetch.mock.calls.slice(3);
    expect(
      JSON.parse(JSON.parse(String(nextOptions?.body)).messages[1].content).context.before,
    ).toEqual(["校正", "校正", "校正", "右侧后半句"]);
    mic.emit("close");
    mic.emit("message", { data: { batch, type: "correct" } });
    expect(fetch).toHaveBeenCalledTimes(4);
    system.emit("close");
  });

  it("includes following speech arriving during ASR and cancels a batch when its other track closes", async () => {
    const take = vi.fn(() => Buffer.alloc(32_000));
    connectDashScopeRealtimeWsMock.mockImplementation(() => ({
      close: vi.fn(),
      sendPcm: () => true,
      takeCorrectionAudio: take,
    }));
    let resolveAsr: ((response: Response) => void) | undefined;
    let resolveLlm: ((response: Response) => void) | undefined;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveAsr = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLlm = resolve;
          }),
      );
    const handler = registerAndGetHandler(fetch);
    const mic = createFakePort();
    const system = createFakePort();
    handler({ ports: [mic] }, validAuthorization());
    handler(
      { ports: [system] },
      { ...validAuthorization(), sectionId: "capture:system:0", track: "system" },
    );
    const [[micProvider], [systemProvider]] = connectDashScopeRealtimeWsMock.mock.calls;
    const blocks = [0, 1, 2].map((i) => {
      const track = i === 1 ? "system" : "microphone";
      const sectionId = `capture:${track}:0`;
      const provider = i === 1 ? systemProvider : micProvider;
      provider.onEvent?.({
        item_id: String(i),
        transcript: `实时${i}`,
        type: "conversation.item.input_audio_transcription.completed",
      });
      return {
        id: `${sectionId}:${i}`,
        itemId: String(i),
        originalText: `实时${i}`,
        sectionId,
        track,
      };
    });
    const batch = {
      batchId: "00000000-0000-4000-8000-000000000001",
      blocks,
      context: { after: [], before: ["已有校正前文"] },
    };
    mic.emit("message", { data: { batch, type: "correct" } });
    systemProvider.onEvent?.({
      item_id: "next",
      text: "刚刚说出的后文",
      type: "conversation.item.input_audio_transcription.text",
    });
    resolveAsr?.(Response.json({ output: { text: "整体识别" } }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [, llmCall] = fetch.mock.calls;
    const body = JSON.parse(String(llmCall[1]?.body));
    expect(JSON.parse(body.messages[1].content).context).toEqual({
      after: ["刚刚说出的后文"],
      before: ["已有校正前文"],
    });
    system.emit("close");
    expect(llmCall[1]?.signal?.aborted).toBe(true);
    const finished = {
      event: {
        batchId: batch.batchId,
        status: "finished",
        type: "meeting.transcription.correction-batch",
      },
      type: "event",
    };
    expect(mic.posted).toContainEqual(finished);
    resolveLlm?.(
      Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                blocks: blocks.map((block) => ({ id: block.id, text: "迟到" })),
              }),
            },
          },
        ],
      }),
    );
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(
      mic.posted.filter(
        (message) =>
          message.type === "event" && liveCorrectionEventSchema.safeParse(message.event).success,
      ),
    ).toEqual([finished]);
    mic.emit("close");
  });

  it("opens a DashScope connection with the temp token and relays events back", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    expect(connectDashScopeRealtimeWsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
        language: undefined,
        model: "qwen3-asr-flash-realtime",
        token: "st-temp-token",
      }),
    );
    expect(port.start).toHaveBeenCalled();

    const wsDependencies = connectDashScopeRealtimeWsMock.mock.calls[0]?.[0];
    wsDependencies?.onEvent?.({ type: "session.created" });
    expect(port.posted).toEqual([{ event: { type: "session.created" }, type: "event" }]);

    wsDependencies?.onClose?.("provider-disconnected:1006");
    expect(port.posted.at(-1)).toEqual({ reason: "provider-disconnected:1006", type: "close" });

    wsDependencies?.onDrain?.();
    expect(port.posted.at(-1)).toEqual({ type: "drain" });
  });

  it("forwards PCM frames to the WebSocket and closes on a close message", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    const connection = connectDashScopeRealtimeWsMock.mock.results[0]?.value;
    if (!connection) {
      throw new Error("expected a DashScope connection");
    }
    port.emit("message", { data: { bytes: new Uint8Array([1, 2, 3]), type: "pcm" } });
    expect(connection.sendPcm).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(port.posted).toContainEqual({ byteLength: 3, type: "pcm-ack" });

    vi.mocked(connection.sendPcm).mockReturnValueOnce(false);
    port.emit("message", { data: { bytes: new Uint8Array([4, 5]), type: "pcm" } });
    expect(port.posted.slice(-2)).toEqual([
      { type: "backpressure" },
      { byteLength: 2, type: "pcm-ack" },
    ]);

    port.emit("message", { data: { type: "close" } });
    expect(connection.close).toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("accepts PCM typed arrays cloned from another JavaScript realm", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    const connection = connectDashScopeRealtimeWsMock.mock.results[0]?.value;
    if (!connection) {
      throw new Error("expected a DashScope connection");
    }
    // SAFETY: The evaluated expression constructs a Uint8Array in the isolated VM realm.
    const bytes = runInNewContext("new Uint8Array([7, 8, 9])") as Uint8Array;
    expect(bytes).not.toBeInstanceOf(Uint8Array);

    port.emit("message", { data: { bytes, type: "pcm" } });

    expect(connection.sendPcm).toHaveBeenCalledWith(bytes);
    expect(port.posted).toContainEqual({ byteLength: 3, type: "pcm-ack" });
  });

  it("closes the WebSocket when the renderer port closes", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    const connection = connectDashScopeRealtimeWsMock.mock.results[0]?.value;
    port.emit("close");
    expect(connection?.close).toHaveBeenCalled();
  });

  it("rejects an untrusted main frame before opening any connection", () => {
    isTrustedMainFrameMock.mockReturnValueOnce(false);
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());
    expect(connectDashScopeRealtimeWsMock).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("rejects a malformed authorization without opening a connection", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, { ...validAuthorization(), baseUrl: "https://evil.example.com" });
    expect(connectDashScopeRealtimeWsMock).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("rejects an extra port on the handshake", () => {
    const handler = registerAndGetHandler();
    const first = createFakePort();
    const second = createFakePort();
    handler({ ports: [first, second] }, validAuthorization());
    expect(connectDashScopeRealtimeWsMock).not.toHaveBeenCalled();
    expect(first.close).toHaveBeenCalled();
  });
});
