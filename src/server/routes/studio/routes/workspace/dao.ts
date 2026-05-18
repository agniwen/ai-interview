import "server-only";

import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { member, session, user } from "@/lib/shared/db/schema";

export interface MemberLastActiveRow {
  userId: string;
  /** ISO 字符串 / null 代表该用户从未登录过。 */
  lastActiveAt: string | null;
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
 * 取工作区每个成员"最近一次活跃"时间。
 *
 * 数据源：`COALESCE(MAX(session.updated_at), user.last_active_at)`。
 *   - `MAX(session.updatedAt)`：当前还有活跃 session 时给出滚动更新的细粒度时间
 *     （受 `session.updateAge` 限制，配置成了 5 分钟）。
 *   - `user.lastActiveAt`：每次新建 session 时由 databaseHooks.session.create.after
 *     写入；session 行后续被登出/过期清理后这个值仍在，作为兜底。两者并存能
 *     避免"昨天还在用今天却显示从未登录"的回归。
 *
 * Source: `COALESCE(MAX(session.updated_at), user.last_active_at)`. The
 * session-side MAX gives sub-day granularity while there's an active session
 * (capped by `session.updateAge`, set to 5min). user.lastActiveAt is the
 * durable anchor written on every sign-in via the session.create.after hook,
 * surviving logout/expiry so the column doesn't regress to "从未登录" after a
 * previously-seen user logs out.
 */
export async function listWorkspaceMemberLastActives(
  organizationId: string,
): Promise<MemberLastActiveRow[]> {
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
      lastActiveAt: sql<
        string | null
      >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))::text`.as("last_active_at"),
      userId: user.id,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .where(inArray(user.id, userIds))
    .groupBy(user.id)
    .orderBy(desc(sql`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`));

  return rows.map((row) => ({
    lastActiveAt: toIso(row.lastActiveAt),
    userId: row.userId,
  }));
}
