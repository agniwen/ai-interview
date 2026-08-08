import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingTranscriptResult } from "@arc/shared/meeting-transcription";
import { MeetingTranscriptView, transcriptSeekSeconds } from "./meeting-transcript-panel";

const readyTranscript: MeetingTranscriptResult = {
  error: null,
  revision: {
    createdAt: "2026-08-09T08:00:00.000Z",
    id: "revision-76",
    kind: "final",
    language: "zh",
    model: "gpt-4o-transcribe-diarize",
    provider: "openai",
    region: "openai-default",
    revision: 1,
    turns: [
      {
        confidence: 0.93,
        endMs: 3500,
        id: "turn-1",
        sequence: 0,
        speakerKey: "local",
        startMs: 1250,
        text: "你好，我们开始吧。",
        track: "local",
      },
      {
        confidence: null,
        endMs: 7000,
        id: "turn-2",
        sequence: 1,
        speakerKey: "remote-1",
        startMs: 4000,
        text: "好的。",
        track: "remote",
      },
    ],
  },
  state: "ready",
};

describe("Final Meeting Transcript panel", () => {
  it("distinguishes pending, processing and failed states", () => {
    const pending = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry={false}
        onRetry={() => {}}
        onSeek={() => {}}
        result={{ error: null, revision: null, state: "pending" }}
      />,
    );
    expect(pending).toContain("等待 Workspace 管理员配置并选择转录服务");

    const processing = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry={false}
        onRetry={() => {}}
        onSeek={() => {}}
        result={{ error: null, revision: null, state: "processing" }}
      />,
    );
    expect(processing).toContain("正在生成 Final Meeting Transcript");

    const failed = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry
        onRetry={() => {}}
        onSeek={() => {}}
        result={{ error: "provider unavailable", revision: null, state: "failed" }}
      />,
    );
    expect(failed).toContain("provider unavailable");
    expect(failed).toContain("重试最终转录");
  });

  it("renders provider-neutral final turns and maps timestamps to playback seconds", () => {
    const html = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry={false}
        onRetry={() => {}}
        onSeek={() => {}}
        result={readyTranscript}
      />,
    );

    expect(html).toContain("00:01");
    expect(html).toContain("本机");
    expect(html).toContain("远端 1");
    expect(html).toContain("你好，我们开始吧。");
    expect(transcriptSeekSeconds(1250)).toBe(1.25);
  });
});
