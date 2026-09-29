import { and, asc, eq } from "drizzle-orm";
import { humanInterviewMeetingChatMessage } from "@app/db-schema/schema";
import { db } from "../../../../../lib/server/db/index";

type ChatMessageRow = typeof humanInterviewMeetingChatMessage.$inferSelect;

function toChatMessage(row: ChatMessageRow) {
  return {
    id: row.id,
    message: row.content,
    participantIdentity: row.participantIdentity,
    senderName: row.senderName,
    timestamp: row.createdAt.toISOString(),
  };
}

export async function listHumanInterviewChatMessages(input: {
  meetingId: string;
  organizationId: string;
}) {
  const rows = await db
    .select()
    .from(humanInterviewMeetingChatMessage)
    .where(
      and(
        eq(humanInterviewMeetingChatMessage.meetingId, input.meetingId),
        eq(humanInterviewMeetingChatMessage.organizationId, input.organizationId),
      ),
    )
    .orderBy(
      asc(humanInterviewMeetingChatMessage.createdAt),
      asc(humanInterviewMeetingChatMessage.id),
    );
  return rows.map(toChatMessage);
}

export async function saveHumanInterviewChatMessage(input: {
  id: string;
  meetingId: string;
  organizationId: string;
  participantIdentity: string;
  senderName: string;
  message: string;
}) {
  const [inserted] = await db
    .insert(humanInterviewMeetingChatMessage)
    .values({
      content: input.message,
      id: input.id,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      participantIdentity: input.participantIdentity,
      senderName: input.senderName,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    return toChatMessage(inserted);
  }
  const [existing] = await db
    .select()
    .from(humanInterviewMeetingChatMessage)
    .where(eq(humanInterviewMeetingChatMessage.id, input.id))
    .limit(1);
  if (
    !existing ||
    existing.meetingId !== input.meetingId ||
    existing.organizationId !== input.organizationId ||
    existing.participantIdentity !== input.participantIdentity ||
    existing.content !== input.message
  ) {
    return null;
  }
  return toChatMessage(existing);
}
