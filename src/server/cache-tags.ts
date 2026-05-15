import "server-only";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/server/db";
import { studioInterview } from "@/lib/shared/db/schema";

/**
 * 当前阶段：org-scoped 业务 DAO 已经移除了 `"use cache"`（见 2026-05 commit
 * "drop use cache from org-scoped DAOs"），所以本函数大多数调用现在是 no-op
 * ——目标 tag 在缓存层没有任何 entry 对应。保留这条调用基础设施 + 它的现有调
 * 用点，让"未来某天再启用 use cache"时能直接生效，不用重新拉一遍 invalidate
 * 通路。`interview-conversations*` 类的 record-id-scoped tag 仍然在用（agent /
 * livekit 写入侧），所以这函数不能删。
 *
 * 错误处理改用 console.warn 替代静默吞：之前 try/catch 把 Hono context 里
 * `updateTag` 抛的"not in route handler"错误默默吃掉，导致缓存失效不工作时
 * 没线索。现在至少在日志里能看到。
 *
 * Status: most org-scoped DAOs no longer use "use cache" so most of these
 * calls are now no-ops (no entry matches the tag). Kept anyway so re-enabling
 * caching later doesn't require rebuilding the invalidation plumbing. The
 * record-id-scoped `interview-conversations*` tags are still actively used.
 * Replaced silent swallow with `console.warn` so we'd actually notice if
 * updateTag throws in the Hono context the next time we wire caching back.
 */
export function safeUpdateTag(tag: string) {
  try {
    updateTag(tag);
  } catch (error) {
    console.warn(`[cache-tags] updateTag("${tag}") failed:`, error);
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
