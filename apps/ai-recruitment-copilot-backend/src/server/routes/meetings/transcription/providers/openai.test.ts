import { describe, expect, it, vi } from "vitest";
import { createOpenAiMeetingTranscriptionProvider } from "./openai";

describe("OpenAI Meeting transcription adapter", () => {
  it("maps provider segments onto local and remote canonical turns with chunk offsets", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            language: "zh",
            segments: [{ end: 1.5, speaker: "A", start: 0.5, text: " 本地发言 " }],
            text: "本地发言",
          },
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            language: "zh",
            segments: [
              { end: 2, speaker: "A", start: 1, text: "远端甲" },
              { end: 3, speaker: "B", start: 2.1, text: "远端乙" },
            ],
            text: "远端甲远端乙",
          },
          { status: 200 },
        ),
      );
    const provider = createOpenAiMeetingTranscriptionProvider({
      apiKey: "test-key",
      fetch,
      readAudioFile: vi.fn(() => Promise.resolve(new Uint8Array([1, 2, 3]))),
    });

    await expect(
      provider.transcribeFinal({
        chunks: [
          {
            contentType: "audio/webm",
            endMs: 12_000,
            filePath: "/tmp/local.webm",
            index: 0,
            startMs: 10_000,
            track: "microphone",
          },
          {
            contentType: "audio/webm",
            endMs: 23_000,
            filePath: "/tmp/remote.webm",
            index: 0,
            startMs: 20_000,
            track: "system",
          },
        ],
        languageHint: null,
        model: "gpt-4o-transcribe-diarize",
        region: "openai-default",
      }),
    ).resolves.toEqual({
      language: "zh",
      turns: [
        {
          confidence: null,
          endMs: 11_500,
          speakerKey: "local",
          startMs: 10_500,
          text: "本地发言",
          track: "local",
        },
        {
          confidence: null,
          endMs: 22_000,
          speakerKey: "remote-1",
          startMs: 21_000,
          text: "远端甲",
          track: "remote",
        },
        {
          confidence: null,
          endMs: 23_000,
          speakerKey: "remote-2",
          startMs: 22_100,
          text: "远端乙",
          track: "remote",
        },
      ],
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const call of fetch.mock.calls) {
      const body = call[1]?.body;
      expect(body).toBeInstanceOf(FormData);
      expect((body as FormData).get("response_format")).toBe("diarized_json");
      expect((body as FormData).get("chunking_strategy")).toBe("auto");
    }
  });
});
