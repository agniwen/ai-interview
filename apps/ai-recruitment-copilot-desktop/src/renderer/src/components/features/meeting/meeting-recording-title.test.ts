import { describe, expect, it } from "vitest";
import type { LocalMeetingSession } from "../../../../../preload/local-meeting-session";
import { getRecordingTitleCandidate } from "./meeting-recording-title";

const CAPTURE_ID = "00000000-0000-4000-8000-000000000077";

function interruptedSession(overrides: Partial<LocalMeetingSession> = {}): LocalMeetingSession {
  return {
    endedAt: null,
    id: CAPTURE_ID,
    liveTranscriptDraft: {
      capturedAt: "2026-08-12T16:27:20.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [],
      turns: [
        {
          final: true,
          id: "turn-1",
          sectionId: "section-1",
          text: "新手机外观与配件体验讨论",
          track: "system",
        },
      ],
    },
    recruitingRecordId: null,
    segmentCount: 1,
    startedAt: "2026-08-12T16:26:26.000Z",
    state: "interrupted",
    title: "录制记录-2608130026",
    updatedAt: "2026-08-12T16:27:31.000Z",
    ...overrides,
  };
}

describe("recording title candidate", () => {
  it("uses the durable transcript to recover a title for an interrupted session", () => {
    expect(
      getRecordingTitleCandidate(
        interruptedSession(),
        null,
        Date.parse("2026-08-12T16:27:31.000Z"),
      ),
    ).toEqual({
      captureId: CAPTURE_ID,
      startedAt: "2026-08-12T16:26:26.000Z",
      transcript: "新手机外观与配件体验讨论",
    });
  });

  it("does not overwrite a title edited by the user", () => {
    expect(
      getRecordingTitleCandidate(
        interruptedSession({ title: "我的手机体验" }),
        null,
        Date.parse("2026-08-12T16:27:31.000Z"),
      ),
    ).toBeNull();
  });
});
