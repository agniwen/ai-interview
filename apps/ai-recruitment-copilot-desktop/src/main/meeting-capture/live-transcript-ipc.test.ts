// oxlint-disable no-promise-executor-return, prefer-await-to-callbacks, promise/avoid-new -- The fake MessagePort mirrors Electron's event API.
import { runInNewContext } from "node:vm";
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

function registerAndGetHandler() {
  registerLiveTranscriptIpcHandlers({
    connect: connectDashScopeRealtimeWsMock,
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
    clientSecret: "st-temp-token",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
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
