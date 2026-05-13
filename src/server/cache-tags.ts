import "server-only";

import { updateTag } from "next/cache";

/**
 * `next/cache#updateTag` 在某些路由处理上下文中会 throw（例如非动态路由内调用）。
 * 缓存失效是 best-effort —— 失败不应连累主写入路径，所以全部吞掉。
 *
 * `next/cache#updateTag` can throw in certain route handler contexts (e.g.
 * non-dynamic routes). Cache invalidation is best-effort — a failure must
 * not block the main write path, so swallow it.
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
 *
 * AI 面试 and the resume library share one `studioInterview` table. Any
 * mutation on either side must bust both cache tags or the other page reads
 * a stale projection. Centralised here so call sites can't forget one.
 */
export function invalidateStudioInterviewCaches() {
  safeUpdateTag("studio-interviews");
  safeUpdateTag("studio-resumes");
}
