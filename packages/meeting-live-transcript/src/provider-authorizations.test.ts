import { describe, expect, it, vi } from "vitest";
import {
  createDeepgramRealtimeTranscriptionAuthorization,
  createQwenRealtimeTranscriptionAuthorization,
} from "./provider-authorizations";

describe("provider authorizations", () => {
  it("mints a Deepgram JWT without exposing the permanent key", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ access_token: "short-jwt", expires_in: 30 })),
    );

    const authorization = await createDeepgramRealtimeTranscriptionAuthorization(
      { track: "microphone" },
      { apiKey: "permanent-deepgram-key", fetch },
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://api.deepgram.com/v1/auth/grant",
      expect.objectContaining({
        body: JSON.stringify({ ttl_seconds: 30 }),
        headers: expect.objectContaining({ Authorization: "Token permanent-deepgram-key" }),
        method: "POST",
      }),
    );
    expect(authorization).toMatchObject({
      clientSecret: "short-jwt",
      language: "zh-CN",
      model: "nova-3",
      provider: "deepgram",
      track: "microphone",
    });
  });

  it("turns a forbidden token grant into an actionable permission error", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { err_code: "FORBIDDEN", err_msg: "Insufficient permissions." },
          { status: 403 },
        ),
      ),
    );

    await expect(
      createDeepgramRealtimeTranscriptionAuthorization(
        { track: "microphone" },
        { apiKey: "restricted-deepgram-key", fetch },
      ),
    ).rejects.toThrow("Member 或更高权限");
  });

  it("keeps the existing Qwen temporary-token flow", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(Response.json({ expires_at: 2_000_000_000, token: "short-qwen-key" })),
    );

    const authorization = await createQwenRealtimeTranscriptionAuthorization(
      { language: "zh", track: "system" },
      {
        apiKey: "permanent-qwen-key",
        baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        fetch,
        model: "qwen-audio-3.0-asr-flash-streaming",
      },
    );

    expect(authorization).toMatchObject({
      clientSecret: "short-qwen-key",
      provider: "qwen",
      track: "system",
    });
  });
});
