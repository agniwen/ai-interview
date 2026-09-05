import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";
import type { MeetingLiveSummarySnapshot } from "@app/shared/meeting-live-summary";

export type LocalMeetingSessionState =
  | "recording"
  | "paused"
  | "interrupted"
  | "finalizing-local"
  | "saved-local"
  | "uploading"
  | "workspace-verified"
  | "sync-failed";

export interface LocalMeetingSession {
  endedAt: string | null;
  id: string;
  liveSummary?: MeetingLiveSummarySnapshot | null;
  liveTranscriptDraft: MeetingLiveTranscriptDraft | null;
  recruitingRecordId: string | null;
  segmentCount: number;
  startedAt: string;
  state: LocalMeetingSessionState;
  title: string;
  updatedAt: string;
}

export interface LocalMeetingSessionCreateInput {
  id: string;
  recruitingRecordId: string | null;
  startedAt: string;
  title: string;
}
