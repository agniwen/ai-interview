import { asc, and, eq } from "drizzle-orm";
import type { Database } from "@app/database";
import { meetingTranscriptRevision, meetingTranscriptTurn } from "@app/db-schema/schema";

export function createMeetingTranscriptLoader(db: Database) {
  return async (input: { meetingId: string; organizationId: string; revisionId: string }) => {
    const [revision, turns] = await Promise.all([
      db.query.meetingTranscriptRevision.findFirst({
        where: {
          id: input.revisionId,
          meetingId: input.meetingId,
          organizationId: input.organizationId,
        },
      }),
      db
        .select({
          attribution: meetingTranscriptTurn.attribution,
          id: meetingTranscriptTurn.id,
          speakerDisplayName: meetingTranscriptTurn.speakerDisplayName,
          speakerKey: meetingTranscriptTurn.speakerKey,
          text: meetingTranscriptTurn.text,
        })
        .from(meetingTranscriptTurn)
        .innerJoin(
          meetingTranscriptRevision,
          eq(meetingTranscriptRevision.id, meetingTranscriptTurn.revisionId),
        )
        .where(
          and(
            eq(meetingTranscriptRevision.id, input.revisionId),
            eq(meetingTranscriptRevision.meetingId, input.meetingId),
            eq(meetingTranscriptRevision.organizationId, input.organizationId),
          ),
        )
        .orderBy(asc(meetingTranscriptTurn.sequence)),
    ]);
    return revision ? { id: revision.id, turns } : null;
  };
}
