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
  send: (data: string) => void;
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
      instances.push(this as unknown as FakeWebSocketInstance);
    }

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.(1000, Buffer.from(""));
    }

    on(event: "open" | "message" | "error" | "close", callback: (payload?: unknown) => void) {
      if (event === "open") {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen = callback as () => void;
      }
      if (event === "message") {
        this.onmessage = callback as (data: Buffer | string, isBinary: boolean) => void;
      }
      if (event === "error") {
        this.onerror = callback as (event: { message?: string }) => void;
      }
      if (event === "close") {
        this.onclose = callback as (code: number, reason: Buffer) => void;
      }
    }

    send(data: string) {
      this.sent.push(data);
    }
  }
  return { FakeWebSocket, instances };
});

vi.mock("ws", () => ({ WebSocket: mocks.FakeWebSocket }));

function parseSent(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
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
    expect(
      (sessionUpdate.session as { input_audio_transcription?: unknown }).input_audio_transcription,
    ).toEqual({ language: "zh" });
  });

  it("omits the language hint when none is configured", () => {
    const { instance } = createConnection();
    instance.onopen?.();
    const sessionUpdate = parseSent(instance.sent[0]);
    expect(
      (sessionUpdate.session as { input_audio_transcription?: unknown }).input_audio_transcription,
    ).toBeUndefined();
  });

  it("encodes PCM frames as base64 input_audio_buffer.append events", () => {
    const { connection, instance } = createConnection();
    instance.onopen?.();
    instance.sent = [];
    const accepted = connection.sendPcm(new Uint8Array([0, 1, 2, 250, 255]));
    expect(accepted).toBe(true);
    const append = parseSent(instance.sent[0]) as { audio?: string; type?: string };
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
      expect(dependencies.onDrain).not.toHaveBeenCalled();
      instance.bufferedAmount = 1024 * 1024;
      vi.advanceTimersByTime(300);
      instance.bufferedAmount = 0;
      vi.advanceTimersByTime(300);
      expect(dependencies.onDrain).toHaveBeenCalledTimes(1);
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
