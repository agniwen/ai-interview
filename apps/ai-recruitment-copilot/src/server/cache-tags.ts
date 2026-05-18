import "server-only";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
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
 * 用 `revalidateTag` 而不是 `updateTag`：本项目所有写入路径都在 Hono Route
 * Handler 里（不是 Server Action），`updateTag` 只能在 Server Action 里调，
 * 否则 Next.js 直接抛 "updateTag can only be called from within a Server
 * Action"。`revalidateTag` 在 Route Handler / Server Action / 后台任务里都
 * 可用，语义同样是把对应 tag 标记为过期。
 *
 * Use `revalidateTag` instead of `updateTag`: every writer in this codebase
 * runs in a Hono Route Handler, not a Server Action. `updateTag` only works
 * inside Server Actions and throws otherwise; `revalidateTag` is the correct
 * API for Route Handlers and gives the same "mark tag stale" semantics.
 *
 * Status: most org-scoped DAOs no longer use "use cache" so most of these
 * calls are now no-ops (no entry matches the tag). Kept anyway so re-enabling
 * caching later doesn't require rebuilding the invalidation plumbing. The
 * record-id-scoped `interview-conversations*` tags are still actively used.
 * `console.warn` on the off-chance Next.js changes the contract again.
 */
export function safeUpdateTag(tag: string) {
  try {
    // Next.js 16 的 revalidateTag 第二参是 "profile"——用来匹配缓存项当初的
    // cacheLife 档位；"default" 等于"按目标 entry 自身的过期策略立即失效"，
    // 不需要调用方知道写入时用了哪个 profile。
    // The second arg is the cache-life profile to invalidate against; "default"
    // makes the call agnostic to whatever cacheLife the cached entries used.
    revalidateTag(tag, "default");
  } catch (error) {
    console.warn(`[cache-tags] revalidateTag("${tag}") failed:`, error);
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
