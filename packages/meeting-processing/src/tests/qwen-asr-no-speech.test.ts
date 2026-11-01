import { expect, it, vi } from "vitest";
import { MeetingProviderResponseError } from "../meeting-transcription-provider-response-error";
import { createQwenAsrMeetingTranscriptionProvider } from "../qwen-asr-meeting-transcription-provider";

const chunk = {
  contentType: "audio/webm",
  endMs: 31_000,
  filePath: "chunk",
  index: 0,
  startMs: 30_000,
  track: "system" as const,
};

interface PollResponse {
  output: {
    code?: string;
    message?: string;
    results?: { code: string; message?: string; subtask_status: string }[];
    task_status: string;
  };
}

function readTaskWith(pollResponse: PollResponse) {
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(pollResponse)));
  const provider = createQwenAsrMeetingTranscriptionProvider({
    apiKey: "test-key",
    createAudioUrl: () => Promise.resolve("https://audio.invalid/segment"),
    fetch: fetcher,
    model: "qwen-audio-3.1-asr-flash-filetrans",
  });
  return provider.readTask({
    chunk,
    languageHint: "zh",
    signal: new AbortController().signal,
    taskId: "task",
  });
}

it.each(["ASR_RESPONSE_HAVE_NO_WORDS", "SUCCESS_WITH_NO_VALID_FRAGMENT"])(
  "treats a failed task whose audio has no speech (%s) as an empty transcript",
  async (code) => {
    await expect(
      readTaskWith({ output: { code, message: code, task_status: "FAILED" } }),
    ).resolves.toEqual({ state: "ready", transcript: { language: "zh", turns: [] } });
  },
);

it("treats subtasks that all report no speech as an empty transcript", async () => {
  await expect(
    readTaskWith({
      output: {
        results: [
          {
            code: "ASR_RESPONSE_HAVE_NO_WORDS",
            message: "ASR_RESPONSE_HAVE_NO_WORDS",
            subtask_status: "FAILED",
          },
        ],
        task_status: "SUCCEEDED",
      },
    }),
  ).resolves.toEqual({ state: "ready", transcript: { language: "zh", turns: [] } });
});

it("still fails tasks that failed for reasons other than missing speech", async () => {
  await expect(
    readTaskWith({
      output: { code: "FILE_DOWNLOAD_FAILED", message: "download failed", task_status: "FAILED" },
    }),
  ).rejects.toBeInstanceOf(MeetingProviderResponseError);
  await expect(
    readTaskWith({
      output: {
        results: [{ code: "FILE_DOWNLOAD_FAILED", subtask_status: "FAILED" }],
        task_status: "SUCCEEDED",
      },
    }),
  ).rejects.toBeInstanceOf(MeetingProviderResponseError);
});
