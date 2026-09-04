import type {
  CanonicalMeetingTranscript,
  CanonicalMeetingTranscriptTurn,
  MeetingLiveTranscriptDraft,
} from "@app/shared/meeting-transcription";
import { canonicalMeetingTranscriptSchema } from "@app/shared/meeting-transcription";

interface PositionedTurn {
  sectionSequence: number;
  source: MeetingLiveTranscriptDraft["turns"][number];
  startMs: number;
  endMs: number;
}

function turnRange(turn: MeetingLiveTranscriptDraft["turns"][number], sectionOffsetMs: number) {
  const wordStart = turn.words?.[0]?.startMs;
  const wordEnd = turn.words?.at(-1)?.endMs;
  const relativeStart = turn.startMs ?? wordStart ?? 0;
  const relativeEnd = turn.endMs ?? wordEnd ?? relativeStart + 1;
  const startMs = Math.max(0, sectionOffsetMs + relativeStart);
  return { endMs: Math.max(startMs + 1, sectionOffsetMs + relativeEnd), startMs };
}

/** Converts a completed Deepgram live draft into the canonical persisted transcript contract. */
export function canonicalizeDeepgramLiveTranscriptDraft(
  draft: MeetingLiveTranscriptDraft,
  meetingStartedAt: Date,
): CanonicalMeetingTranscript {
  const sections = new Map(draft.sections.map((section) => [section.id, section]));
  const positioned: PositionedTurn[] = [];
  for (const turn of draft.turns) {
    if (!turn.final) {
      continue;
    }
    const section = sections.get(turn.sectionId);
    if (!section) {
      continue;
    }
    const sectionOffsetMs = Math.max(0, Date.parse(section.startedAt) - meetingStartedAt.getTime());
    positioned.push({
      sectionSequence: section.sequence,
      source: turn,
      ...turnRange(turn, sectionOffsetMs),
    });
  }
  positioned.sort(
    (left, right) =>
      left.startMs - right.startMs ||
      left.sectionSequence - right.sectionSequence ||
      left.source.id.localeCompare(right.source.id),
  );

  const remoteSpeakers = new Map<string, string>();
  const turns: CanonicalMeetingTranscriptTurn[] = positioned.map((turn) => {
    const local = turn.source.track === "microphone";
    const rawSpeakerKey = turn.source.speakerKey ?? `${turn.source.sectionId}:unknown`;
    let speakerKey = "local";
    if (!local) {
      const existing = remoteSpeakers.get(rawSpeakerKey);
      speakerKey = existing ?? `remote-${remoteSpeakers.size + 1}`;
      remoteSpeakers.set(rawSpeakerKey, speakerKey);
    }
    return {
      attribution: {
        method: local ? "track" : "unconfirmed",
        participantIdentity: null,
        role: "unknown",
        sourceId: turn.source.id,
      },
      confidence: null,
      endMs: turn.endMs,
      speakerDisplayName: turn.source.speakerDisplayName ?? null,
      speakerKey,
      startMs: turn.startMs,
      text: turn.source.text,
      track: local ? "local" : "remote",
    };
  });
  return canonicalMeetingTranscriptSchema.parse({ language: draft.language ?? null, turns });
}
