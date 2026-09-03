import { atom, createStore } from "jotai/vanilla";
import type { ResumeLibraryListRecord } from "@app/shared/studio-resumes";
import type { MeetingCaptureSnapshot } from "../../../../../preload/meeting-capture";
import type { LiveTranscriptDraftSnapshot } from "@/lib/meeting-capture/live-transcript-draft";

type MeetingRecordingStore = ReturnType<typeof createStore>;

export const INITIAL_CAPTURE_SNAPSHOT: MeetingCaptureSnapshot = {
  active: null,
  error: null,
  localSessions: [],
  phase: "idle",
  recoverable: [],
  recoveryComplete: false,
  saved: null,
  workspaceSaves: [],
};

export const INITIAL_LIVE_DRAFT_SNAPSHOT: LiveTranscriptDraftSnapshot = {
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

export interface PendingMeetingDiscard {
  captureId?: string;
  includeSaved: boolean;
}

export const captureSnapshotAtom = atom(INITIAL_CAPTURE_SNAPSHOT);
export const liveTranscriptDraftAtom = atom(INITIAL_LIVE_DRAFT_SNAPSHOT);
export const pendingMeetingDiscardAtom = atom<PendingMeetingDiscard | null>(null);
export const preselectedResumeRecordAtom = atom<ResumeLibraryListRecord | null>(null);

interface ObservableSource<Value> {
  observe: (listener: (snapshot: Value) => void) => () => void;
}

interface MeetingRecordingStateSources {
  capture: ObservableSource<MeetingCaptureSnapshot>;
  transcript: ObservableSource<LiveTranscriptDraftSnapshot>;
}

/**
 * Keeps the recording domain connected to an external Jotai store independently of page consumers.
 * 录制域与页面订阅解耦；页面全部卸载时，录音和字幕事件仍持续写入全局 store。
 */
export function createMeetingRecordingStateBridge(
  sources: MeetingRecordingStateSources,
  store: MeetingRecordingStore = createStore(),
) {
  const unsubscribeCapture = sources.capture.observe((snapshot) => {
    store.set(captureSnapshotAtom, snapshot);
  });
  const unsubscribeTranscript = sources.transcript.observe((snapshot) => {
    store.set(liveTranscriptDraftAtom, snapshot);
  });
  return {
    dispose: () => {
      unsubscribeCapture();
      unsubscribeTranscript();
    },
    store,
  };
}

export const meetingRecordingStore = createStore();
