/* oxlint-disable complexity, max-lines, no-nested-ternary, unicorn/no-nested-ternary -- Search projection, access filtering, and source precedence share one bounded model. */
import { Inject, Injectable } from "@nestjs/common";
import {
  meetingAccessGrant,
  meetingAuditLog,
  meetingNote,
  meetingRecordingAsset,
  meetingSearchProjection,
  meetingSession,
  meetingTranscriptTurn,
  member,
  user,
} from "@arc/db-schema/schema";
import { MAX_MEETING_TRANSCRIPT_TEXT_CHARS } from "@arc/shared/meeting-transcription";
import { and, asc, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { Database } from "../../../infrastructure/database/database.tokens.js";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { meetingLibrarySearchQuerySchema } from "./meeting.schemas.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const LIBRARY_STATUSES = ["workspace-verified", "processing", "processing-failed", "ready"];

function escapedLikePattern(query: string) {
  return `%${query.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function includesQuery(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function dateValues(date: Date, timeZone: string) {
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

function snippet(value: string, query: string) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  const index = normalized.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (index === -1 || normalized.length <= 180) {
    return normalized.slice(0, 180);
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, start + 180);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

export async function rebuildMeetingSearchProjection(
  tx: Transaction,
  input: { meetingId: string; organizationId: string },
) {
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
    Number(noteStats?.count ?? 0) > 200 ||
    Number(noteStats?.characters ?? 0) > 1_000_000
  ) {
    throw new Error("Meeting search projection exceeds its bounded source budget");
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
    ...dateValues(meeting.savedAt, "UTC"),
    ...new Set(turns.flatMap((turn) => (turn.speakerDisplayName ? [turn.speakerDisplayName] : []))),
    ...turns.map((turn) => turn.text),
    ...notes.map((note) => note.body),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n");
  if (searchText.length > 3_500_000) {
    throw new Error("Meeting search projection exceeds its bounded source budget");
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

function processingState(status: string): "failed" | "processing" | "ready" {
  return status === "ready" ? "ready" : status === "processing-failed" ? "failed" : "processing";
}

@Injectable()
export class MeetingSearchService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async search(
    organizationId: string,
    userId: string,
    query: z.infer<typeof meetingLibrarySearchQuerySchema>,
  ) {
    const active = await this.database.query.member.findFirst({
      columns: { id: true, role: true },
      where: { organizationId, userId },
    });
    if (!active) {
      return [];
    }
    const administrator = active.role === "owner" || active.role === "admin";
    const pattern = escapedLikePattern(query.q);
    const controllerId = sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`;
    const rows = await this.database
      .select({
        controllerId,
        creatorId: user.id,
        creatorImage: user.image,
        creatorName: user.name,
        durationMs: sql<number>`coalesce(max(${meetingRecordingAsset.durationMs}) filter (where ${meetingRecordingAsset.track} in ('microphone', 'system')), 0)`,
        grantRole: meetingAccessGrant.role,
        id: meetingSession.id,
        matchingNote: sql<{
          body: string;
          meetingTimeMs: number;
        } | null>`(select json_build_object('body', ${meetingNote.body}, 'meetingTimeMs', ${meetingNote.meetingTimeMs}) from ${meetingNote} where ${meetingNote.meetingId} = ${meetingSession.id} and ${meetingNote.organizationId} = ${meetingSession.organizationId} and ${meetingNote.body} ilike ${pattern} escape '\\' order by ${meetingNote.meetingTimeMs}, ${meetingNote.createdAt} limit 1)`,
        matchingTurn: sql<{
          endMs: number;
          speakerDisplayName: string | null;
          startMs: number;
          text: string;
        } | null>`(select json_build_object('endMs', ${meetingTranscriptTurn.endMs}, 'speakerDisplayName', ${meetingTranscriptTurn.speakerDisplayName}, 'startMs', ${meetingTranscriptTurn.startMs}, 'text', ${meetingTranscriptTurn.text}) from ${meetingTranscriptTurn} where ${meetingTranscriptTurn.revisionId} = ${meetingSession.activeTranscriptRevisionId} and (${meetingTranscriptTurn.text} ilike ${pattern} escape '\\' or ${meetingTranscriptTurn.speakerDisplayName} ilike ${pattern} escape '\\') order by ${meetingTranscriptTurn.sequence} limit 1)`,
        recordingAvailable: sql<boolean>`coalesce(bool_or(${meetingRecordingAsset.track} = 'playback' and ${meetingRecordingAsset.status} = 'ready'), false)`,
        savedAt: meetingSession.savedAt,
        status: meetingSession.status,
        title: meetingSession.title,
        visibility: meetingSession.visibility,
        workspaceCustodied: sql<boolean>`not exists (select 1 from ${member} where ${member.organizationId} = ${meetingSession.organizationId} and ${member.userId} = ${controllerId})`,
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
          eq(meetingAccessGrant.organizationId, organizationId),
          eq(meetingAccessGrant.memberId, active.id),
        ),
      )
      .where(
        and(
          eq(meetingSearchProjection.organizationId, organizationId),
          inArray(meetingSession.status, LIBRARY_STATUSES),
          administrator
            ? undefined
            : or(
                eq(controllerId, userId),
                eq(meetingSession.visibility, "workspace"),
                isNotNull(meetingAccessGrant.id),
              ),
          or(
            sql`${meetingSearchProjection.searchText} ilike ${pattern} escape '\\'`,
            sql`${user.name} ilike ${pattern} escape '\\'`,
            sql`to_char(timezone(${query.timeZone}, ${meetingSession.savedAt}), 'YYYY-MM-DD') ilike ${pattern} escape '\\'`,
            sql`to_char(timezone(${query.timeZone}, ${meetingSession.savedAt}), 'YYYY/FMMM/FMDD') ilike ${pattern} escape '\\'`,
          ),
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
        desc(sql<number>`similarity(${meetingSearchProjection.searchText}, ${query.q})`),
        desc(meetingSession.savedAt),
      )
      .limit(query.limit);
    if (administrator) {
      await this.database.insert(meetingAuditLog).values({
        action: "meeting.library_accessed",
        actorId: userId,
        id: crypto.randomUUID(),
        organizationId,
      });
    }
    return rows.flatMap(({ matchingNote, matchingTurn, ...row }) => {
      let match:
        | {
            endMs: number | null;
            kind: "creator" | "date" | "note" | "speaker" | "title" | "transcript";
            snippet: string;
            startMs: number | null;
          }
        | undefined;
      if (includesQuery(row.title, query.q)) {
        match = { endMs: null, kind: "title", snippet: snippet(row.title, query.q), startMs: null };
      } else if (includesQuery(row.creatorName, query.q)) {
        match = { endMs: null, kind: "creator", snippet: row.creatorName, startMs: null };
      } else if (
        dateValues(row.savedAt, query.timeZone).some((value) => includesQuery(value, query.q))
      ) {
        match = {
          endMs: null,
          kind: "date",
          snippet: dateValues(row.savedAt, query.timeZone)[1] ?? "",
          startMs: null,
        };
      } else if (matchingTurn) {
        const speaker = matchingTurn.speakerDisplayName?.trim();
        const source = speaker ? `${speaker}：${matchingTurn.text}` : matchingTurn.text;
        match = {
          endMs: matchingTurn.endMs,
          kind: includesQuery(matchingTurn.text, query.q) ? "transcript" : "speaker",
          snippet: snippet(source, query.q),
          startMs: matchingTurn.startMs,
        };
      } else if (matchingNote) {
        match = {
          endMs: null,
          kind: "note",
          snippet: snippet(matchingNote.body, query.q),
          startMs: matchingNote.meetingTimeMs,
        };
      }
      if (!match) {
        return [];
      }
      const accessRole = administrator
        ? ("administrator" as const)
        : row.controllerId === userId
          ? ("owner" as const)
          : row.grantRole === "editor"
            ? ("editor" as const)
            : ("viewer" as const);
      return [
        {
          accessRole,
          creator: { id: row.creatorId, image: row.creatorImage, name: row.creatorName },
          durationMs: Number(row.durationMs),
          id: row.id,
          match,
          processingState: processingState(row.status),
          recordingAvailable: row.recordingAvailable,
          savedAt: row.savedAt.toISOString(),
          title: row.title,
          workspaceCustodied: row.workspaceCustodied,
        },
      ];
    });
  }
}
