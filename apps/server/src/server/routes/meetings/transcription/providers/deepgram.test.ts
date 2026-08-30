import { describe, expect, it, vi } from "vitest";
import type { MeetingProviderResponseError } from "../provider";
import { MeetingProviderQuotaError } from "../provider";
import { createDeepgramMeetingTranscriptionProvider } from "./deepgram";

const input = {
  chunks: [
    {
      contentType: "audio/webm",
      endMs: 10_000,
      filePath: "/private/system.webm",
      index: 0,
      startMs: 0,
      track: "system" as const,
    },
  ],
  languageHint: "zh-CN",
  model: "nova-3",
  region: "us",
};

function createProvider(response: () => Promise<Response>) {
  return createDeepgramMeetingTranscriptionProvider({
    apiKey: "test-key",
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    fetch: response as typeof globalThis.fetch,
    readAudioFile: () => Promise.resolve(new Uint8Array([1])),
  });
}

describe("Deepgram Meeting transcription provider", () => {
  it("maps provider utterances into the canonical transcript only", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        Response.json({
          metadata: { duration: 10, request_id: "request-1" },
          results: {
            utterances: [
              {
                confidence: 0.9,
                end: 2.2,
                speaker: 7,
                start: 1.1,
                transcript: "你好 TypeScript",
              },
            ],
          },
        }),
      ),
    );
    const provider = createDeepgramMeetingTranscriptionProvider({
      apiKey: "test-key",
      fetch,
      readAudioFile: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    });

    await expect(provider.transcribeFinal(input)).resolves.toEqual({
      language: "zh-CN",
      turns: [
        {
          confidence: 0.9,
          endMs: 2200,
          speakerKey: "remote-1",
          startMs: 1100,
          text: "你好 TypeScript",
          track: "remote",
        },
      ],
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain("diarize_model=v2");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("mip_opt_out=true");
  });

  it("normalizes rate limits, partial output, and malformed output", async () => {
    await expect(
      createProvider(() => Promise.resolve(new Response(null, { status: 429 }))).transcribeFinal(
        input,
      ),
    ).rejects.toBeInstanceOf(MeetingProviderQuotaError);
    await expect(
      createProvider(() => Promise.resolve(new Response(null, { status: 206 }))).transcribeFinal(
        input,
      ),
    ).rejects.toMatchObject({
      code: "partial-result",
    } satisfies Partial<MeetingProviderResponseError>);
    await expect(
      createProvider(() =>
        Promise.resolve(Response.json({ native: "unexpected" })),
      ).transcribeFinal(input),
    ).rejects.toMatchObject({
      code: "malformed-response",
    } satisfies Partial<MeetingProviderResponseError>);
  });
});
