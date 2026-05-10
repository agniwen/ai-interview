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
