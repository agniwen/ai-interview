// oxlint-disable prefer-add-event-listener, prefer-await-to-callbacks -- The fake must mirror the real ws event API (`.on()` + `on*` handlers).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectDashScopeRealtimeWs } from "./live-transcript-ws";
import type { DashScopeRealtimeWsDependencies } from "./live-transcript-ws";

interface FakeWebSocketInstance {
  bufferedAmount: number;
  options: { headers?: Record<string, string>; handshakeTimeout?: number };
  readyState: number;
  sent: string[];
  url: string;
  onclose: ((code: number, reason: Buffer) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessage: ((data: Buffer | string, isBinary: boolean) => void) | null;
  onopen: (() => void) | null;
  terminate: ReturnType<typeof vi.fn>;
  close: () => void;
  send: (data: string, callback?: (error?: Error) => void) => void;
}

interface ParsedSessionUpdate {
  input_audio_transcription?: { language?: string };
}

interface ParsedWebSocketMessage {
  audio?: string;
  session?: ParsedSessionUpdate;
  type?: string;
}

const mocks = vi.hoisted(() => {
  const instances: FakeWebSocketInstance[] = [];
  class FakeWebSocket {
    static OPEN = 1;
    static CONNECTING = 0;
    static CLOSING = 2;
    static CLOSED = 3;
    bufferedAmount = 0;
    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    onclose: ((code: number, reason: Buffer) => void) | null = null;
    onerror: ((event: { message?: string }) => void) | null = null;
    onmessage: ((data: Buffer | string, isBinary: boolean) => void) | null = null;
    onopen: (() => void) | null = null;
    terminate = vi.fn();
    readonly url: string;
    readonly options: { headers?: Record<string, string>; handshakeTimeout?: number };

    constructor(
      url: string,
      options: { headers?: Record<string, string>; handshakeTimeout?: number },
    ) {
      this.url = url;
      this.options = options;
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      instances.push(this as FakeWebSocketInstance);
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.(1000, Buffer.from(""));
    }

    on(event: "open", callback: () => void): this;
    on(event: "message", callback: (data: Buffer | string, isBinary: boolean) => void): this;
    on(event: "error", callback: (error: { message?: string }) => void): this;
    on(event: "close", callback: (code: number, reason: Buffer) => void): this;
    on(
      event: "open" | "message" | "error" | "close",
      callback: (...payload: never[]) => void,
    ): this {
      if (event === "open") {
        this.readyState = FakeWebSocket.OPEN;
        // SAFETY: The overload selected for the open event accepts a zero-argument callback.
        this.onopen = () => (callback as () => void)();
      }
      if (event === "message") {
        // SAFETY: The overload selected for the message event accepts the data and binary flag.
        const onMessage = callback as (data: Buffer | string, isBinary: boolean) => void;
        this.onmessage = (data, isBinary) => onMessage(data, isBinary);
      }
      if (event === "error") {
        // SAFETY: The overload selected for the error event accepts the error payload.
        const onError = callback as (error: { message?: string }) => void;
        this.onerror = (error) => onError(error);
      }
      if (event === "close") {
        // SAFETY: The overload selected for the close event accepts the close code and reason.
        const onClose = callback as (code: number, reason: Buffer) => void;
        this.onclose = (code, reason) => onClose(code, reason);
      }
      return this;
    }

    send(data: string, callback?: (error?: Error) => void) {
      this.sent.push(data);
      callback?.();
    }
  }
  return { FakeWebSocket, instances };
});

function parseSent(raw: string | undefined): ParsedWebSocketMessage {
  if (!raw) {
    return {};
  }
  try {
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    return JSON.parse(raw) as ParsedWebSocketMessage;
  } catch {
    return {};
  }
}

function createConnection(overrides: Partial<DashScopeRealtimeWsDependencies> = {}) {
  const dependencies: DashScopeRealtimeWsDependencies = {
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    model: "qwen3-asr-flash-realtime",
    onClose: vi.fn(),
    onDrain: vi.fn(),
    onEvent: vi.fn(),
    token: "st-temp-token",
    webSocket: mocks.FakeWebSocket,
    ...overrides,
  };
  const connection = connectDashScopeRealtimeWs(dependencies);
  const instance = mocks.instances.at(-1);
  if (!instance) {
    throw new Error("expected a WebSocket instance");
  }
  return { connection, dependencies, instance };
}

describe("connectDashScopeRealtimeWs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.instances.length = 0;
  });

  it("connects with the temp token in the Authorization header and sends session.update on open", () => {
    const { instance } = createConnection({ language: "zh" });
    expect(instance.options.headers).toEqual({ Authorization: "Bearer st-temp-token" });
    expect(instance.url).toBe(
      "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime",
    );
    instance.onopen?.();
    const sessionUpdate = parseSent(instance.sent[0]);
    expect(sessionUpdate.type).toBe("session.update");
    expect(sessionUpdate.session).toMatchObject({
      input_audio_format: "pcm",
      sample_rate: 16_000,
      turn_detection: { silence_duration_ms: 400, threshold: 0, type: "server_vad" },
    });
    expect(sessionUpdate.session?.input_audio_transcription).toEqual({ language: "zh" });
  });

  it("omits the language hint when none is configured", () => {
    const { instance } = createConnection();
    instance.onopen?.();
    const sessionUpdate = parseSent(instance.sent[0]);
    expect(sessionUpdate.session?.input_audio_transcription).toBeUndefined();
  });

  it("encodes PCM frames as base64 input_audio_buffer.append events", () => {
    const { connection, instance } = createConnection();
    instance.onopen?.();
    instance.sent = [];
    const accepted = connection.sendPcm(new Uint8Array([0, 1, 2, 250, 255]));
    expect(accepted).toBe(true);
    const append = parseSent(instance.sent[0]);
    expect(append.type).toBe("input_audio_buffer.append");
    expect([...Buffer.from(append.audio ?? "", "base64")]).toEqual([0, 1, 2, 250, 255]);
  });

  it("rejects frames above the high-water mark and emits a drain ack when the socket recovers", () => {
    vi.useFakeTimers();
    try {
      const { connection, dependencies, instance } = createConnection();
      instance.onopen?.();
      instance.bufferedAmount = 1024 * 1024;
      expect(connection.sendPcm(new Uint8Array(16))).toBe(false);
      instance.bufferedAmount = 0;
      vi.advanceTimersByTime(300);
      expect(dependencies.onDrain).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(300);
      expect(dependencies.onDrain).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not emit drain after closing a backpressured connection", () => {
    vi.useFakeTimers();
    try {
      const { connection, dependencies, instance } = createConnection();
      instance.onopen?.();
      instance.bufferedAmount = 1024 * 1024;
      expect(connection.sendPcm(new Uint8Array(16))).toBe(false);

      connection.close();
      instance.bufferedAmount = 0;
      vi.advanceTimersByTime(300);

      expect(dependencies.onDrain).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards provider JSON events and a provider-error close reason", () => {
    const { connection, dependencies, instance } = createConnection();
    instance.onopen?.();
    instance.onmessage?.(
      Buffer.from(
        JSON.stringify({
          transcript: "你好",
          type: "conversation.item.input_audio_transcription.completed",
        }),
      ),
      false,
    );
    expect(dependencies.onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "conversation.item.input_audio_transcription.completed" }),
    );
    instance.onclose?.(1006, Buffer.from("abnormal closure"));
    expect(dependencies.onClose).toHaveBeenCalledWith("provider-disconnected:abnormal closure");
    expect(connection).toBeDefined();
  });

  it("sends session.finish before terminating on graceful close", () => {
    vi.useFakeTimers();
    try {
      const { connection, instance } = createConnection();
      instance.onopen?.();
      connection.close();
      const finish = parseSent(instance.sent.at(-1));
      expect(finish.type).toBe("session.finish");
      vi.advanceTimersByTime(2000);
      expect(instance.terminate).toHaveBeenCalled();
      connection.close();
      expect(instance.terminate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
