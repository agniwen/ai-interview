import type { UIMessage } from "ai";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@arc/backend/lib/server/db";
import { chatConversation, chatMessage } from "@arc/db-schema/schema";
import type { JobDescriptionConfig } from "@arc/db-schema/job-description-config";

export interface ChatConversationSummary {
  id: string;
  title: string;
  isTitleGenerating: boolean;
  updatedAt: Date;
  createdAt: Date;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  jobDescription: string;
  jobDescriptionConfig: JobDescriptionConfig | null;
  resumeImports: Record<string, string>;
  messages: UIMessage[];
}

export type OwnershipResult = "ok" | "not_found" | "forbidden";

export function listUserConversations(
  userId: string,
  organizationId: string,
): Promise<ChatConversationSummary[]> {
  return db
    .select({
      createdAt: chatConversation.createdAt,
      id: chatConversation.id,
      isTitleGenerating: chatConversation.isTitleGenerating,
      title: chatConversation.title,
      updatedAt: chatConversation.updatedAt,
    })
    .from(chatConversation)
    .where(
      and(eq(chatConversation.userId, userId), eq(chatConversation.organizationId, organizationId)),
    )
    .orderBy(desc(chatConversation.createdAt));
}

export async function getUserConversation(
  userId: string,
  conversationId: string,
  organizationId: string,
): Promise<ChatConversationDetail | null> {
  const [row] = await db
    .select()
    .from(chatConversation)
    .where(
      and(
        eq(chatConversation.id, conversationId),
        eq(chatConversation.userId, userId),
        eq(chatConversation.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const messages = await db
    .select({ content: chatMessage.content })
    .from(chatMessage)
    .where(eq(chatMessage.conversationId, conversationId))
    .orderBy(chatMessage.createdAt);

  return {
    createdAt: row.createdAt,
    id: row.id,
    isTitleGenerating: row.isTitleGenerating,
    jobDescription: row.jobDescription,
    jobDescriptionConfig: row.jobDescriptionConfig ?? null,
    messages: messages.map((m) => m.content),
    resumeImports: row.resumeImports ?? {},
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

export async function checkConversationOwner(
  userId: string,
  conversationId: string,
  organizationId: string,
): Promise<OwnershipResult> {
  const [row] = await db
    .select({
      organizationId: chatConversation.organizationId,
      userId: chatConversation.userId,
    })
    .from(chatConversation)
    .where(eq(chatConversation.id, conversationId))
    .limit(1);

  if (!row) {
    return "not_found";
  }
  if (row.userId !== userId || row.organizationId !== organizationId) {
    return "forbidden";
  }
  return "ok";
}

export interface UpsertConversationInput {
  id: string;
  organizationId: string;
  userId: string;
  title?: string;
  isTitleGenerating?: boolean;
  jobDescription?: string;
  jobDescriptionConfig?: JobDescriptionConfig | null;
  resumeImports?: Record<string, string>;
  createdAt?: Date;
}

/**
 * Creates or updates conversation metadata. Throws if the conversation
 * already exists under a different user.
 */
export async function upsertConversation(input: UpsertConversationInput): Promise<OwnershipResult> {
  const owner = await checkConversationOwner(input.userId, input.id, input.organizationId);
  if (owner === "forbidden") {
    return "forbidden";
  }

  const now = new Date();

  if (owner === "not_found") {
    await db.insert(chatConversation).values({
      createdAt: input.createdAt ?? now,
      id: input.id,
      isTitleGenerating: input.isTitleGenerating ?? false,
      jobDescription: input.jobDescription ?? "",
      jobDescriptionConfig: input.jobDescriptionConfig ?? null,
      organizationId: input.organizationId,
      resumeImports: input.resumeImports ?? {},
      title: input.title ?? "",
      updatedAt: now,
      userId: input.userId,
    });
    return "ok";
  }

  await db
    .update(chatConversation)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.isTitleGenerating !== undefined && {
        isTitleGenerating: input.isTitleGenerating,
      }),
      ...(input.jobDescription !== undefined && {
        jobDescription: input.jobDescription,
      }),
      ...(input.jobDescriptionConfig !== undefined && {
        jobDescriptionConfig: input.jobDescriptionConfig,
      }),
      ...(input.resumeImports !== undefined && {
        resumeImports: input.resumeImports,
      }),
      updatedAt: now,
    })
    .where(
      and(
        eq(chatConversation.id, input.id),
        eq(chatConversation.userId, input.userId),
        eq(chatConversation.organizationId, input.organizationId),
      ),
    );

  return "ok";
}

export async function deleteUserConversation(
  userId: string,
  conversationId: string,
  organizationId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(chatConversation)
    .where(
      and(
        eq(chatConversation.id, conversationId),
        eq(chatConversation.userId, userId),
        eq(chatConversation.organizationId, organizationId),
      ),
    )
    .returning({ id: chatConversation.id });
  return deleted.length > 0;
}

/**
 * Idempotent upsert by message id. The caller must have already verified
 * conversation ownership — this function does not re-check.
 *
 * organizationId 必传 (chat_message.organization_id NOT NULL)；调用方从
 * c.var.activeOrg.id 或从父 chat_conversation 解出。
 */
export async function upsertChatMessage(input: {
  conversationId: string;
  organizationId: string;
  message: UIMessage;
  createdAt?: Date;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(chatMessage)
    .values({
      content: input.message,
      conversationId: input.conversationId,
      createdAt: input.createdAt ?? now,
      id: input.message.id,
      organizationId: input.organizationId,
      role: input.message.role,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      set: {
        content: input.message,
        role: input.message.role,
        updatedAt: now,
      },
      target: chatMessage.id,
    });

  await db
    .update(chatConversation)
    .set({ updatedAt: now })
    .where(eq(chatConversation.id, input.conversationId));
}

/**
 * Deletes the message identified by `messageId` and every message that was
 * created at or after it within the same conversation. Used by the regenerate
 * flow to prune the assistant message being replaced (and any orphan messages
 * that came after it). The caller must have already verified ownership.
 */
export async function deleteMessagesFromId(input: {
  conversationId: string;
  messageId: string;
}): Promise<void> {
  const [target] = await db
    .select({ createdAt: chatMessage.createdAt })
    .from(chatMessage)
    .where(
      and(
        eq(chatMessage.conversationId, input.conversationId),
        eq(chatMessage.id, input.messageId),
      ),
    )
    .limit(1);

  if (!target) {
    return;
  }

  await db
    .delete(chatMessage)
    .where(
      and(
        eq(chatMessage.conversationId, input.conversationId),
        gte(chatMessage.createdAt, target.createdAt),
      ),
    );
}

/**
 * 当简历库里某条 studio_interview 被删除时，把所有 chat_conversation 的
 * `resumeImports` JSONB map 里指向这条 interview 的 entry 清掉——下次该会话
 * 被读起来时，UI 不再显示「已入库」的假状态。
 *
 * jsonb_each_text 把 map 展开成 (key, value) 行；过滤掉 value 等于被删
 * interview id 的行，再 jsonb_object_agg 聚合回 map。`COALESCE(... , '{}')`
 * 兜底"清完所有 key 后 SELECT 返回 NULL"那种边界情况。
 *
 * Pre-filter 用 `resume_imports::text LIKE '%"id"%'` 让 PostgreSQL 跳过
 * 大多数 conversation（不命中就不解构 jsonb），避免每删一条简历都对全表
 * 做 jsonb_object_agg。这是粗筛，正确性仍由 WHERE value <> id 保证。
 *
 * After a studio_interview row is deleted, sweep the `resumeImports` JSONB
 * map on every chat_conversation in the same org, dropping entries that
 * pointed at the deleted interview. Next time the conversation is fetched
 * the UI no longer renders a stale "已入库" badge.
 *
 * The LIKE pre-filter avoids touching conversations that can't possibly
 * reference the id; the WHERE inside jsonb_each_text is the correctness
 * boundary.
 */
export async function removeImportedInterviewFromConversations(
  organizationId: string,
  interviewId: string,
): Promise<void> {
  if (!interviewId) {
    return;
  }
  await db.execute(sql`
    UPDATE chat_conversation
    SET resume_imports = COALESCE(
      (
        SELECT jsonb_object_agg(key, value)
        FROM jsonb_each_text(resume_imports)
        WHERE value <> ${interviewId}
      ),
      '{}'::jsonb
    )
    WHERE organization_id = ${organizationId}
      AND resume_imports::text LIKE ${`%"${interviewId}"%`}
  `);
}
