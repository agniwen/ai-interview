import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { member, session } from "@/lib/shared/db/schema";

export interface MemberLastLoginRow {
  userId: string;
  /** ISO 字符串 / null 代表该用户尚无活跃 session（已登出或从未登录）。 */
  lastLoginAt: string | null;
}

function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * 取工作区每个成员"最近一次活跃"时间：以该用户名下 session 的最大 updatedAt 为准。
 *
 * 为什么不用 createdAt：better-auth 的 session.createdAt 是首次 sign-in 时刻，
 * 之后即使用户每天都在用，会续期同一行 session（更新 updatedAt / expiresAt）也
 * 不会新建行。结果就是用户感觉"今天还在用"，但 max(createdAt) 显示几周前——
 * 这就是「有时间了但不准」的根因。session.updatedAt 才是 last-seen 语义。
 *
 * Use MAX(session.updated_at), not created_at. better-auth refreshes the same
 * session row on activity (within sessionUpdateAge), so created_at sticks at
 * the first sign-in and stops reflecting recent usage; updated_at is the real
 * last-seen timestamp.
 */
export async function listWorkspaceMemberLastLogins(
  organizationId: string,
): Promise<MemberLastLoginRow[]> {
  const memberIds = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const userIds = memberIds.map((row) => row.userId);
  if (userIds.length === 0) {
    return [];
  }

  // drizzle 1.0-rc 的 `max()` 在 timestamp 列上有时返回原始字符串而不是 Date，
  // 不同 driver 下行为不稳定；这里强制 ::text 取出，到 JS 层再统一标准化为 ISO。
  // drizzle 1.0-rc's `max()` on a timestamp column can leak the raw driver
  // string instead of going through the column decoder. Force ::text and
  // normalize to ISO in JS to dodge that.
  const rows = await db
    .select({
      lastLoginAt: sql<string | null>`MAX(${session.updatedAt})::text`.as("last_login_at"),
      userId: session.userId,
    })
    .from(session)
    .where(inArray(session.userId, userIds))
    .groupBy(session.userId)
    .orderBy(desc(sql`MAX(${session.updatedAt})`));

  const seen = new Set(rows.map((row) => row.userId));
  const filled: MemberLastLoginRow[] = rows.map((row) => ({
    lastLoginAt: toIso(row.lastLoginAt),
    userId: row.userId,
  }));
  // 包含从未登录的成员，前端 join 时能展示「从未登录」而不是漏行。
  for (const userId of userIds) {
    if (!seen.has(userId)) {
      filled.push({ lastLoginAt: null, userId });
    }
  }
  return filled;
}
