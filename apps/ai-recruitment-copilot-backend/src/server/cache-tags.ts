import { eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";

export interface CacheInvalidator {
  revalidateTag: (tag: string) => Promise<void> | void;
}

function noopRevalidateTag() {
  // Intentionally empty: standalone/test runtimes may not have a cache backend.
}

const noopCacheInvalidator: CacheInvalidator = {
  revalidateTag: noopRevalidateTag,
};

let cacheInvalidator = noopCacheInvalidator;

export const cacheTags = {
  interviewConversations: "interview-conversations",
  interviewConversationsByRecord(interviewRecordId: string) {
    return `interview-conversations-${interviewRecordId}`;
  },
  studioInterviews(organizationId: string) {
    return `studio-interviews:${organizationId}`;
  },
  studioResumes(organizationId: string) {
    return `studio-resumes:${organizationId}`;
  },
} as const;

export function configureCacheInvalidator(invalidator: CacheInvalidator) {
  cacheInvalidator = invalidator;
}

export function resetCacheInvalidatorForTests() {
  cacheInvalidator = noopCacheInvalidator;
}

async function warnOnAsyncInvalidationFailure(tag: string, result: PromiseLike<void>) {
  try {
    await result;
  } catch (error) {
    console.warn(`[cache-tags] revalidateTag("${tag}") failed:`, error);
  }
}

/**
 * 当前阶段：org-scoped 业务 DAO 已经移除了 `"use cache"`（见 2026-05 commit
 * "drop use cache from org-scoped DAOs"），所以本函数大多数调用现在是 no-op
 * ——目标 tag 在缓存层没有任何 entry 对应。保留这条调用基础设施 + 它的现有调
 * 用点，让"未来某天再启用 use cache"时能直接生效，不用重新拉一遍 invalidate
 * 通路。`interview-conversations*` 类的历史调用也保留为同一类未来缓存预埋。
 *
 * Next.js runtime 通过 app/api/[[...route]]/route.ts 注入具体 invalidator。
 * 独立后端或测试环境默认 no-op；后续可替换成 Redis event / HTTP internal
 * revalidate endpoint，而不让业务 route 直接 import Next 的 cache runtime。
 *
 * The Next.js runtime injects the concrete invalidator from
 * app/api/[[...route]]/route.ts. Standalone backends and tests use a no-op by
 * default; this can later become Redis events or a protected HTTP revalidate
 * endpoint without making business routes import the Next cache runtime.
 *
 * Status: most org-scoped DAOs no longer use "use cache" so most of these
 * calls are now no-ops (no entry matches the tag). Kept anyway so re-enabling
 * caching later doesn't require rebuilding the invalidation plumbing. Historical
 * `interview-conversations*` calls follow the same future-cache plumbing.
 * `console.warn` on the off-chance the runtime invalidator fails.
 */
export function safeUpdateTag(tag: string) {
  try {
    const result = cacheInvalidator.revalidateTag(tag);
    if (result && typeof result.then === "function") {
      void warnOnAsyncInvalidationFailure(tag, result);
    }
  } catch (error) {
    console.warn(`[cache-tags] revalidateTag("${tag}") failed:`, error);
  }
}

/**
 * AI 面试与招聘台共用同一张 studioInterview 表。任一侧写入后必须同时失效两个
 * cache tag，否则另一个页面会读到旧投影。集中在此处避免调用方漏掉一个。
 * 两个 tag 都需要按 org 维度隔离。
 *
 * AI 面试 and the resume library share one studioInterview table. Any
 * mutation on either side must bust both cache tags or the other page reads
 * a stale projection. Both tags are org-scoped.
 */
export function invalidateStudioInterviewCaches(organizationId: string) {
  safeUpdateTag(cacheTags.studioInterviews(organizationId));
  safeUpdateTag(cacheTags.studioResumes(organizationId));
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
