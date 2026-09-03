import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@app/database";
import {
  meetingNote,
  meetingSearchProjection,
  meetingSession,
  meetingTranscriptTurn,
  user,
} from "@app/db-schema/schema";
import { MAX_MEETING_TRANSCRIPT_TEXT_CHARS } from "@app/shared/meeting-transcription";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const MAX_MEETING_NOTE_COUNT = 200;
const MAX_MEETING_NOTE_SEARCH_CHARS = 1_000_000;
const MAX_MEETING_SEARCH_PROJECTION_CHARS = 3_500_000;

export class MeetingSearchProjectionLimitError extends Error {
  constructor() {
    super("Meeting search projection exceeds its bounded source budget");
    this.name = "MeetingSearchProjectionLimitError";
  }
}

function meetingDateSearchValues(date: Date, timeZone: string): string[] {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      day: "numeric",
      month: "numeric",
      timeZone,
      year: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const year = parts.year ?? "";
  const month = parts.month ?? "";
  const day = parts.day ?? "";
  return [
    `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    `${year}/${month}/${day}`,
    `${year}年${month}月${day}日`,
  ];
}

export async function rebuildMeetingSearchProjection(
  tx: Transaction,
  input: { meetingId: string; organizationId: string },
): Promise<void> {
  const [meeting] = await tx
    .select({
      activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
      creatorName: user.name,
      savedAt: meetingSession.savedAt,
      title: meetingSession.title,
    })
    .from(meetingSession)
    .innerJoin(user, eq(user.id, meetingSession.ownerId))
    .where(
      and(
        eq(meetingSession.id, input.meetingId),
        eq(meetingSession.organizationId, input.organizationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!meeting) {
    return;
  }
  const [transcriptStats] = meeting.activeTranscriptRevisionId
    ? await tx
        .select({
          characters: sql<number>`coalesce(sum(char_length(${meetingTranscriptTurn.text})), 0)`,
          count: sql<number>`count(*)`,
        })
        .from(meetingTranscriptTurn)
        .where(eq(meetingTranscriptTurn.revisionId, meeting.activeTranscriptRevisionId))
    : [{ characters: 0, count: 0 }];
  const [noteStats] = await tx
    .select({
      characters: sql<number>`coalesce(sum(char_length(${meetingNote.body})), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(meetingNote)
    .where(
      and(
        eq(meetingNote.meetingId, input.meetingId),
        eq(meetingNote.organizationId, input.organizationId),
      ),
    );
  if (
    Number(transcriptStats?.count ?? 0) > 10_000 ||
    Number(transcriptStats?.characters ?? 0) > MAX_MEETING_TRANSCRIPT_TEXT_CHARS ||
    Number(noteStats?.count ?? 0) > MAX_MEETING_NOTE_COUNT ||
    Number(noteStats?.characters ?? 0) > MAX_MEETING_NOTE_SEARCH_CHARS
  ) {
    throw new MeetingSearchProjectionLimitError();
  }
  const turns = meeting.activeTranscriptRevisionId
    ? await tx
        .select({
          speakerDisplayName: meetingTranscriptTurn.speakerDisplayName,
          text: meetingTranscriptTurn.text,
        })
        .from(meetingTranscriptTurn)
        .where(eq(meetingTranscriptTurn.revisionId, meeting.activeTranscriptRevisionId))
        .orderBy(asc(meetingTranscriptTurn.sequence))
    : [];
  const notes = await tx
    .select({ body: meetingNote.body })
    .from(meetingNote)
    .where(
      and(
        eq(meetingNote.meetingId, input.meetingId),
        eq(meetingNote.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(meetingNote.meetingTimeMs), asc(meetingNote.createdAt));
  const searchText = [
    meeting.title,
    meeting.creatorName,
    ...meetingDateSearchValues(meeting.savedAt, "UTC"),
    ...new Set(turns.flatMap((turn) => (turn.speakerDisplayName ? [turn.speakerDisplayName] : []))),
    ...turns.map((turn) => turn.text),
    ...notes.map((note) => note.body),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  if (searchText.length > MAX_MEETING_SEARCH_PROJECTION_CHARS) {
    throw new MeetingSearchProjectionLimitError();
  }
  await tx
    .insert(meetingSearchProjection)
    .values({
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      searchText,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      set: { searchText, updatedAt: new Date() },
      target: meetingSearchProjection.meetingId,
    });
}
