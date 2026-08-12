import type { MeetingLiveTranscriptDraft } from "@arc/shared/meeting-transcription";
import { formatDefaultMeetingTitle } from "@arc/shared/utils/time";
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

export function getRecordingTitleCandidate(
  session: LocalMeetingSession,
  latestDraft: MeetingLiveTranscriptDraft | null,
  nowMs: number,
): RecordingTitleCandidate | null {
  const startedAtMs = Date.parse(session.startedAt);
  if (
    Number.isNaN(startedAtMs) ||
    nowMs - startedAtMs < RECORDING_TITLE_DELAY_MS ||
    session.title !== formatDefaultMeetingTitle(session.startedAt)
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
