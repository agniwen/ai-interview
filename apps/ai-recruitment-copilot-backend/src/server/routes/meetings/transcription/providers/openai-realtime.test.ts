import { describe, expect, it, vi } from "vitest";
import { createOpenAiRealtimeTranscriptionAuthorization } from "./openai-realtime";

describe("OpenAI realtime transcription authorization", () => {
  it("mints only a short-lived transcription-scoped client secret", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        expires_at: 1_786_243_260,
        value: "ek_live_77",
      }),
    );

    await expect(
      createOpenAiRealtimeTranscriptionAuthorization(
        {
          captureId: "00000000-0000-4000-8000-000000000077",
          safetyIdentifier: "privacy-safe-user-hash",
          track: "system",
        },
        {
          apiKey: "server-only-key",
          fetch,
          model: "gpt-4o-mini-transcribe",
        },
      ),
    ).resolves.toEqual({
      clientSecret: "ek_live_77",
      expiresAt: "2026-08-09T02:41:00.000Z",
      model: "gpt-4o-mini-transcribe",
      provider: "openai",
      track: "system",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer server-only-key",
      "OpenAI-Safety-Identifier": "privacy-safe-user-hash",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      expires_after: { anchor: "created_at", seconds: 30 },
      session: {
        audio: {
          input: {
            format: { rate: 24_000, type: "audio/pcm" },
            transcription: { model: "gpt-4o-mini-transcribe" },
            turn_detection: { type: "server_vad" },
          },
        },
        type: "transcription",
      },
    });
    expect(JSON.stringify(init)).not.toContain("00000000-0000-4000-8000-000000000077");
  });

  it("does not expose provider error bodies", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("internal provider details", { status: 429 }));

    await expect(
      createOpenAiRealtimeTranscriptionAuthorization(
        {
          captureId: "00000000-0000-4000-8000-000000000077",
          safetyIdentifier: "privacy-safe-user-hash",
          track: "microphone",
        },
        { apiKey: "server-only-key", fetch, model: "gpt-4o-mini-transcribe" },
      ),
    ).rejects.toThrow("OpenAI realtime authorization failed with HTTP 429");
  });
});
