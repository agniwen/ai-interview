import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@arc/db-schema/json";
import type { MeetingProviderResponseError } from "../provider";
import { createTingwuMeetingTranscriptionProvider } from "./tingwu";

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
  languageHint: "zh",
  model: "default",
  region: "cn-beijing",
};

function createProvider(result: JsonValue, status = "COMPLETED") {
  return createTingwuMeetingTranscriptionProvider({
    createAudioUrl: () => Promise.resolve("https://consented-audio.invalid/case.webm"),
    createTask: () => Promise.resolve({ taskId: "task-1" }),
    fetchResult: () => Promise.resolve(result),
    pollTask: () => Promise.resolve({ resultUrl: "https://result.invalid/task-1", status }),
  });
}

describe("Tingwu Meeting transcription provider", () => {
  it("polls an offline task and maps word timestamps into canonical turns", async () => {
    const createTask = vi.fn(() => Promise.resolve({ taskId: "task-1" }));
    const provider = createTingwuMeetingTranscriptionProvider({
      createAudioUrl: () => Promise.resolve("https://consented-audio.invalid/case.webm"),
      createTask,
      fetchResult: vi.fn(() =>
        Promise.resolve({
          TaskId: "task-1",
          Transcription: {
            AudioInfo: { Duration: 10_000, Language: "fspk" },
            Paragraphs: [
              {
                SpeakerId: "7",
                Words: [
                  { End: 1200, Start: 200, Text: "你好" },
                  { End: 1800, Start: 1300, Text: " TypeScript" },
                ],
              },
            ],
          },
        }),
      ),
      pollTask: vi.fn(() =>
        Promise.resolve({ resultUrl: "https://result.invalid/task-1", status: "COMPLETED" }),
      ),
    });

    await expect(provider.transcribeFinal(input)).resolves.toEqual({
      language: "fspk",
      turns: [
        {
          confidence: null,
          endMs: 1800,
          speakerKey: "remote-1",
          startMs: 200,
          text: "你好 TypeScript",
          track: "remote",
        },
      ],
    });
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ language: "fspk" }));
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        taskKey: expect.stringMatching(/^meeting-eval-[\da-f-]{36}-system-0$/),
      }),
    );
  });

  it("rejects partial and malformed task results at the adapter boundary", async () => {
    await expect(createProvider({}, "ONGOING").transcribeFinal(input)).rejects.toMatchObject({
      code: "partial-result",
    } satisfies Partial<MeetingProviderResponseError>);
    await expect(createProvider({ bad: true }).transcribeFinal(input)).rejects.toMatchObject({
      code: "malformed-response",
    } satisfies Partial<MeetingProviderResponseError>);
  });

  it("accepts a completed silent result without inventing a partial response", async () => {
    await expect(
      createProvider({
        TaskId: "task-1",
        Transcription: {
          AudioInfo: { Duration: 10_000, Language: "fspk" },
          Paragraphs: [],
        },
      }).transcribeFinal(input),
    ).resolves.toEqual({ language: "fspk", turns: [] });
  });
});
