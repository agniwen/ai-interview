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

  const speakers = new Map<
    string,
    { attributionMethod: "track" | "unconfirmed"; speakerKey: string; track: "local" | "remote" }
  >();
  let localSpeakerIdentity: string | null = null;
  let remoteSpeakerCount = 0;
  const turns: CanonicalMeetingTranscriptTurn[] = positioned.map((turn) => {
    const sourceTrack = turn.source.track;
    const rawSpeakerKey = turn.source.speakerKey ?? `${sourceTrack}:unknown`;
    const speakerIdentity = `${sourceTrack}:${rawSpeakerKey}`;
    let speaker = speakers.get(speakerIdentity);
    if (!speaker) {
      // Canonical transcripts reserve `local` for one local identity. Deepgram can still diarize
      // several voices on the microphone input, so retain every additional identity as unconfirmed
      // instead of collapsing all microphone speakers into `local`.
      if (sourceTrack === "microphone" && localSpeakerIdentity === null) {
        localSpeakerIdentity = speakerIdentity;
        speaker = { attributionMethod: "track", speakerKey: "local", track: "local" };
      } else {
        remoteSpeakerCount += 1;
        speaker = {
          attributionMethod: "unconfirmed",
          speakerKey: `remote-${remoteSpeakerCount}`,
          track: "remote",
        };
      }
      speakers.set(speakerIdentity, speaker);
    }
    return {
      attribution: {
        method: speaker.attributionMethod,
        participantIdentity: null,
        role: "unknown",
        sourceId: turn.source.id,
      },
      confidence: null,
      endMs: turn.endMs,
      speakerDisplayName: turn.source.speakerDisplayName ?? null,
      speakerKey: speaker.speakerKey,
      startMs: turn.startMs,
      text: turn.source.text,
      track: speaker.track,
    };
  });
  return canonicalMeetingTranscriptSchema.parse({ language: draft.language ?? null, turns });
}
