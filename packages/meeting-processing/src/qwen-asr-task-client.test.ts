import { expect, it, vi } from "vitest";
import { createQwenAsrMeetingTranscriptionProvider } from "./qwen-asr-meeting-transcription-provider";

it("resumes a persisted provider task with one bounded poll and no resubmission", async () => {
  const responses = [
    { output: { task_id: "durable-task", task_status: "PENDING" } },
    { output: { task_status: "RUNNING" } },
    {
      output: {
        result: { transcription_url: "https://results.aliyuncs.com/result" },
        task_status: "SUCCEEDED",
      },
    },
    {
      transcripts: [
        { sentences: [{ begin_time: 100, end_time: 500, speaker_id: 1, text: "保留的分段" }] },
      ],
    },
  ];
  const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(responses.shift())));
  const dependencies = {
    apiKey: "test-key",
    createAudioUrl: () => Promise.resolve("https://audio.invalid/segment"),
    fetch: fetcher,
    model: "qwen-audio-3.0-asr-flash-filetrans",
  };
  const chunk = {
    contentType: "audio/webm",
    endMs: 31_000,
    filePath: "chunk",
    index: 0,
    startMs: 30_000,
    track: "system" as const,
  };
  const { signal } = new AbortController();
  const first = createQwenAsrMeetingTranscriptionProvider(dependencies);
  const taskId = await first.submitTask({
    audioUrl: "https://audio.invalid/segment",
    chunk,
    signal,
  });
  expect(await first.readTask({ chunk, languageHint: "zh", signal, taskId })).toEqual({
    state: "pending",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  const reopened = createQwenAsrMeetingTranscriptionProvider(dependencies);
  expect(await reopened.readTask({ chunk, languageHint: "zh", signal, taskId })).toMatchObject({
    state: "ready",
    transcript: {
      language: "zh",
      turns: [{ endMs: 30_500, speakerKey: "remote-1", startMs: 30_100, text: "保留的分段" }],
    },
  });
  expect(fetcher.mock.calls.filter(([, input]) => input?.method === "POST")).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
