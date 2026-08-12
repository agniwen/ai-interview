import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingTranscriptResult } from "@arc/shared/meeting-transcription";
import {
  canCorrectMeetingTranscript,
  isTranscriptCorrectionConflict,
  MeetingTranscriptStageTurns,
  MeetingTranscriptView,
  splitTranscriptTurn,
  transcriptSeekSeconds,
} from "./meeting-transcript-panel";
import { ApiError } from "@/lib/client/api-error";

const readyTranscript: MeetingTranscriptResult = {
  error: null,
  revision: {
    basedOnRevisionId: null,
    createdAt: "2026-08-09T08:00:00.000Z",
    createdBy: null,
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
        speakerDisplayName: null,
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
        speakerDisplayName: null,
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

  it("renders the durable live draft while final transcription is pending", () => {
    const html = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry={false}
        onSeek={() => {}}
        result={{
          draft: {
            capturedAt: "2026-08-12T08:00:00.000Z",
            droppedAudioMs: 0,
            droppedPcmFrames: 0,
            error: null,
            sections: [
              {
                id: "system-1",
                sequence: 0,
                startedAt: "2026-08-12T07:59:00.000Z",
                track: "system",
              },
            ],
            turns: [
              {
                final: true,
                id: "system-1:turn-1",
                sectionId: "system-1",
                text: "候选人的实时回答",
                track: "system",
              },
            ],
          },
          error: null,
          revision: null,
          state: "pending",
        }}
      />,
    );

    expect(html).toContain("已保存的实时字幕草稿");
    expect(html).toContain("候选人的实时回答");
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

  it("matches the live transcript spacing and hover treatment on the completed page", () => {
    const html = renderToStaticMarkup(
      <MeetingTranscriptStageTurns turns={readyTranscript.revision?.turns ?? []} />,
    );

    expect(html).toContain('class="grid select-text"');
    expect(html).toContain("cursor-text");
    expect(html).toContain("hover:bg-foreground/4");
    expect(html).toContain("rounded-sm");
    expect(html).toContain("p-1");
    expect(html).not.toContain("gap-3");
  });

  it("distinguishes human display names from stable speaker keys", () => {
    const corrected: MeetingTranscriptResult = {
      ...readyTranscript,
      revision: readyTranscript.revision
        ? {
            ...readyTranscript.revision,
            basedOnRevisionId: readyTranscript.revision.id,
            createdBy: { id: "editor-78", name: "Lin" },
            id: "revision-human-78",
            kind: "human",
            revision: 2,
            turns: readyTranscript.revision.turns.map((turn) => ({
              ...turn,
              speakerDisplayName: turn.speakerKey === "local" ? "面试官" : "候选人",
            })),
          }
        : null,
    };
    const html = renderToStaticMarkup(
      <MeetingTranscriptView
        canRetry={false}
        onRetry={() => {}}
        onSeek={() => {}}
        result={corrected}
      />,
    );

    expect(html).toContain("人工修订 revision 2");
    expect(html).toContain("面试官");
    expect(html).toContain("候选人");
  });

  it("allows editors to split transcript structure while viewers remain read-only", () => {
    expect(canCorrectMeetingTranscript("editor")).toBe(true);
    expect(canCorrectMeetingTranscript("viewer")).toBe(false);
    const source = readyTranscript.revision?.turns[0];
    if (!source) {
      throw new Error("expected a source transcript turn");
    }
    const split = splitTranscriptTurn(source);
    expect(split).toHaveLength(2);
    expect(split?.[0]).toMatchObject({ endMs: 2375, text: "你好，我们" });
    expect(split?.[1]).toMatchObject({ startMs: 2375, text: "开始吧。" });
  });

  it("recognizes a stale correction so the panel can refresh to the winning revision", () => {
    expect(isTranscriptCorrectionConflict(new ApiError("revision conflict", { status: 409 }))).toBe(
      true,
    );
    expect(isTranscriptCorrectionConflict(new ApiError("invalid", { status: 400 }))).toBe(false);
  });
});
