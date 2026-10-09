import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@app/db-schema/json";
import {
  createQwenRealtimeTranscriptionAuthorization,
  DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
  MAX_MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS,
} from "./qwen-realtime";

function jsonResponse(body: JsonValue, status = 200) {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return {
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function createAuthorization(options: {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  language?: string;
  model?: string;
  ttlSeconds?: number;
  track?: "microphone" | "system";
}) {
  return createQwenRealtimeTranscriptionAuthorization(
    {
      captureId: "00000000-0000-4000-8000-000000000077",
      language: options.language,
      track: options.track ?? "microphone",
    },
    {
      apiKey: options.apiKey ?? "sk-test",
      baseUrl: options.baseUrl ?? "https://dashscope.aliyuncs.com",
      fetch: options.fetch,
      model: options.model ?? DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
      tokenTtlSeconds: options.ttlSeconds,
    },
  );
}

describe("createQwenRealtimeTranscriptionAuthorization", () => {
  it("keeps the legacy protocol endpoint when the old model is explicitly configured", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ expires_at: 1_752_654_000, token: "st-temp-token" }));
    const result = await createAuthorization({ fetch, model: "qwen3-asr-flash-realtime" });
    expect(result.baseUrl).toBe("wss://dashscope.aliyuncs.com/api-ws/v1/realtime");
  });
  it("mints a DashScope temp token and returns a short-lived qwen authorization", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ expires_at: 1_752_654_000, token: "st-temp-token" }));

    const authorization = await createAuthorization({ fetch, language: "zh" });

    expect(fetch).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/api/v1/tokens?expire_in_seconds=1800",
      expect.objectContaining({
        headers: { Authorization: "Bearer sk-test" },
        method: "POST",
      }),
    );
    expect(authorization).toEqual({
      baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
      clientSecret: "st-temp-token",
      expiresAt: "2025-07-16T08:20:00.000Z",
      language: "zh",
      model: DEFAULT_MEETING_TRANSCRIPTION_QWEN_LIVE_MODEL,
      provider: "qwen",
      track: "microphone",
    });
  });

  it("clamps the temp token TTL into the DashScope range", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ expires_at: 1_752_654_000, token: "st-temp-token" }));

    await createAuthorization({ fetch, ttlSeconds: 999_999 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        `expire_in_seconds=${MAX_MEETING_TRANSCRIPTION_QWEN_LIVE_TOKEN_TTL_SECONDS}`,
      ),
      expect.anything(),
    );

    await createAuthorization({ fetch, ttlSeconds: 0 });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("expire_in_seconds=1"),
      expect.anything(),
    );
  });

  it("derives the wss endpoint from an international base URL", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ expires_at: 1_752_654_000, token: "st-temp-token" }));

    const authorization = await createAuthorization({
      baseUrl: "https://dashscope-intl.aliyuncs.com",
      fetch,
    });

    expect(authorization.baseUrl).toBe("wss://dashscope-intl.aliyuncs.com/api-ws/v1/inference");
  });

  it("rejects a missing API key before calling DashScope", async () => {
    const fetch = vi.fn();
    await expect(createAuthorization({ apiKey: "", fetch })).rejects.toThrow(
      "ALIBABA_API_KEY is not set",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces non-2xx token responses as authorization failures", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ message: "InvalidApiKey" }, 401));
    await expect(createAuthorization({ fetch })).rejects.toThrow("failed with HTTP 401");
  });
});
