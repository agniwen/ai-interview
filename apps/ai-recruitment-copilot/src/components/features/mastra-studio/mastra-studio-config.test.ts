import { describe, expect, it } from "vitest";
import {
  EMBEDDED_MASTRA_API_PREFIX,
  getEmbeddedMastraApiUrl,
  getEmbeddedMastraWebSocketUrl,
} from "./mastra-studio-config";

describe("embedded Mastra Studio URLs", () => {
  const origin = "https://studio.example.com";

  it("routes HTTP resources through the same-origin Mastra API mount", () => {
    const url = new URL(getEmbeddedMastraApiUrl("/swagger-ui", origin));

    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe(`${EMBEDDED_MASTRA_API_PREFIX}/swagger-ui`);
  });

  it("routes browser streams through the same API mount with a WebSocket protocol", () => {
    const url = new URL(
      getEmbeddedMastraWebSocketUrl("/browser/agent-1/stream?threadId=thread-1", origin),
    );

    expect(url.pathname).toBe(`${EMBEDDED_MASTRA_API_PREFIX}/browser/agent-1/stream`);
    expect(url.searchParams.get("threadId")).toBe("thread-1");
    expect(url.protocol).toBe("wss:");
  });
});
