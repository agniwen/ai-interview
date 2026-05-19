import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { chatAttachment } from "@arc/db-schema/schema";

// 行级类型直接来自 Drizzle schema —— 单一来源，schema 改动会自动传导到这里。
// Row type derived from the Drizzle schema so column changes propagate automatically.
export type ChatAttachmentRow = typeof chatAttachment.$inferSelect;

type ChatAttachmentInsert = typeof chatAttachment.$inferInsert;

// 把可能畸形的 parsedStructured 在写入前过一遍 zod schema；通过的留下，
// 不通过的丢回 null 并打 warn——读路径的下游 (projectAttachmentToResumeProfile)
// 同样会用 safeParse 兜底，所以即使历史数据里有脏数据也不会污染 LLM 输入。
// Validate parsedStructured before writing — pass keeps it, fail returns null
// with a warn. Read paths already safeParse downstream, so historical bad
// rows can't contaminate LLM input either way.
function sanitizeParsedStructured(
  value: ResumeParserStructured | null | undefined,
): ResumeParserStructured | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = structuredSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  console.warn("[chat-attachments] discarding malformed parsedStructured", parsed.error.issues);
  return null;
}

export interface CreateAttachmentInput {
  id: string;
  organizationId: string;
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
    organizationId: input.organizationId,
    parsedAt: input.parsedAt ?? null,
    parsedError: input.parsedError ?? null,
    parsedPageCount: input.parsedPageCount ?? null,
    parsedStatus: input.parsedStatus ?? "pending",
    parsedStructured: sanitizeParsedStructured(input.parsedStructured),
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
      parsedStructured: sanitizeParsedStructured(input.parsedStructured),
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

// 按 attachmentId 查 contentHash —— 给那些手头只有 attachmentId、需要触达"同 hash 全部行"
// 的调用方用（典型场景：聊天里的 suggest_job_description 工具 on-demand 跑结构化后想回填）。
// Look up the contentHash for an attachmentId — for callers that hold only an
// id but need to fan out to all rows with the same hash (e.g. the chat-side
// suggest_job_description tool backfilling structured data on demand).
export async function findContentHashByAttachmentId(attachmentId: string): Promise<string | null> {
  const [row] = await db
    .select({ contentHash: chatAttachment.contentHash })
    .from(chatAttachment)
    .where(eq(chatAttachment.id, attachmentId))
    .limit(1);
  return row?.contentHash ?? null;
}

// 全局按内容哈希查 chat_attachment——任意一行命中即可作为 storageKey + 解析结果的复用源。
// 排除条件：
//   1. parsedStatus === "failed"：失败的解析不应永久污染后续上传。
//   2. storage_key === ""：列虽然 notNull 但允许空串；历史脏数据可能写入空 key，
//      若被命中会让 storeInterviewResume 返回空 storageKey，下游 S3 调用直接
//      抛 "No value provided for input HTTP label: Key"，所以这里一并过滤。
// Global lookup by content hash; any matching row is a reuse source for storageKey + parsed*.
// Rows excluded:
//   1. parsedStatus === "failed": a one-time parse error shouldn't poison future uploads.
//   2. storage_key === "": column is notNull but allows empty strings; legacy data
//      with empty keys would cause storeInterviewResume to return an empty key and
//      crash downstream S3 calls. Filter them out here so callers always get a usable row.
export async function findAttachmentByContentHash(hash: string): Promise<ChatAttachmentRow | null> {
  const [row] = await db
    .select()
    .from(chatAttachment)
    .where(
      and(
        eq(chatAttachment.contentHash, hash),
        ne(chatAttachment.parsedStatus, "failed"),
        ne(chatAttachment.storageKey, ""),
      ),
    )
    .limit(1);
  return row ?? null;
}

// 按 storageKey 查 chat_attachment——批量上传的 processor 用这个跳过重复解析：
// /uploads 阶段已经把 parsedStructured 写入注册表，processor 不需要再跑一次
// parseResumeFastToProfile（OCR + 结构化抽取，~2 次 LLM）。
//
// Lookup by storageKey. Used by the bulk-upload processor to skip a second
// parse: /uploads already wrote parsedStructured to chat_attachment, so the
// processor doesn't need to re-run parseResumeFastToProfile (which is ~2 LLM calls).
export async function findAttachmentByStorageKey(
  storageKey: string,
): Promise<ChatAttachmentRow | null> {
  if (!storageKey) {
    return null;
  }
  const [row] = await db
    .select()
    .from(chatAttachment)
    .where(
      and(eq(chatAttachment.storageKey, storageKey), ne(chatAttachment.parsedStatus, "failed")),
    )
    .limit(1);
  return row ?? null;
}

// 按 hash 回填结构化解析结果——只更新还没有 parsedStructured 的行。
// 同一 hash 下可能有多个用户各自的行（chat 上传时复制行），这里一次性惠及所有。
// `WHERE parsedStructured IS NULL` 让并发 / 重复调用幂等：已经有值的行保持不变。
// Backfill structured data by content hash — only rows missing parsedStructured.
// Multiple per-user rows may share the same hash (chat upload duplicates rows on
// hit), so a single UPDATE benefits all of them. The IS NULL guard keeps the
// call idempotent under concurrent writes — rows that already have structured
// data are left untouched.
export async function updateStructuredByHash(
  hash: string,
  structured: ResumeParserStructured,
): Promise<void> {
  const sanitized = sanitizeParsedStructured(structured);
  if (!sanitized) {
    return;
  }
  await db
    .update(chatAttachment)
    .set({ parsedStructured: sanitized })
    .where(and(eq(chatAttachment.contentHash, hash), isNull(chatAttachment.parsedStructured)));
}
