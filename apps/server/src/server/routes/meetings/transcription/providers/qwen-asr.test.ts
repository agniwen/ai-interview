import { describe, expect, it, vi } from "vitest";
import type { JsonValue } from "@app/db-schema/json";
import { MeetingProviderQuotaError, MeetingProviderResponseError } from "../provider";
import type { FinalTranscriptionAudioChunk } from "../provider";
import { createQwenAsrMeetingTranscriptionProvider } from "./qwen-asr";

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
  languageHint: null,
  model: "qwen3-asr-flash-filetrans",
  region: "qwen-cn-beijing",
};

function jsonResponse(body: JsonValue, status = 200) {
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  return {
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

function transcriptionResult() {
  return {
    transcripts: [
      {
        sentences: [
          { begin_time: 100, end_time: 1200, speaker_id: 0, text: "你好" },
          { begin_time: 1300, end_time: 2500, speaker_id: 1, text: " 请介绍下项目" },
        ],
      },
    ],
  };
}

function createProvider(options: {
  recognitionHints?: { terms: string[] };
  deleteAudioUrl?: (url: string, signal: AbortSignal) => Promise<void>;
  fetch?: typeof globalThis.fetch;
  model?: string;
  recordingIdentity?: FinalTranscriptionAudioChunk["recordingIdentity"];
  speakerDisplayName?: string;
  track?: FinalTranscriptionAudioChunk["track"];
  urlHost?: string;
}) {
  const chunk: FinalTranscriptionAudioChunk = {
    contentType: "audio/webm",
    endMs: 10_000,
    filePath: "/private/system.webm",
    index: 0,
    recordingIdentity: options.recordingIdentity,
    speakerDisplayName: options.speakerDisplayName,
    startMs: 0,
    track: options.track ?? "system",
  };
  return createQwenAsrMeetingTranscriptionProvider({
    apiKey: "sk-test",
    createAudioUrl: () => Promise.resolve("https://consented-audio.invalid/chunk.wav"),
    deleteAudioUrl: options.deleteAudioUrl,
    fetch:
      options.fetch ??
      vi.fn((url: string | URL | Request) => {
        const path = String(url);
        if (path.includes("/services/audio/asr/transcription")) {
          return Promise.resolve(
            jsonResponse({ output: { task_id: "task-1", task_status: "PENDING" } }),
          );
        }
        if (path.includes("/api/v1/tasks/")) {
          return Promise.resolve(
            jsonResponse({
              output: {
                results: [
                  {
                    subtask_status: "SUCCEEDED",
                    transcription_url: `https://${options.urlHost ?? "dashscope-result-bj.oss-cn-beijing.aliyuncs.com"}/result.json?Expires=1`,
                  },
                ],
                task_status: "SUCCEEDED",
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse(transcriptionResult()));
      }),
    model: options.model ?? "qwen3-asr-flash-filetrans",
    pollIntervalMs: 1,
    pollTimeoutMs: 10_000,
  }).transcribeFinal({ ...input, chunks: [chunk], recognitionHints: options.recognitionHints });
}

describe("Qwen ASR Meeting transcription provider", () => {
  it("bounds vocabulary and keeps context terms whole", async () => {
    const terms = Array.from({ length: 60 }, (_, i) => `术语${i}${"业".repeat(10)}`);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: "task-bounded" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            result: { transcription_url: "https://result.aliyuncs.com/result.json" },
            task_status: "SUCCEEDED",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(transcriptionResult()));
    await createProvider({
      fetch,
      model: "qwen-audio-3.0-asr-flash-filetrans",
      recognitionHints: { terms: ["", "x", "业".repeat(41), ...terms, terms[0] ?? ""] },
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(Object.keys(body.parameters.vocabulary)).toEqual(terms.slice(0, 50));
    const text: string = body.input.context[0].content[0].text;
    expect(text.length).toBeLessThanOrEqual(400);
    for (const term of text.split("、")) {
      expect(terms).toContain(term);
    }
  });

  it.each([
    ["业".repeat(15), true],
    ["新能源汽车动力电池热管理系统研发", false],
    [`IM${"业".repeat(13)}`, true],
    [`IM${"业".repeat(14)}`, false],
    ["𠮷".repeat(15), true],
    ["one two three four five six seven", true],
    ["one two three four five six seven eight", false],
  ] as const)("validates hotword limits independently from context (%s)", async (term, valid) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: "task-limits" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            result: { transcription_url: "https://result.aliyuncs.com/result.json" },
            task_status: "SUCCEEDED",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(transcriptionResult()));
    await createProvider({
      fetch,
      model: "qwen-audio-3.0-asr-flash-filetrans",
      recognitionHints: { terms: [term] },
    });
    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    if (valid) {
      expect(body.parameters.vocabulary).toEqual({ [term]: 2 });
    } else {
      expect(body.parameters).not.toHaveProperty("vocabulary");
    }
    expect(body.input.context[0].content[0].text).toBe(term);
  });

  it.each(["qwen-audio-3.0-asr-flash-filetrans", "qwen3-asr-flash-filetrans"])(
    "sends meeting terminology only to supported models (%s)",
    async (model) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(jsonResponse({ output: { task_id: "task-terms" } }))
        .mockResolvedValueOnce(
          jsonResponse({
            output: {
              result: { transcription_url: "https://result.aliyuncs.com/result.json" },
              task_status: "SUCCEEDED",
            },
          }),
        )
        .mockResolvedValueOnce(jsonResponse(transcriptionResult()));
      const transcript = await createProvider({
        fetch,
        model,
        recognitionHints: { terms: ["渠道回款", "核销", "IM"] },
      });
      const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
      if (model === "qwen-audio-3.0-asr-flash-filetrans") {
        expect(body.parameters.vocabulary).toEqual({ IM: 2, 核销: 2, 渠道回款: 2 });
        expect(body.input.context).toEqual([
          {
            content: [
              {
                text: "渠道回款、核销、IM",
                type: "input_text",
              },
            ],
            role: "user",
          },
        ]);
      } else {
        expect(body.parameters).not.toHaveProperty("vocabulary");
        expect(body.input).not.toHaveProperty("context");
      }
      expect(transcript.turns[0]?.text).toBe("你好");
    },
  );

  it("submits a DashScope task, polls, and maps sentences into canonical remote turns", async () => {
    const submit = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
      const path = String(url);
      if (path.includes("/services/audio/asr/transcription")) {
        return Promise.resolve(
          jsonResponse({ output: { task_id: "task-1", task_status: "PENDING" } }),
        );
      }
      if (path.includes("/api/v1/tasks/")) {
        return Promise.resolve(
          jsonResponse({
            output: {
              result: {
                transcription_url:
                  "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/result.json?Expires=1",
              },
              task_status: "SUCCEEDED",
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse(transcriptionResult()));
    });
    const deleteAudioUrl = vi.fn(() => Promise.resolve());

    const transcript = await createProvider({ deleteAudioUrl, fetch: submit });

    expect(transcript).toEqual({
      language: null,
      turns: [
        {
          confidence: null,
          endMs: 1200,
          speakerKey: "remote-1",
          startMs: 100,
          text: "你好",
          track: "remote",
        },
        {
          confidence: null,
          endMs: 2500,
          speakerKey: "remote-2",
          startMs: 1300,
          text: "请介绍下项目",
          track: "remote",
        },
      ],
    });
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const submitCall = submit.mock.calls[0] as unknown[];
    let submitBody: unknown;
    try {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      submitBody = JSON.parse(String(submitCall[1] && (submitCall[1] as RequestInit).body));
    } catch {
      throw new Error("mock submit body must be valid JSON");
    }
    expect(submitBody).toEqual({
      input: { file_url: "https://consented-audio.invalid/chunk.wav" },
      model: "qwen3-asr-flash-filetrans",
      parameters: {
        channel_id: [0],
        enable_itn: true,
      },
    });
    const pollCall = submit.mock.calls.find(([url]) => String(url).includes("/api/v1/tasks/"));
    expect(pollCall?.[1]).toMatchObject({ method: "GET" });
    expect(deleteAudioUrl).toHaveBeenCalledWith(
      "https://consented-audio.invalid/chunk.wav",
      expect.any(AbortSignal),
    );
  });

  it("keeps the microphone track local without sending unsupported diarization options", async () => {
    const submit = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("/services/audio/asr/transcription")) {
        return Promise.resolve(
          jsonResponse({ output: { task_id: "task-2", task_status: "PENDING" } }),
        );
      }
      if (String(url).includes("/api/v1/tasks/")) {
        return Promise.resolve(
          jsonResponse({
            output: {
              results: [
                {
                  subtask_status: "SUCCEEDED",
                  transcription_url:
                    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/result.json?Expires=1",
                },
              ],
              task_status: "SUCCEEDED",
            },
          }),
        );
      }
      return Promise.resolve(jsonResponse(transcriptionResult()));
    });

    const transcript = await createProvider({ fetch: submit, track: "microphone" });

    expect(transcript.turns).toEqual([
      expect.objectContaining({ speakerKey: "local", track: "local" }),
      expect.objectContaining({ speakerKey: "local", track: "local" }),
    ]);
    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const submitCall = submit.mock.calls[0] as unknown[];
    let submitBody: unknown;
    try {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      submitBody = JSON.parse(String(submitCall[1] && (submitCall[1] as RequestInit).body));
    } catch {
      throw new Error("mock submit body must be valid JSON");
    }
    expect(submitBody).toMatchObject({ parameters: { channel_id: [0], enable_itn: true } });
    expect(JSON.stringify(submitBody)).not.toContain("diarization");
  });

  it("marks a participant recording with its verified candidate display name", async () => {
    const transcript = await createProvider({
      speakerDisplayName: "候选人 · 刘夏江",
      track: "candidate",
    });

    expect(transcript.turns).toEqual([
      expect.objectContaining({
        speakerDisplayName: "候选人 · 刘夏江",
        speakerKey: "remote-1",
        track: "remote",
      }),
      expect.objectContaining({
        speakerDisplayName: "候选人 · 刘夏江",
        speakerKey: "remote-1",
        track: "remote",
      }),
    ]);
  });

  it.each(["system", "mixed", "participant-room-retry"] as const)(
    "enables supported speaker diarization for %s on Qwen Audio 3",
    async (track) => {
      const submit = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
        if (String(url).includes("/services/audio/asr/transcription")) {
          return Promise.resolve(
            jsonResponse({ output: { task_id: "task-audio-3", task_status: "PENDING" } }),
          );
        }
        if (String(url).includes("/api/v1/tasks/")) {
          return Promise.resolve(
            jsonResponse({
              output: {
                result: {
                  transcription_url:
                    "https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/result.json?Expires=1",
                },
                task_status: "SUCCEEDED",
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse(transcriptionResult()));
      });

      await createProvider({
        fetch: submit,
        model: "qwen-audio-3.0-asr-flash-filetrans",
        recordingIdentity:
          track === "participant-room-retry"
            ? {
                offsetMs: 0,
                participantIdentity: null,
                role: "unknown",
                sourceId: "room-retry",
              }
            : undefined,
        track,
      });

      const [submitCall] = submit.mock.calls;
      const submitBody = JSON.parse(String(submitCall?.[1]?.body));
      expect(submitBody.parameters).toMatchObject({
        channel_id: [0],
        diarization_enabled: true,
        enable_itn: true,
      });
    },
  );

  it("surfaces provider quota exhaustion", async () => {
    const fetch = vi.fn(() => Promise.resolve(jsonResponse({}, 429)));
    await expect(createProvider({ fetch })).rejects.toBeInstanceOf(MeetingProviderQuotaError);
  });

  it("rejects a task whose result URL is not an Aliyun host", async () => {
    await expect(createProvider({ urlHost: "evil.example.com" })).rejects.toBeInstanceOf(
      MeetingProviderResponseError,
    );
  });

  it("marks a failed task as a partial result and still cleans up the audio URL", async () => {
    const deleteAudioUrl = vi.fn(() => Promise.resolve());
    const fetch = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("/api/v1/tasks/")) {
        return Promise.resolve(
          jsonResponse({
            output: {
              code: "FILE_DOWNLOAD_FAILED",
              message: "audio URL is unavailable",
              results: [],
              task_status: "FAILED",
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ output: { task_id: "task-3", task_status: "PENDING" } }),
      );
    });
    await expect(createProvider({ deleteAudioUrl, fetch })).rejects.toThrow(
      "FILE_DOWNLOAD_FAILED: audio URL is unavailable",
    );
    expect(deleteAudioUrl).toHaveBeenCalledWith(
      "https://consented-audio.invalid/chunk.wav",
      expect.any(AbortSignal),
    );
  });

  it("treats a track without a valid speech fragment as an empty transcript", async () => {
    const fetch = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("/api/v1/tasks/")) {
        return Promise.resolve(
          jsonResponse({
            output: {
              code: "SUCCESS_WITH_NO_VALID_FRAGMENT",
              message: "SUCCESS_WITH_NO_VALID_FRAGMENT",
              task_status: "FAILED",
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({ output: { task_id: "task-empty", task_status: "PENDING" } }),
      );
    });

    await expect(createProvider({ fetch, track: "microphone" })).resolves.toEqual({
      language: null,
      turns: [],
    });
  });
});
