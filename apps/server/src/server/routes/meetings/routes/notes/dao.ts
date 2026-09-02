import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import { meetingAuditLog, meetingNote, meetingSession } from "@app/db-schema/schema";
import type { CreateMeetingNoteInput, UpdateMeetingNoteInput } from "@app/shared/meeting-recording";
import {
  MeetingSearchProjectionLimitError,
  rebuildMeetingSearchProjection,
  removeMeetingSearchProjection,
} from "../search/dao";

export function listMeetingNotes(input: { meetingId: string; organizationId: string }) {
  return db
    .select()
    .from(meetingNote)
    .where(
      and(
        eq(meetingNote.meetingId, input.meetingId),
        eq(meetingNote.organizationId, input.organizationId),
      ),
    )
    .orderBy(asc(meetingNote.meetingTimeMs), asc(meetingNote.createdAt));
}

export async function createMeetingNote(input: {
  authorId: string;
  authorName: string;
  meetingId: string;
  note: CreateMeetingNoteInput;
  organizationId: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
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
      const [created] = await tx
        .insert(meetingNote)
        .values({
          authorId: input.authorId,
          authorName: input.authorName,
          body: input.note.body,
          id: crypto.randomUUID(),
          meetingId: input.meetingId,
          meetingTimeMs: input.note.meetingTimeMs,
          organizationId: input.organizationId,
        })
        .returning();
      await rebuildMeetingSearchProjection(tx, input);
      return created;
    });
  } catch (error) {
    if (error instanceof MeetingSearchProjectionLimitError) {
      return "limit-exceeded" as const;
    }
    throw error;
  }
}

export async function updateMeetingNote(input: {
  actorId: string;
  canEditAll: boolean;
  canGovern: boolean;
  meetingId: string;
  note: UpdateMeetingNoteInput;
  noteId: string;
  organizationId: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(meetingNote)
        .set(input.note)
        .where(
          and(
            eq(meetingNote.id, input.noteId),
            eq(meetingNote.meetingId, input.meetingId),
            eq(meetingNote.organizationId, input.organizationId),
            input.canEditAll ? undefined : sql`false`,
          ),
        )
        .returning();
      if (!updated) {
        return null;
      }
      if (input.canGovern && updated.authorId !== input.actorId) {
        await tx.insert(meetingAuditLog).values({
          action: "meeting.note_governed",
          actorId: input.actorId,
          detail: {
            noteId: input.noteId,
            operation: "updated",
            originalAuthorId: updated.authorId,
          },
          id: crypto.randomUUID(),
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        });
      }
      await rebuildMeetingSearchProjection(tx, input);
      return updated;
    });
  } catch (error) {
    if (error instanceof MeetingSearchProjectionLimitError) {
      return "limit-exceeded" as const;
    }
    throw error;
  }
}

export async function deleteMeetingNote(input: {
  canGovern: boolean;
  meetingId: string;
  noteId: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  return await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(meetingNote)
      .where(
        and(
          eq(meetingNote.id, input.noteId),
          eq(meetingNote.meetingId, input.meetingId),
          eq(meetingNote.organizationId, input.organizationId),
          input.canGovern ? undefined : eq(meetingNote.authorId, input.userId),
        ),
      )
      .returning({ authorId: meetingNote.authorId });
    if (!deleted) {
      return false;
    }
    if (input.canGovern && deleted.authorId !== input.userId) {
      await tx.insert(meetingAuditLog).values({
        action: "meeting.note_governed",
        actorId: input.userId,
        detail: { noteId: input.noteId },
        id: crypto.randomUUID(),
        meetingId: input.meetingId,
        organizationId: input.organizationId,
      });
    }
    try {
      await rebuildMeetingSearchProjection(tx, input);
    } catch (error) {
      if (!(error instanceof MeetingSearchProjectionLimitError)) {
        throw error;
      }
      await removeMeetingSearchProjection(tx, input);
    }
    return true;
  });
}
