import { describe, expect, it } from "vitest";
import { canonicalizeDeepgramLiveTranscriptDraft } from "./deepgram-live-transcript";

describe("canonicalizeDeepgramLiveTranscriptDraft", () => {
  it("promotes final dual-track turns with section-relative timestamps and stable speakers", () => {
    const transcript = canonicalizeDeepgramLiveTranscriptDraft(
      {
        capturedAt: "2026-09-04T03:00:10.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        language: "zh-CN",
        model: "nova-3",
        provider: "deepgram",
        sections: [
          {
            id: "mic-1",
            sequence: 0,
            startedAt: "2026-09-04T03:00:01.000Z",
            track: "microphone",
          },
          {
            id: "system-1",
            sequence: 1,
            startedAt: "2026-09-04T03:00:02.000Z",
            track: "system",
          },
        ],
        turns: [
          {
            endMs: 1200,
            final: true,
            id: "system-1:one",
            sectionId: "system-1",
            speakerKey: "deepgram-speaker-2",
            startMs: 200,
            text: "远端第一句",
            track: "system",
          },
          {
            endMs: 800,
            final: true,
            id: "mic-1:one",
            sectionId: "mic-1",
            startMs: 100,
            text: "本地第一句",
            track: "microphone",
          },
          {
            endMs: 1900,
            final: true,
            id: "system-1:two",
            sectionId: "system-1",
            speakerKey: "deepgram-speaker-2",
            startMs: 1300,
            text: "远端第二句",
            track: "system",
          },
          {
            final: false,
            id: "system-1:interim",
            sectionId: "system-1",
            text: "未完成",
            track: "system",
          },
        ],
      },
      new Date("2026-09-04T03:00:00.000Z"),
    );

    expect(transcript).toEqual({
      language: "zh-CN",
      turns: [
        expect.objectContaining({
          endMs: 1800,
          speakerKey: "local",
          startMs: 1100,
          text: "本地第一句",
          track: "local",
        }),
        expect.objectContaining({
          endMs: 3200,
          speakerKey: "remote-1",
          startMs: 2200,
          text: "远端第一句",
          track: "remote",
        }),
        expect.objectContaining({
          endMs: 3900,
          speakerKey: "remote-1",
          startMs: 3300,
          text: "远端第二句",
          track: "remote",
        }),
      ],
    });
  });

  it("creates a valid empty transcript when Deepgram produced no final turns", () => {
    const transcript = canonicalizeDeepgramLiveTranscriptDraft(
      {
        capturedAt: "2026-09-04T03:00:10.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        model: "nova-3",
        provider: "deepgram",
        sections: [],
        turns: [],
      },
      new Date("2026-09-04T03:00:00.000Z"),
    );

    expect(transcript).toEqual({ language: null, turns: [] });
  });
});
