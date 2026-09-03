/**
 * React Query 客户端工厂。
 * Factory for the React Query client.
 *
 * 服务端每次调用都会创建一个新实例（避免请求间共享缓存）；浏览器端复用单例，
 * 让多个组件共享一个 cache。
 *
 * On the server we create a fresh client for every call (so caches don't leak across
 * requests). In the browser we reuse a singleton so all components share one cache.
 */

import { createQueryClient } from "@app/shared/query-client";

let browserQueryClient: ReturnType<typeof createQueryClient> | undefined;

/**
 * 获取当前环境下应使用的 QueryClient：
 *   - 服务端：每次都新建，避免跨请求污染。
 *   - 浏览器：返回单例，保证 cache 共享。
 *
 * Get the QueryClient appropriate for the current environment:
 *   - server: always a fresh instance to prevent cross-request leakage;
 *   - browser: reuses a singleton so caches are shared.
 */
export function getQueryClient() {
  if (!globalThis.window) {
    return createQueryClient();
  }

  if (!browserQueryClient) {
    browserQueryClient = createQueryClient();
  }
  return browserQueryClient;
}
