import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatConversation } from "@/lib/db/schema";

export async function claimActiveWorkflowRunId(
  conversationId: string,
  runId: string,
): Promise<boolean> {
  const result = await db
    .update(chatConversation)
    .set({ activeWorkflowRunId: runId })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        or(
          isNull(chatConversation.activeWorkflowRunId),
          eq(chatConversation.activeWorkflowRunId, runId),
        ),
      ),
    )
    .returning({ id: chatConversation.id });
  return result.length > 0;
}

export async function clearActiveWorkflowRunId(
  conversationId: string,
  expectedRunId?: string,
): Promise<void> {
  await db
    .update(chatConversation)
    .set({ activeWorkflowRunId: null })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        expectedRunId
          ? eq(chatConversation.activeWorkflowRunId, expectedRunId)
          : sql`${chatConversation.activeWorkflowRunId} IS NOT NULL`,
      ),
    );
}

export async function getActiveWorkflowRunId(conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ activeWorkflowRunId: chatConversation.activeWorkflowRunId })
    .from(chatConversation)
    .where(eq(chatConversation.id, conversationId))
    .limit(1);
  return row?.activeWorkflowRunId ?? null;
}

export async function findConversationByActiveRunId(runId: string, userId: string) {
  const [row] = await db
    .select()
    .from(chatConversation)
    .where(
      and(eq(chatConversation.activeWorkflowRunId, runId), eq(chatConversation.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}
