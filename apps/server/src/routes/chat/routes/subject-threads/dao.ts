import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";
import type { Database } from "../../../../infrastructure/db/index";
import type { ArcMessage } from "@app/db-schema/ai-message";
import type { ChatSubjectKind, ChatThreadRunState } from "@app/db-schema/chat-subject-threads";
import { chatConversation, chatMessage, user } from "@app/db-schema/schema";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface SubjectRef {
  organizationId: string;
  subjectId: string;
  subjectKind: ChatSubjectKind;
}

export interface SubjectThreadAuthor {
  id: string;
  image: string | null;
  name: string;
}

export interface SubjectThreadRow {
  archivedAt: Date | null;
  createdAt: Date;
  createdBy: SubjectThreadAuthor | null;
  id: string;
  runState: ChatThreadRunState | null;
  title: string;
  updatedAt: Date;
}

export interface SubjectThreadMessage extends ArcMessage {
  createdAt: string;
}

/** 生成锁超过这个时长视为进程异常退出遗留，可以被新的发送覆盖。 */
export const SUBJECT_THREAD_RUN_TIMEOUT_MS = 10 * 60 * 1000;
/** 送入模型的历史上限，避免长会话无限增长。 */
export const SUBJECT_THREAD_MODEL_HISTORY_LIMIT = 60;
export const SUBJECT_THREAD_TITLE_MAX_LENGTH = 40;

function subjectCondition(ref: SubjectRef) {
  return and(
    eq(chatConversation.organizationId, ref.organizationId),
    eq(chatConversation.subjectKind, ref.subjectKind),
    eq(chatConversation.subjectId, ref.subjectId),
  );
}

const threadColumns = {
  archivedAt: chatConversation.archivedAt,
  createdAt: chatConversation.createdAt,
  createdById: user.id,
  createdByImage: user.image,
  createdByName: user.name,
  id: chatConversation.id,
  runState: chatConversation.runState,
  title: chatConversation.title,
  updatedAt: chatConversation.updatedAt,
};

function toThreadRow(row: {
  archivedAt: Date | null;
  createdAt: Date;
  createdById: string | null;
  createdByImage: string | null;
  createdByName: string | null;
  id: string;
  runState: ChatThreadRunState | null;
  title: string;
  updatedAt: Date;
}): SubjectThreadRow {
  return {
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    createdBy:
      row.createdById && row.createdByName !== null
        ? { id: row.createdById, image: row.createdByImage, name: row.createdByName }
        : null,
    id: row.id,
    runState: row.runState ?? null,
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

export function isRunStateActive(runState: ChatThreadRunState | null, now = Date.now()): boolean {
  if (!runState) {
    return false;
  }
  const startedAt = Date.parse(runState.startedAt);
  return Number.isFinite(startedAt) && now - startedAt < SUBJECT_THREAD_RUN_TIMEOUT_MS;
}

export async function loadActiveSubjectThread(ref: SubjectRef): Promise<SubjectThreadRow | null> {
  const [row] = await db
    .select(threadColumns)
    .from(chatConversation)
    .leftJoin(user, eq(user.id, chatConversation.createdByUserId))
    .where(and(subjectCondition(ref), isNull(chatConversation.archivedAt)))
    .limit(1);
  return row ? toThreadRow(row) : null;
}

export async function loadSubjectThreadById(
  ref: SubjectRef,
  conversationId: string,
): Promise<SubjectThreadRow | null> {
  const [row] = await db
    .select(threadColumns)
    .from(chatConversation)
    .leftJoin(user, eq(user.id, chatConversation.createdByUserId))
    .where(and(subjectCondition(ref), eq(chatConversation.id, conversationId)))
    .limit(1);
  return row ? toThreadRow(row) : null;
}

export async function listArchivedSubjectThreads(ref: SubjectRef): Promise<SubjectThreadRow[]> {
  const rows = await db
    .select(threadColumns)
    .from(chatConversation)
    .leftJoin(user, eq(user.id, chatConversation.createdByUserId))
    .where(and(subjectCondition(ref), isNotNull(chatConversation.archivedAt)))
    .orderBy(desc(chatConversation.updatedAt));
  return rows.map(toThreadRow);
}

/** 读取或懒创建活动会话；并发创建时依赖部分唯一索引，只保留一个。 */
export async function ensureActiveSubjectThread(
  ref: SubjectRef,
  input: { createdByUserId: string; title: string },
): Promise<SubjectThreadRow> {
  const existing = await loadActiveSubjectThread(ref);
  if (existing) {
    return existing;
  }
  await db
    .insert(chatConversation)
    .values({
      createdByUserId: input.createdByUserId,
      id: crypto.randomUUID(),
      organizationId: ref.organizationId,
      subjectId: ref.subjectId,
      subjectKind: ref.subjectKind,
      title: input.title.slice(0, SUBJECT_THREAD_TITLE_MAX_LENGTH),
      userId: null,
    })
    .onConflictDoNothing();
  const created = await loadActiveSubjectThread(ref);
  if (!created) {
    throw new Error("Failed to create the active subject thread.");
  }
  return created;
}

/**
 * 原子地占用会话的生成锁。返回 null 表示已有未超时的生成在进行。
 * Atomically claims the thread run lock; null means another unexpired run is in progress.
 */
export async function claimSubjectThreadRun(
  conversationId: string,
  runState: ChatThreadRunState,
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - SUBJECT_THREAD_RUN_TIMEOUT_MS).toISOString();
  const claimed = await db
    .update(chatConversation)
    .set({ runState })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        isNull(chatConversation.archivedAt),
        or(
          isNull(chatConversation.runState),
          sql`(${chatConversation.runState} ->> 'startedAt')::timestamptz < ${staleBefore}::timestamptz`,
        ),
      ),
    )
    .returning({ id: chatConversation.id });
  return claimed.length > 0;
}

/** 只释放自己持有的锁，避免超时后被他人接管的锁被旧请求清掉。 */
export async function releaseSubjectThreadRun(
  conversationId: string,
  runId: string,
): Promise<void> {
  await db
    .update(chatConversation)
    .set({ runState: null })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        sql`${chatConversation.runState} ->> 'runId' = ${runId}`,
      ),
    );
}

export async function saveSubjectThreadMessage(input: {
  authorUserId: string | null;
  conversationId: string;
  message: ArcMessage;
  organizationId: string;
}): Promise<void> {
  await db
    .insert(chatMessage)
    .values({
      authorUserId: input.authorUserId,
      content: input.message,
      conversationId: input.conversationId,
      id: input.message.id,
      organizationId: input.organizationId,
      role: input.message.role,
    })
    .onConflictDoUpdate({
      set: { content: input.message, role: input.message.role },
      target: chatMessage.id,
    });
  await db
    .update(chatConversation)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversation.id, input.conversationId));
}

function withAuthor(row: {
  authorId: string | null;
  authorImage: string | null;
  authorName: string | null;
  content: ArcMessage;
  createdAt: Date;
}): SubjectThreadMessage {
  const author =
    row.authorId && row.authorName !== null
      ? { id: row.authorId, image: row.authorImage, name: row.authorName }
      : null;
  return {
    ...row.content,
    createdAt: row.createdAt.toISOString(),
    metadata: { ...row.content.metadata, author },
  };
}

const messageColumns = {
  authorId: user.id,
  authorImage: user.image,
  authorName: user.name,
  content: chatMessage.content,
  createdAt: chatMessage.createdAt,
  id: chatMessage.id,
};

/** 按时间倒序分页，返回时恢复为正序；before 为上一页最早一条消息的 id。 */
export async function listSubjectThreadMessages(input: {
  before?: string;
  conversationId: string;
  limit: number;
}): Promise<{ hasMore: boolean; messages: SubjectThreadMessage[] }> {
  let cursorCondition;
  if (input.before) {
    const [cursor] = await db
      .select({ createdAt: chatMessage.createdAt, id: chatMessage.id })
      .from(chatMessage)
      .where(
        and(eq(chatMessage.conversationId, input.conversationId), eq(chatMessage.id, input.before)),
      )
      .limit(1);
    if (!cursor) {
      return { hasMore: false, messages: [] };
    }
    cursorCondition = or(
      lt(chatMessage.createdAt, cursor.createdAt),
      and(eq(chatMessage.createdAt, cursor.createdAt), lt(chatMessage.id, cursor.id)),
    );
  }
  const rows = await db
    .select(messageColumns)
    .from(chatMessage)
    .leftJoin(user, eq(user.id, chatMessage.authorUserId))
    .where(and(eq(chatMessage.conversationId, input.conversationId), cursorCondition))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(input.limit + 1);
  const page = rows.slice(0, input.limit).toReversed();
  return { hasMore: rows.length > input.limit, messages: page.map(withAuthor) };
}

export async function loadSubjectThreadModelHistory(conversationId: string): Promise<ArcMessage[]> {
  const rows = await db
    .select({ content: chatMessage.content })
    .from(chatMessage)
    .where(eq(chatMessage.conversationId, conversationId))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(SUBJECT_THREAD_MODEL_HISTORY_LIMIT);
  return rows.map((row) => row.content).toReversed();
}

export async function loadLatestSubjectThreadMessageId(
  conversationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: chatMessage.id })
    .from(chatMessage)
    .where(eq(chatMessage.conversationId, conversationId))
    .orderBy(desc(chatMessage.createdAt), desc(chatMessage.id))
    .limit(1);
  return row?.id ?? null;
}

export type SubjectThreadMutationResult = "busy" | "not_found" | "ok";

/** 开始新对话：归档当前活动会话；有生成进行中时拒绝。 */
export async function archiveActiveSubjectThread(
  ref: SubjectRef,
): Promise<SubjectThreadMutationResult> {
  return await db.transaction(async (tx) => {
    const [active] = await tx
      .select({ id: chatConversation.id, runState: chatConversation.runState })
      .from(chatConversation)
      .where(and(subjectCondition(ref), isNull(chatConversation.archivedAt)))
      .for("update")
      .limit(1);
    if (!active) {
      return "not_found";
    }
    if (isRunStateActive(active.runState)) {
      return "busy";
    }
    await tx
      .update(chatConversation)
      .set({ archivedAt: new Date(), runState: null })
      .where(eq(chatConversation.id, active.id));
    return "ok";
  });
}

/** 恢复归档会话：在同一事务中归档当前活动会话。 */
export async function restoreSubjectThread(
  ref: SubjectRef,
  conversationId: string,
): Promise<SubjectThreadMutationResult> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        archivedAt: chatConversation.archivedAt,
        id: chatConversation.id,
        runState: chatConversation.runState,
      })
      .from(chatConversation)
      .where(subjectCondition(ref))
      .orderBy(asc(chatConversation.createdAt))
      .for("update");
    const target = rows.find((row) => row.id === conversationId);
    if (!target?.archivedAt) {
      return "not_found";
    }
    const active = rows.find((row) => row.archivedAt === null);
    if (active && isRunStateActive(active.runState)) {
      return "busy";
    }
    if (active) {
      await tx
        .update(chatConversation)
        .set({ archivedAt: new Date(), runState: null })
        .where(eq(chatConversation.id, active.id));
    }
    await tx
      .update(chatConversation)
      .set({ archivedAt: null })
      .where(eq(chatConversation.id, conversationId));
    return "ok";
  });
}

/** 只删除已归档会话；活动会话需先开始新对话。消息随外键级联删除。 */
export async function deleteArchivedSubjectThread(
  ref: SubjectRef,
  conversationId: string,
): Promise<SubjectThreadMutationResult> {
  const deleted = await db
    .delete(chatConversation)
    .where(
      and(
        subjectCondition(ref),
        eq(chatConversation.id, conversationId),
        isNotNull(chatConversation.archivedAt),
      ),
    )
    .returning({ id: chatConversation.id });
  return deleted.length > 0 ? "ok" : "not_found";
}

/** 记录删除时清理它的全部实体会话，供记录所属能力在删除事务中调用。 */
export async function deleteSubjectThreadsForSubjects(
  executor: Database | DatabaseTransaction,
  input: { organizationId: string; subjectIds: string[]; subjectKind: ChatSubjectKind },
): Promise<void> {
  if (input.subjectIds.length === 0) {
    return;
  }
  await executor
    .delete(chatConversation)
    .where(
      and(
        eq(chatConversation.organizationId, input.organizationId),
        eq(chatConversation.subjectKind, input.subjectKind),
        inArray(chatConversation.subjectId, input.subjectIds),
      ),
    );
}

export async function loadUserDisplay(userId: string): Promise<SubjectThreadAuthor | null> {
  const [row] = await db
    .select({ id: user.id, image: user.image, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * 首次保存新记录后，把创建人的草稿会话转入该记录。记录已有活动会话时（例如并发创建），
 * 草稿作为已归档会话保留，避免违反“每条记录一个活动会话”。
 * Moves a creator's draft threads onto the newly saved record; if the record already has an
 * active thread, the draft is kept as archived to preserve one active thread per record.
 */
export async function attachSubjectDraftThreads(input: {
  draftSubjectId: string;
  target: SubjectRef;
}): Promise<number> {
  return await db.transaction(async (tx) => {
    const draftCondition = and(
      eq(chatConversation.organizationId, input.target.organizationId),
      eq(chatConversation.subjectKind, input.target.subjectKind),
      eq(chatConversation.subjectId, input.draftSubjectId),
    );
    const [targetActive] = await tx
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(and(subjectCondition(input.target), isNull(chatConversation.archivedAt)))
      .for("update")
      .limit(1);
    if (targetActive) {
      await tx
        .update(chatConversation)
        .set({ archivedAt: new Date(), runState: null })
        .where(and(draftCondition, isNull(chatConversation.archivedAt)));
    }
    const moved = await tx
      .update(chatConversation)
      .set({ subjectId: input.target.subjectId })
      .where(draftCondition)
      .returning({ id: chatConversation.id });
    return moved.length;
  });
}
