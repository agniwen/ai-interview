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

  it("preserves distinct Deepgram speakers captured on the microphone track", () => {
    const transcript = canonicalizeDeepgramLiveTranscriptDraft(
      {
        capturedAt: "2026-09-04T03:00:10.000Z",
        droppedAudioMs: 0,
        droppedPcmFrames: 0,
        error: null,
        model: "nova-3",
        provider: "deepgram",
        sections: [
          {
            id: "mic-1",
            sequence: 0,
            startedAt: "2026-09-04T03:00:00.000Z",
            track: "microphone",
          },
        ],
        turns: [
          {
            endMs: 900,
            final: true,
            id: "mic-1:first",
            sectionId: "mic-1",
            speakerKey: "microphone:deepgram-speaker-0",
            startMs: 100,
            text: "第一位说话人",
            track: "microphone",
          },
          {
            endMs: 1800,
            final: true,
            id: "mic-1:second",
            sectionId: "mic-1",
            speakerKey: "microphone:deepgram-speaker-1",
            startMs: 1000,
            text: "第二位说话人插话",
            track: "microphone",
          },
          {
            endMs: 2600,
            final: true,
            id: "mic-1:third",
            sectionId: "mic-1",
            speakerKey: "microphone:deepgram-speaker-0",
            startMs: 1900,
            text: "第一位继续说",
            track: "microphone",
          },
        ],
      },
      new Date("2026-09-04T03:00:00.000Z"),
    );

    expect(transcript.turns.map((turn) => [turn.speakerKey, turn.text])).toEqual([
      ["local", "第一位说话人"],
      ["remote-1", "第二位说话人插话"],
      ["local", "第一位继续说"],
    ]);
    expect(transcript.turns[1]).toMatchObject({
      attribution: { method: "unconfirmed", role: "unknown" },
      track: "remote",
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
