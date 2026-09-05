export interface HumanInterviewRecordingTrack {
  id: string;
  trackId: string;
  role: "mixed" | "candidate" | "interviewer";
  participantIdentity: string | null;
  displayName: string | null;
  fileKey: string;
  egressId: string | null;
  status: "starting" | "active" | "completed" | "failed";
  publishedAtMs: number;
  unpublishedAtMs?: number | null;
  startedAtMs: number | null;
  endedAtMs: number | null;
  durationMs: number;
  sizeBytes: number;
  error: string | null;
  updatedAtMs: number;
}

export interface RecordingIdentity {
  sourceId: string;
  participantIdentity: string | null;
  role: "candidate" | "interviewer" | "unknown";
  offsetMs: number;
  recoveryRanges?: { startMs: number; endMs: number }[];
  silenceRanges?: { startMs: number; endMs: number }[];
}

export interface TranscriptAttribution {
  sourceId: string;
  participantIdentity: string | null;
  role: "candidate" | "interviewer" | "unknown";
  method: "track" | "manual" | "unconfirmed" | "candidate-excluded";
  excludedBySourceIds?: string[];
}
