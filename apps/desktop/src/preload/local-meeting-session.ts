import type { MeetingLiveTranscriptDraft } from "@app/shared/meeting-transcription";

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
