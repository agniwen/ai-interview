import { describe, expect, it } from "vitest";
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import type { LiveTranscriptDraftSnapshot } from "@/lib/meeting-capture/live-transcript-draft";
import {
  captureSnapshotAtom,
  createMeetingRecordingStateBridge,
  liveTranscriptDraftAtom,
  meetingLiveSummaryAtom,
} from "./meeting-recording-store";
import type {
  MeetingLiveSummaryControllerSnapshot,
  MeetingLiveSummarySource,
} from "@/lib/meeting-capture/live-summary-controller";

function observable<Value>(initial: Value) {
  let value = initial;
  const listeners = new Set<(next: Value) => void>();
  return {
    observe(listener: (next: Value) => void) {
      listeners.add(listener);
      listener(value);
      return () => listeners.delete(listener);
    },
    publish(next: Value) {
      value = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

const capture: MeetingCaptureSnapshot = {
  active: null,
  error: null,
  localSessions: [],
  phase: "idle",
  recoverable: [],
  recoveryComplete: true,
  saved: null,
  workspaceSaves: [],
};

const draft: LiveTranscriptDraftSnapshot = {
  captureId: null,
  droppedAudioMs: 0,
  droppedPcmFrames: 0,
  error: null,
  queuePeakAudioMs: 0,
  queuedAudioMs: 0,
  queuedPcmBytes: 0,
  sections: [],
  status: "idle",
  trackDroppedAudioMs: { microphone: 0, system: 0 },
  trackQueuePeakAudioMs: { microphone: 0, system: 0 },
  trackQueuedAudioMs: { microphone: 0, system: 0 },
  trackStatus: { microphone: "idle", system: "idle" },
  turns: [],
};

describe("meeting recording global store", () => {
  it("keeps recording and transcript updates while page consumers are unmounted", () => {
    const captureSource = observable(capture);
    const transcriptSource = observable(draft);
    const summaryUpdates: (MeetingLiveSummarySource | null)[] = [];
    const summarySource = {
      ...observable<MeetingLiveSummaryControllerSnapshot>({
        captureId: null,
        error: null,
        pendingCharacters: 0,
        status: "idle",
        summary: null,
      }),
      update(source: MeetingLiveSummarySource | null) {
        summaryUpdates.push(source);
      },
    };
    const bridge = createMeetingRecordingStateBridge({
      capture: captureSource,
      summary: summarySource,
      transcript: transcriptSource,
    });

    const pageSeen: string[] = [];
    const unsubscribePage = bridge.store.sub(liveTranscriptDraftAtom, () => {
      pageSeen.push(bridge.store.get(liveTranscriptDraftAtom).turns[0]?.text ?? "");
    });
    transcriptSource.publish({
      ...draft,
      captureId: "00000000-0000-4000-8000-000000000077",
      status: "live",
      turns: [
        {
          final: true,
          id: "section:turn-1",
          sectionId: "section",
          text: "离开页面前",
          track: "system",
        },
      ],
    });
    unsubscribePage();

    transcriptSource.publish({
      ...bridge.store.get(liveTranscriptDraftAtom),
      turns: [
        ...bridge.store.get(liveTranscriptDraftAtom).turns,
        {
          final: true,
          id: "section:turn-2",
          sectionId: "section",
          text: "切换页面期间仍然收到",
          track: "system",
        },
      ],
    });
    captureSource.publish({
      ...capture,
      active: {
        captureId: "00000000-0000-4000-8000-000000000077",
        elapsedMs: 0,
        recruitingRecordId: null,
        resumedAt: "2026-08-12T08:00:00.000Z",
        startedAt: "2026-08-12T08:00:00.000Z",
        tracks: {
          microphone: { health: "healthy", level: 0.1 },
          system: { health: "healthy", level: 0.2 },
        },
        videoTracksPersisted: 0,
      },
      phase: "active",
    });

    expect(bridge.store.get(liveTranscriptDraftAtom).turns.map((turn) => turn.text)).toEqual([
      "离开页面前",
      "切换页面期间仍然收到",
    ]);
    expect(bridge.store.get(captureSnapshotAtom).phase).toBe("active");
    expect(summaryUpdates.at(-1)).toMatchObject({
      captureId: "00000000-0000-4000-8000-000000000077",
      template: "general",
    });
    summarySource.publish({
      captureId: "00000000-0000-4000-8000-000000000077",
      error: null,
      pendingCharacters: 0,
      status: "ready",
      summary: null,
    });
    expect(bridge.store.get(meetingLiveSummaryAtom).status).toBe("ready");
    expect(pageSeen).toEqual(["离开页面前"]);
    bridge.dispose();
  });
});
