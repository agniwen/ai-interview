// oxlint-disable prefer-add-event-listener, prefer-await-to-callbacks -- The fake must mirror the real ws event API (`.on()` + `on*` handlers).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectDashScopeRealtimeWs } from "./live-transcript-ws";
import type { DashScopeRealtimeWsDependencies } from "./live-transcript-ws";

interface FakeWebSocketInstance {
  bufferedAmount: number;
  options: { headers?: Record<string, string>; handshakeTimeout?: number };
  readyState: number;
  sent: (string | Uint8Array)[];
  url: string;
  onclose: ((code: number, reason: Buffer) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  onmessage: ((data: Buffer | string, isBinary: boolean) => void) | null;
  onopen: (() => void) | null;
  terminate: ReturnType<typeof vi.fn>;
  close: () => void;
  send: (data: string | Uint8Array, callback?: (error?: Error) => void) => void;
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
    sent: (string | Uint8Array)[] = [];
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

    send(data: string | Uint8Array, callback?: (error?: Error) => void) {
      this.sent.push(data);
      callback?.();
    }
  }
  return { FakeWebSocket, instances };
});

function parseSent(raw: string | Uint8Array | undefined): ParsedWebSocketMessage {
  if (!raw || raw instanceof Uint8Array) {
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

  it("makes accepted timed PCM available before notifying the renderer and feeds corrected context back", () => {
    const onEvent = vi.fn();
    const { connection, instance } = createConnection({
      model: "qwen-audio-3.0-asr-flash-streaming",
      onEvent,
    });
    instance.onopen?.();
    const run = JSON.parse(String(instance.sent[0]));
    const emit = (event: string, payload = {}) =>
      instance.onmessage?.(
        JSON.stringify({ header: { event, task_id: run.header.task_id }, payload }),
        false,
      );
    emit("task-started");
    connection.sendPcm(Buffer.alloc(32_000, 7));
    onEvent.mockImplementation((event) => {
      if (event.type === "conversation.item.input_audio_transcription.completed") {
        expect(connection.takeCorrectionAudio?.("0", "实时")).toEqual(Buffer.alloc(32_000, 7));
      }
    });
    emit("result-generated", {
      output: {
        sentence: {
          begin_time: 0,
          end_time: 1000,
          sentence_end: true,
          sentence_id: 0,
          text: "实时",
        },
      },
    });
    expect(connection.takeCorrectionAudio?.("0", "实时")).toBeNull();
    connection.sendCorrectionContext?.(["校正后的术语"]);
    expect(JSON.parse(String(instance.sent.at(-1)))).toMatchObject({
      header: { action: "continue-task" },
      payload: { input: { context: [{ content: [{ text: "校正后的术语" }] }] } },
    });
    connection.close();
  });

  it("starts the new task protocol before sending binary PCM and normalizes timed sentences", () => {
    const { connection, dependencies, instance } = createConnection({
      baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      language: "zh",
      model: "qwen-audio-3.0-asr-flash-streaming",
    });
    instance.onopen?.();
    const run = JSON.parse(String(instance.sent[0]));
    expect(instance.url).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/inference");
    expect(run).toMatchObject({
      header: { action: "run-task", streaming: "duplex" },
      payload: {
        model: "qwen-audio-3.0-asr-flash-streaming",
        parameters: { format: "pcm", heartbeat: true, language_hints: ["zh"], sample_rate: 16_000 },
      },
    });
    const emit = (event: string, payload = {}) =>
      instance.onmessage?.(
        JSON.stringify({ header: { event, task_id: run.header.task_id }, payload }),
        false,
      );
    expect(connection.sendPcm(new Uint8Array(320))).toBe(false);
    emit("task-started");
    expect(dependencies.onEvent).toHaveBeenCalledWith({ type: "session.created" });
    const pcm = new Uint8Array(320);
    expect(connection.sendPcm(pcm)).toBe(true);
    expect(instance.sent.at(-1)).toEqual(pcm);
    emit("result-generated", {
      output: {
        sentence: {
          begin_time: 0,
          end_time: null,
          sentence_end: false,
          sentence_id: 1,
          text: "你好",
        },
      },
    });
    emit("result-generated", {
      output: {
        sentence: {
          begin_time: 0,
          end_time: 10,
          sentence_end: true,
          sentence_id: 1,
          text: "你好。",
        },
      },
    });
    expect(dependencies.onEvent).toHaveBeenCalledWith({
      item_id: "1",
      text: "你好",
      type: "conversation.item.input_audio_transcription.text",
    });
    expect(dependencies.onEvent).toHaveBeenCalledWith({
      item_id: "1",
      transcript: "你好。",
      type: "conversation.item.input_audio_transcription.completed",
    });
    emit("task-failed");
    expect(dependencies.onClose).toHaveBeenCalledWith("provider-error:task-failed");
    expect(instance.terminate).toHaveBeenCalled();
    expect(connection.sendPcm(pcm)).toBe(false);
  });

  it("ignores heartbeat and foreign-task events and sends finish-task with the same task id", () => {
    vi.useFakeTimers();
    try {
      const { connection, dependencies, instance } = createConnection({
        model: "qwen-audio-3.0-asr-flash-streaming",
      });
      instance.onopen?.();
      const run = JSON.parse(String(instance.sent[0]));
      instance.onmessage?.(
        JSON.stringify({ header: { event: "task-started", task_id: "another-task" } }),
        false,
      );
      instance.onmessage?.(
        JSON.stringify({
          header: { event: "result-generated", task_id: run.header.task_id },
          payload: {
            output: {
              sentence: { begin_time: 0, heartbeat: true, sentence_id: 0, text: "ignored" },
            },
          },
        }),
        false,
      );
      expect(dependencies.onEvent).not.toHaveBeenCalled();
      connection.close();
      expect(JSON.parse(String(instance.sent.at(-1)))).toMatchObject({
        header: { action: "finish-task", task_id: run.header.task_id },
        payload: { input: {} },
      });
      vi.advanceTimersByTime(2000);
      expect(instance.terminate).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
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
