import type { UIMessage } from "ai";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatConversation, chatMessage } from "@/lib/db/schema";
import type { JobDescriptionConfig } from "@/lib/job-description-config";

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

export function listUserConversations(userId: string): Promise<ChatConversationSummary[]> {
  return db
    .select({
      createdAt: chatConversation.createdAt,
      id: chatConversation.id,
      isTitleGenerating: chatConversation.isTitleGenerating,
      title: chatConversation.title,
      updatedAt: chatConversation.updatedAt,
    })
    .from(chatConversation)
    .where(eq(chatConversation.userId, userId))
    .orderBy(desc(chatConversation.createdAt));
}

export async function getUserConversation(
  userId: string,
  conversationId: string,
): Promise<ChatConversationDetail | null> {
  const [row] = await db
    .select()
    .from(chatConversation)
    .where(and(eq(chatConversation.id, conversationId), eq(chatConversation.userId, userId)))
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
): Promise<OwnershipResult> {
  const [row] = await db
    .select({ userId: chatConversation.userId })
    .from(chatConversation)
    .where(eq(chatConversation.id, conversationId))
    .limit(1);

  if (!row) {
    return "not_found";
  }
  if (row.userId !== userId) {
    return "forbidden";
  }
  return "ok";
}

export interface UpsertConversationInput {
  id: string;
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
  const owner = await checkConversationOwner(input.userId, input.id);
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
    .where(and(eq(chatConversation.id, input.id), eq(chatConversation.userId, input.userId)));

  return "ok";
}

export async function deleteUserConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(chatConversation)
    .where(and(eq(chatConversation.id, conversationId), eq(chatConversation.userId, userId)))
    .returning({ id: chatConversation.id });
  return deleted.length > 0;
}

/**
 * Idempotent upsert by message id. The caller must have already verified
 * conversation ownership — this function does not re-check.
 */
export async function upsertChatMessage(input: {
  conversationId: string;
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
