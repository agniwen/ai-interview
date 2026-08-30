import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import { formatDefaultMeetingTitle, meetingDisplayTitle } from "@arc/shared/utils/time";
import type { LocalMeetingSession } from "../../../../../preload/local-meeting-session";

export const RECORDING_TITLE_DELAY_MS = 30_000;

export interface RecordingTitleCandidate {
  captureId: string;
  startedAt: string;
  transcript: string;
}

function meaningfulTranscriptText(draft: MeetingLiveTranscriptDraft): string {
  return draft.turns
    .map((turn) => turn.text.trim())
    .filter((text) => text.length > 1)
    .join(" ")
    .replaceAll(/[\s。！？!?；;，,：:、]+/g, " ")
    .trim();
}

export const TITLE_GENERATION_STATES = new Set(["interrupted", "paused", "recording"]);

export function resolvedMeetingTitle(input: {
  fallback?: string;
  localTitle?: string | null;
  remoteTitle?: string | null;
}): string {
  const rawTitle = input.localTitle || input.remoteTitle || input.fallback || "本地录音";
  return meetingDisplayTitle(rawTitle);
}

export function getRecordingTitleCandidate(
  session: LocalMeetingSession,
  latestDraft: MeetingLiveTranscriptDraft | null,
  nowMs: number,
): RecordingTitleCandidate | null {
  const startedAtMs = Date.parse(session.startedAt);
  if (
    Number.isNaN(startedAtMs) ||
    nowMs - startedAtMs < RECORDING_TITLE_DELAY_MS ||
    session.title !== formatDefaultMeetingTitle(session.startedAt) ||
    !TITLE_GENERATION_STATES.has(session.state)
  ) {
    return null;
  }
  const draft = latestDraft ?? session.liveTranscriptDraft;
  if (!draft) {
    return null;
  }
  const transcript = meaningfulTranscriptText(draft);
  if (transcript.length < 12) {
    return null;
  }
  return { captureId: session.id, startedAt: session.startedAt, transcript };
}
