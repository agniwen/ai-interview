// 中文：飞书 bot 的 thread 级激活 JD 状态读写，由 router/commands/actions 调用
// English: per-thread active-JD state read/write, called by router/commands/actions
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { feishuThreadState } from "@/lib/db/schema";

export async function getActiveJd(threadId: string): Promise<string | null> {
  const [row] = await db
    .select({ activeJdId: feishuThreadState.activeJdId })
    .from(feishuThreadState)
    .where(eq(feishuThreadState.threadId, threadId))
    .limit(1);
  return row?.activeJdId ?? null;
}

export async function setActiveJd(threadId: string, jdId: string): Promise<void> {
  await db
    .insert(feishuThreadState)
    .values({ activeJdId: jdId, activeJdSetAt: new Date(), threadId })
    .onConflictDoUpdate({
      set: { activeJdId: jdId, activeJdSetAt: new Date() },
      target: feishuThreadState.threadId,
    });
}

export async function clearActiveJd(threadId: string): Promise<void> {
  await db
    .update(feishuThreadState)
    .set({ activeJdId: null, activeJdSetAt: null })
    .where(eq(feishuThreadState.threadId, threadId));
}
