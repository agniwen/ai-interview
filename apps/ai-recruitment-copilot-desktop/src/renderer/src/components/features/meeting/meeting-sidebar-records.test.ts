import { describe, expect, it } from "vitest";
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import {
  collectLocalMeetingSidebarRecords,
  collectRemotelyVisibleVerifiedIds,
} from "./meeting-sidebar-records";

const CAPTURE_ID = "00000000-0000-4000-8000-000000000077";

function snapshot(overrides: Partial<MeetingCaptureSnapshot>): MeetingCaptureSnapshot {
  return {
    active: null,
    error: null,
    localSessions: [],
    phase: "idle",
    recoverable: [],
    recoveryComplete: true,
    saved: null,
    workspaceSaves: [],
    ...overrides,
  };
}

describe("collectLocalMeetingSidebarRecords", () => {
  it("keeps a newly ended local session visible before workspace upload finishes", () => {
    const records = collectLocalMeetingSidebarRecords(
      snapshot({
        phase: "saved-local",
        saved: {
          captureId: CAPTURE_ID,
          container: {
            independentlyDecodableFragments: false,
            kind: "ordered-mediarecorder-stream",
          },
          manifestSha256: "a".repeat(64),
          possibleTailGap: false,
          recruitingRecordId: null,
          savedAt: "2026-08-12T09:01:00.000Z",
          startedAt: "2026-08-12T09:00:00.000Z",
          status: "saved-local",
          tracks: {
            microphone: { bytes: 10, committedThroughMs: 60_000, fragmentCount: 4 },
            system: { bytes: 10, committedThroughMs: 60_000, fragmentCount: 4 },
          },
        },
        workspaceSaves: [
          {
            captureId: CAPTURE_ID,
            error: null,
            recoveryCopyDeleteAfter: null,
            state: "uploading",
          },
        ],
      }),
    );

    expect(records).toEqual([{ captureId: CAPTURE_ID, state: "saved-local", title: "本地录音" }]);
  });

  it("hands a verified local session over only after the same remote id is visible", () => {
    const verified = snapshot({
      localSessions: [
        {
          endedAt: "2026-08-12T09:01:00.000Z",
          id: CAPTURE_ID,
          liveTranscriptDraft: null,
          recruitingRecordId: null,
          segmentCount: 1,
          startedAt: "2026-08-12T09:00:00.000Z",
          state: "workspace-verified",
          title: "录制记录",
          updatedAt: "2026-08-12T09:01:00.000Z",
        },
      ],
    });

    expect(collectRemotelyVisibleVerifiedIds(verified, new Set())).toEqual([]);
    expect(collectRemotelyVisibleVerifiedIds(verified, new Set([CAPTURE_ID]))).toEqual([
      CAPTURE_ID,
    ]);
  });
});
