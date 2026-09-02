import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import {
  meetingAccessGrant,
  meetingNote,
  meetingRecordingAsset,
  meetingSearchProjection,
  meetingSession,
  meetingTranscriptTurn,
  member,
  user,
} from "@app/db-schema/schema";
import type { MeetingLibrarySearchMatch } from "@app/shared/meeting-search";
import { MAX_MEETING_TRANSCRIPT_TEXT_CHARS } from "@app/shared/meeting-transcription";
import { isWorkspaceAdministrator } from "../../access";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const LIBRARY_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;
const SEARCH_SNIPPET_LENGTH = 180;
const MAX_MEETING_NOTE_COUNT = 200;
const MAX_MEETING_NOTE_SEARCH_CHARS = 1_000_000;
const MAX_MEETING_SEARCH_PROJECTION_CHARS = 3_500_000;
const SEARCH_CANDIDATE_OVERFETCH = 4;

export class MeetingSearchProjectionLimitError extends Error {
  constructor() {
    super("Meeting search projection exceeds its bounded source budget");
    this.name = "MeetingSearchProjectionLimitError";
  }
}

function escapedLikePattern(query: string): string {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function includesQuery(value: string, query: string): boolean {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
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

function snippetAround(value: string, query: string): string {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  const matchAt = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (matchAt === -1 || normalized.length <= SEARCH_SNIPPET_LENGTH) {
    return normalized.slice(0, SEARCH_SNIPPET_LENGTH);
  }
  const start = Math.max(0, matchAt - 60);
  const end = Math.min(normalized.length, start + SEARCH_SNIPPET_LENGTH);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
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

export async function removeMeetingSearchProjection(
  tx: Transaction,
  input: { meetingId: string; organizationId: string },
): Promise<void> {
  await tx
    .delete(meetingSearchProjection)
    .where(
      and(
        eq(meetingSearchProjection.meetingId, input.meetingId),
        eq(meetingSearchProjection.organizationId, input.organizationId),
      ),
    );
}

export async function searchMeetingSessionsForAccess(input: {
  limit: number;
  organizationId: string;
  query: string;
  timeZone: string;
  userId: string;
}) {
  return await db.transaction(async (tx) => {
    const controllerId = sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`;
    const pattern = escapedLikePattern(input.query);
    const matchesSearchSource = or(
      sql`${meetingSearchProjection.searchText} ilike ${pattern} escape '\\'`,
      sql`${user.name} ilike ${pattern} escape '\\'`,
      sql`to_char(timezone(${input.timeZone}, ${meetingSession.savedAt}), 'YYYY-MM-DD') ilike ${pattern} escape '\\'`,
      sql`to_char(timezone(${input.timeZone}, ${meetingSession.savedAt}), 'YYYY-FMMM-FMDD') ilike ${pattern} escape '\\'`,
      sql`to_char(timezone(${input.timeZone}, ${meetingSession.savedAt}), 'YYYY/FMMM/FMDD') ilike ${pattern} escape '\\'`,
      sql`to_char(timezone(${input.timeZone}, ${meetingSession.savedAt}), 'YYYY"年"FMMM"月"FMDD"日"') ilike ${pattern} escape '\\'`,
    );
    const candidateMeetings = await tx
      .select({ id: meetingSession.id })
      .from(meetingSearchProjection)
      .innerJoin(
        meetingSession,
        and(
          eq(meetingSession.id, meetingSearchProjection.meetingId),
          eq(meetingSession.organizationId, meetingSearchProjection.organizationId),
        ),
      )
      .innerJoin(user, eq(user.id, meetingSession.ownerId))
      .innerJoin(
        member,
        and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)),
      )
      .leftJoin(
        meetingAccessGrant,
        and(
          eq(meetingAccessGrant.meetingId, meetingSession.id),
          eq(meetingAccessGrant.organizationId, input.organizationId),
          eq(meetingAccessGrant.memberId, member.id),
        ),
      )
      .where(
        and(
          eq(meetingSearchProjection.organizationId, input.organizationId),
          inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES]),
          or(
            inArray(member.role, ["owner", "admin"]),
            eq(controllerId, input.userId),
            eq(meetingSession.visibility, "workspace"),
            isNotNull(meetingAccessGrant.id),
          ),
          matchesSearchSource,
        ),
      )
      .orderBy(
        desc(sql<number>`similarity(${meetingSearchProjection.searchText}, ${input.query})`),
        desc(meetingSession.savedAt),
      )
      .limit(input.limit * SEARCH_CANDIDATE_OVERFETCH)
      .for("share", { of: meetingSession });
    const [activeMember] = await tx
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.userId)))
      .for("share")
      .limit(1);
    if (!activeMember) {
      return { isAdministrator: false, records: [] };
    }
    const isAdministrator = isWorkspaceAdministrator(activeMember.role);
    if (candidateMeetings.length === 0) {
      return { isAdministrator, records: [] };
    }
    const rows = await tx
      .select({
        controllerId,
        creatorId: user.id,
        creatorImage: user.image,
        creatorName: user.name,
        durationMs: sql<number>`coalesce(max(${meetingRecordingAsset.durationMs}) filter (where ${meetingRecordingAsset.track} in ('microphone', 'system')), 0)`,
        grantRole: meetingAccessGrant.role,
        id: meetingSession.id,
        matchingNote: sql<{ body: string; meetingTimeMs: number } | null>`(
        select json_build_object(
          'body', ${meetingNote.body},
          'meetingTimeMs', ${meetingNote.meetingTimeMs}
        )
        from ${meetingNote}
        where ${meetingNote.meetingId} = ${meetingSession.id}
          and ${meetingNote.organizationId} = ${meetingSession.organizationId}
          and ${meetingNote.body} ilike ${pattern} escape '\\'
        order by ${meetingNote.meetingTimeMs}, ${meetingNote.createdAt}
        limit 1
      )`,
        matchingTurn: sql<{
          endMs: number;
          speakerDisplayName: string | null;
          startMs: number;
          text: string;
        } | null>`(
        select json_build_object(
          'endMs', ${meetingTranscriptTurn.endMs},
          'speakerDisplayName', ${meetingTranscriptTurn.speakerDisplayName},
          'startMs', ${meetingTranscriptTurn.startMs},
          'text', ${meetingTranscriptTurn.text}
        )
        from ${meetingTranscriptTurn}
        where ${meetingTranscriptTurn.revisionId} = ${meetingSession.activeTranscriptRevisionId}
          and (
            ${meetingTranscriptTurn.text} ilike ${pattern} escape '\\'
            or ${meetingTranscriptTurn.speakerDisplayName} ilike ${pattern} escape '\\'
          )
        order by ${meetingTranscriptTurn.sequence}
        limit 1
      )`,
        recordingAvailable: sql<boolean>`coalesce(bool_or(${meetingRecordingAsset.track} = 'playback' and ${meetingRecordingAsset.status} = 'ready'), false)`,
        savedAt: meetingSession.savedAt,
        status: meetingSession.status,
        title: meetingSession.title,
        visibility: meetingSession.visibility,
        workspaceCustodied: sql<boolean>`not exists (
        select 1 from ${member}
        where ${member.organizationId} = ${meetingSession.organizationId}
          and ${member.userId} = ${controllerId}
      )`,
      })
      .from(meetingSearchProjection)
      .innerJoin(
        meetingSession,
        and(
          eq(meetingSession.id, meetingSearchProjection.meetingId),
          eq(meetingSession.organizationId, meetingSearchProjection.organizationId),
        ),
      )
      .innerJoin(user, eq(user.id, meetingSession.ownerId))
      .leftJoin(meetingRecordingAsset, eq(meetingRecordingAsset.meetingId, meetingSession.id))
      .leftJoin(
        meetingAccessGrant,
        and(
          eq(meetingAccessGrant.meetingId, meetingSession.id),
          eq(meetingAccessGrant.organizationId, input.organizationId),
          eq(meetingAccessGrant.memberId, activeMember.id),
        ),
      )
      .where(
        and(
          eq(meetingSearchProjection.organizationId, input.organizationId),
          inArray(
            meetingSession.id,
            candidateMeetings.map((meeting) => meeting.id),
          ),
          inArray(meetingSession.status, [...LIBRARY_MEETING_STATUSES]),
          isAdministrator
            ? undefined
            : or(
                eq(controllerId, input.userId),
                eq(meetingSession.visibility, "workspace"),
                isNotNull(meetingAccessGrant.id),
              ),
          matchesSearchSource,
        ),
      )
      .groupBy(
        meetingSession.id,
        meetingSession.activeTranscriptRevisionId,
        meetingSession.custodianId,
        meetingSession.organizationId,
        meetingSession.ownerId,
        meetingSession.title,
        meetingSession.savedAt,
        meetingSession.status,
        meetingSession.visibility,
        meetingAccessGrant.role,
        meetingSearchProjection.searchText,
        user.id,
        user.name,
        user.image,
      )
      .orderBy(
        desc(sql<number>`similarity(${meetingSearchProjection.searchText}, ${input.query})`),
        desc(meetingSession.savedAt),
      )
      .limit(input.limit);
    const records = rows.flatMap(({ matchingNote, matchingTurn, ...row }) => {
      let match: MeetingLibrarySearchMatch | undefined;
      if (includesQuery(row.title, input.query)) {
        match = {
          endMs: null,
          kind: "title",
          snippet: snippetAround(row.title, input.query),
          startMs: null,
        };
      }
      if (!match && includesQuery(row.creatorName, input.query)) {
        match = {
          endMs: null,
          kind: "creator",
          snippet: row.creatorName,
          startMs: null,
        };
      }
      if (
        !match &&
        meetingDateSearchValues(row.savedAt, input.timeZone).some((value) =>
          includesQuery(value, input.query),
        )
      ) {
        match = {
          endMs: null,
          kind: "date",
          snippet: meetingDateSearchValues(row.savedAt, input.timeZone)[1] ?? "",
          startMs: null,
        };
      }
      if (!match && matchingTurn) {
        const speaker = matchingTurn.speakerDisplayName?.trim();
        const source = speaker ? `${speaker}：${matchingTurn.text}` : matchingTurn.text;
        match = {
          endMs: matchingTurn.endMs,
          kind: includesQuery(matchingTurn.text, input.query) ? "transcript" : "speaker",
          snippet: snippetAround(source, input.query),
          startMs: matchingTurn.startMs,
        };
      }
      if (!match && matchingNote) {
        match = {
          endMs: null,
          kind: "note",
          snippet: snippetAround(matchingNote.body, input.query),
          startMs: matchingNote.meetingTimeMs,
        };
      }
      return match ? [{ ...row, match }] : [];
    });
    return { isAdministrator, records };
  });
}
