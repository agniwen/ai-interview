import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMessagePortHandoff } from "./message-port-handoff";

const postMessage = vi.fn();

function loadPreloadBeforeCsp() {
  // SAFETY: The handoff only reads location.origin and compares window identity.
  const page = { location: { origin: "http://localhost:5173" } } as Window;
  const listener = createMessagePortHandoff({ page, postMessage });
  const { port1, port2 } = new MessageChannel();

  // Electron runs preload before the page's CSP meta tag takes effect. Zod has
  // already probed eval support when the later handshake arrives under CSP.
  vi.stubGlobal("Function", function blockedCodeGeneration() {
    throw new EvalError("Code generation from strings disallowed for this context");
  });
  return { listener, page, port1, port2 };
}

function authorization(track: "microphone" | "system") {
  return {
    baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
    clientSecret: "test-only-token",
    expiresAt: "2099-01-01T00:00:00.000Z",
    model: "qwen3-asr-flash-realtime",
    provider: "qwen",
    track,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preload live transcript handoff under CSP", () => {
  it("continues forwarding the oRPC port under CSP", () => {
    const { listener, page, port1, port2 } = loadPreloadBeforeCsp();
    try {
      listener({
        data: "start-orpc-client",
        origin: page.location.origin,
        ports: [port2],
        source: page,
      });
      vi.unstubAllGlobals();
      expect(postMessage.mock.calls[0]?.slice(0, 2)).toEqual(["start-orpc-server", null]);
      expect(postMessage.mock.calls[0]?.[2][0]).toBe(port2);
    } finally {
      port1.close();
      port2.close();
    }
  });

  it.each(["origin", "source", "ports"])("rejects an untrusted %s", (boundary) => {
    const { listener, page, port1, port2 } = loadPreloadBeforeCsp();
    try {
      listener({
        data: {
          authorization: authorization("microphone"),
          type: "start-meeting-live-transcript-client",
        },
        origin: boundary === "origin" ? "https://other.example" : page.location.origin,
        ports: boundary === "ports" ? [] : [port2],
        source: boundary === "source" ? null : page,
      });
      vi.unstubAllGlobals();
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      port1.close();
      port2.close();
    }
  });

  it.each(["microphone", "system"] as const)(
    "forwards the %s port after string code generation is disabled",
    (track) => {
      const { listener, page, port1, port2 } = loadPreloadBeforeCsp();
      try {
        const input = authorization(track);
        listener({
          data: { authorization: input, type: "start-meeting-live-transcript-client" },
          origin: page.location.origin,
          ports: [port2],
          source: page,
        });
        vi.unstubAllGlobals();
        expect(postMessage).toHaveBeenCalledWith("meeting-live-transcript:port", input, [port2]);
      } finally {
        port1.close();
        port2.close();
      }
    },
  );

  it.each([
    { ...authorization("microphone"), clientSecret: undefined },
    { ...authorization("microphone"), track: "unknown" },
    { ...authorization("microphone"), unexpected: true },
  ])("still rejects malformed authorization under CSP: %j", (input) => {
    const { listener, page, port1, port2 } = loadPreloadBeforeCsp();
    try {
      listener({
        data: { authorization: input, type: "start-meeting-live-transcript-client" },
        origin: page.location.origin,
        ports: [port2],
        source: page,
      });
      vi.unstubAllGlobals();
      expect(postMessage).not.toHaveBeenCalled();
    } finally {
      port1.close();
      port2.close();
    }
  });
});
