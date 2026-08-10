// oxlint-disable no-promise-executor-return, prefer-await-to-callbacks, promise/avoid-new -- The fake MessagePortMain mirrors Electron's event API.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerLiveTranscriptIpc } from "./live-transcript-ipc";
import type {
  DashScopeRealtimeWsConnection,
  DashScopeRealtimeWsDependencies,
} from "./live-transcript-ws";

interface FakePort {
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, callback: (payload: unknown) => void) => void;
  posted: unknown[];
  postMessage: (message: unknown) => void;
  start: ReturnType<typeof vi.fn>;
}

const mocks = vi.hoisted(() => ({
  connectDashScopeRealtimeWs: vi.fn(
    (_dependencies: DashScopeRealtimeWsDependencies): DashScopeRealtimeWsConnection => ({
      close: vi.fn(),
      sendPcm: vi.fn().mockReturnValue(true),
    }),
  ),
  ipcMainOn: vi.fn(),
  isTrustedMainFrame: vi.fn().mockReturnValue(true),
}));

vi.mock("electron", () => ({ ipcMain: { on: mocks.ipcMainOn } }));
vi.mock("./ipc", () => ({ isTrustedMainFrame: mocks.isTrustedMainFrame }));
vi.mock("./live-transcript-ws", () => ({
  connectDashScopeRealtimeWs: mocks.connectDashScopeRealtimeWs,
}));

function createFakePort(): FakePort {
  const listeners = new Map<string, ((payload: unknown) => void)[]>();
  const port: FakePort = {
    close: vi.fn(),
    emit: (event, payload) => {
      for (const callback of listeners.get(event) ?? []) {
        callback(payload);
      }
    },
    on: (event, callback) => {
      const existing = listeners.get(event) ?? [];
      existing.push(callback);
      listeners.set(event, existing);
    },
    postMessage: vi.fn((message: unknown) => {
      port.posted.push(message);
    }),
    posted: [],
    start: vi.fn(),
  };
  return port;
}

function registerAndGetHandler() {
  registerLiveTranscriptIpc();
  const registration = mocks.ipcMainOn.mock.calls.find(
    ([channel]) => channel === "meeting-live-transcript:port",
  );
  if (!registration) {
    throw new Error("live-transcript port IPC was not registered");
  }
  return registration[1] as (event: unknown, authorization: unknown) => void;
}

function validAuthorization() {
  return {
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    clientSecret: "st-temp-token",
    expiresAt: "2026-08-09T01:21:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
    track: "microphone",
  };
}

describe("registerLiveTranscriptIpc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens a DashScope connection with the temp token and relays events back", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    expect(mocks.connectDashScopeRealtimeWs).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
        language: undefined,
        model: "qwen3-asr-flash-realtime",
        token: "st-temp-token",
      }),
    );
    expect(port.start).toHaveBeenCalled();

    const wsDependencies = mocks.connectDashScopeRealtimeWs.mock.calls[0]?.[0];
    const onEvent = wsDependencies?.onEvent;
    onEvent?.({ type: "session.created" });
    expect(port.posted).toEqual([{ event: { type: "session.created" }, type: "event" }]);

    const onClose = wsDependencies?.onClose;
    onClose?.("provider-disconnected:1006");
    expect(port.posted.at(-1)).toEqual({ reason: "provider-disconnected:1006", type: "close" });

    const onDrain = wsDependencies?.onDrain;
    onDrain?.();
    expect(port.posted.at(-1)).toEqual({ type: "drain" });
  });

  it("forwards PCM frames to the WebSocket and closes on a close message", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    const connection = mocks.connectDashScopeRealtimeWs.mock.results[0]?.value as
      | DashScopeRealtimeWsConnection
      | undefined;
    port.emit("message", { data: { bytes: new Uint8Array([1, 2, 3]), type: "pcm" } });
    expect(connection?.sendPcm).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));

    port.emit("message", { data: { type: "close" } });
    expect(connection?.close).toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("closes the WebSocket when the renderer port closes", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());

    const connection = mocks.connectDashScopeRealtimeWs.mock.results[0]?.value as
      | DashScopeRealtimeWsConnection
      | undefined;
    port.emit("close");
    expect(connection?.close).toHaveBeenCalled();
  });

  it("rejects an untrusted main frame before opening any connection", () => {
    mocks.isTrustedMainFrame.mockReturnValueOnce(false);
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, validAuthorization());
    expect(mocks.connectDashScopeRealtimeWs).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("rejects a malformed authorization without opening a connection", () => {
    const handler = registerAndGetHandler();
    const port = createFakePort();
    handler({ ports: [port] }, { ...validAuthorization(), baseUrl: "https://evil.example.com" });
    expect(mocks.connectDashScopeRealtimeWs).not.toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it("rejects an extra port on the handshake", () => {
    const handler = registerAndGetHandler();
    const first = createFakePort();
    const second = createFakePort();
    handler({ ports: [first, second] }, validAuthorization());
    expect(mocks.connectDashScopeRealtimeWs).not.toHaveBeenCalled();
    expect(first.close).toHaveBeenCalled();
  });
});
