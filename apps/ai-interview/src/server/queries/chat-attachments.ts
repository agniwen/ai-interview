import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatAttachment } from "@/lib/db/schema";

export interface ChatAttachmentRow {
  id: string;
  userId: string;
  filename: string;
  mediaType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
}

export interface CreateAttachmentInput {
  id: string;
  userId: string;
  filename: string;
  mediaType: string;
  size: number;
  storageKey: string;
}

export async function createAttachment(input: CreateAttachmentInput): Promise<void> {
  await db.insert(chatAttachment).values({
    filename: input.filename,
    id: input.id,
    mediaType: input.mediaType,
    size: input.size,
    storageKey: input.storageKey,
    userId: input.userId,
  });
}

export async function getUserAttachment(
  userId: string,
  attachmentId: string,
): Promise<ChatAttachmentRow | null> {
  const [row] = await db
    .select()
    .from(chatAttachment)
    .where(and(eq(chatAttachment.id, attachmentId), eq(chatAttachment.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function getUserAttachments(
  userId: string,
  attachmentIds: string[],
): Promise<Map<string, ChatAttachmentRow>> {
  if (attachmentIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select()
    .from(chatAttachment)
    .where(and(inArray(chatAttachment.id, attachmentIds), eq(chatAttachment.userId, userId)));
  return new Map(rows.map((row) => [row.id, row]));
}
