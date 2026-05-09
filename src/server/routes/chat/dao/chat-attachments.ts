import type { ResumeParserStructured } from "@/server/agents/resume-parser-schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { chatAttachment } from "@/lib/server/db/schema";

// 行级类型直接来自 Drizzle schema —— 单一来源，schema 改动会自动传导到这里。
// Row type derived from the Drizzle schema so column changes propagate automatically.
export type ChatAttachmentRow = typeof chatAttachment.$inferSelect;

type ChatAttachmentInsert = typeof chatAttachment.$inferInsert;

export interface CreateAttachmentInput {
  id: string;
  userId: string;
  filename: string;
  mediaType: string;
  size: number;
  storageKey: string;
  parsedStatus?: ChatAttachmentInsert["parsedStatus"];
  parsedText?: string | null;
  parsedStructured?: ResumeParserStructured | null;
  parsedPageCount?: number | null;
  parsedTextSource?: ChatAttachmentInsert["parsedTextSource"];
  parsedError?: string | null;
  parsedAt?: Date | null;
  contentHash?: string | null;
}

export async function createAttachment(input: CreateAttachmentInput): Promise<void> {
  await db.insert(chatAttachment).values({
    contentHash: input.contentHash ?? null,
    filename: input.filename,
    id: input.id,
    mediaType: input.mediaType,
    parsedAt: input.parsedAt ?? null,
    parsedError: input.parsedError ?? null,
    parsedPageCount: input.parsedPageCount ?? null,
    parsedStatus: input.parsedStatus ?? "pending",
    parsedStructured: input.parsedStructured ?? null,
    parsedText: input.parsedText ?? null,
    parsedTextSource: input.parsedTextSource ?? null,
    size: input.size,
    storageKey: input.storageKey,
    userId: input.userId,
  });
}

export interface UpdateAttachmentParseInput {
  attachmentId: string;
  userId: string;
  parsedStatus: Exclude<ChatAttachmentInsert["parsedStatus"], "pending">;
  parsedText?: string | null;
  parsedStructured?: ResumeParserStructured | null;
  parsedPageCount?: number | null;
  parsedTextSource?: ChatAttachmentInsert["parsedTextSource"];
  parsedError?: string | null;
}

export async function updateAttachmentParseResult(
  input: UpdateAttachmentParseInput,
): Promise<void> {
  await db
    .update(chatAttachment)
    .set({
      parsedAt: new Date(),
      parsedError: input.parsedError ?? null,
      parsedPageCount: input.parsedPageCount ?? null,
      parsedStatus: input.parsedStatus,
      parsedStructured: input.parsedStructured ?? null,
      parsedText: input.parsedText ?? null,
      parsedTextSource: input.parsedTextSource ?? null,
    })
    .where(and(eq(chatAttachment.id, input.attachmentId), eq(chatAttachment.userId, input.userId)));
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

// 全局按内容哈希查 chat_attachment——任意一行命中即可作为 storageKey + 解析结果的复用源。
// 排除 parsedStatus === "failed" 的行：失败的解析不应永久污染后续上传。
// Global lookup by content hash; any matching row is a reuse source for storageKey + parsed*.
// Rows with parsedStatus === "failed" are excluded so a one-time parse error doesn't
// permanently poison every subsequent upload of the same file.
export async function findAttachmentByContentHash(hash: string): Promise<ChatAttachmentRow | null> {
  const [row] = await db
    .select()
    .from(chatAttachment)
    .where(and(eq(chatAttachment.contentHash, hash), ne(chatAttachment.parsedStatus, "failed")))
    .limit(1);
  return row ?? null;
}
