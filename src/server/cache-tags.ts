import "server-only";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/server/db";
import { studioInterview } from "@/lib/shared/db/schema";

/**
 * `next/cache#updateTag` 在某些路由处理上下文中会 throw（例如非动态路由内调用）。
 * 缓存失效是 best-effort —— 失败不应连累主写入路径，所以全部吞掉。
 *
 * 多租户隔离约定：业务 DAO 里的 cacheTag 已经按 `${tag}:${orgId}` 形态打标
 * （见 listDepartments / listInterviewers / … 等 "use cache" 函数）。所以调用方
 * 在 invalidate 时也必须传同样格式的 tag —— 直接 `safeUpdateTag("departments")`
 * 不带 org 后缀的话，对不上任何缓存桶（变成静默 no-op）。
 *
 * `updateTag` can throw in certain Next route contexts; swallow failures so
 * they don't block the main write path. Multi-tenant convention: DAOs tag
 * their cache entries as `${tag}:${orgId}` — callers must use the same shape
 * or invalidation silently no-ops.
 */
export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  } catch {
    // best-effort cache invalidation — non-critical
  }
}

/**
 * AI 面试与简历库共用同一张 studioInterview 表。任一侧写入后必须同时失效两个
 * cache tag，否则另一个页面会读到旧投影。集中在此处避免调用方漏掉一个。
 * 两个 tag 都需要按 org 维度隔离。
 *
 * AI 面试 and the resume library share one studioInterview table. Any
 * mutation on either side must bust both cache tags or the other page reads
 * a stale projection. Both tags are org-scoped.
 */
export function invalidateStudioInterviewCaches(organizationId: string) {
  safeUpdateTag(`studio-interviews:${organizationId}`);
  safeUpdateTag(`studio-resumes:${organizationId}`);
}

/**
 * 反查 interview 记录所属 org —— 给那些只有 interviewRecordId 的写入路径
 * （agent /report、interview-summary-job、interview/route 回调）用，让它们
 * 仍能拼出 org-scoped tag。找不到返回 null（约定调用方不要"全量 invalidate"，
 * 直接放弃这次失效，等 cacheLife 自然过期更保险）。
 *
 * Reverse-lookup orgId from interviewRecordId for writers that hold only an
 * interview id (agent reports, summary jobs, candidate-side completion).
 * Returns null when not found; callers should skip invalidation rather than
 * fall back to a global flush.
 */
export async function lookupOrgIdByInterviewRecord(
  interviewRecordId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  return row?.organizationId ?? null;
}
