import type { RecruitingDashboardMetrics } from "@app/shared/studio-dashboard";
import { LRUCache } from "lru-cache";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { getServerRpc } from "@/lib/start/server-rpc";

interface DashboardMetricsCacheEntry {
  expiresAt: number | null;
  promise: Promise<RecruitingDashboardMetrics>;
  token: symbol;
}

const dashboardMetricsCache = new LRUCache<string, DashboardMetricsCacheEntry>({
  max: 100,
});

export function clearStudioDashboardMetricsCache(): void {
  dashboardMetricsCache.clear();
}

export function loadStudioDashboardMetrics(
  slug: string,
  loadMetrics: (slug: string) => Promise<RecruitingDashboardMetrics> = (workspaceSlug) => {
    const rpc = getServerRpc();
    return rpcFetch(
      rpc.api.w[":slug"].studio.resumes["dashboard-metrics"].$get({
        param: { slug: workspaceSlug },
      }),
      "加载招聘看板失败",
    );
  },
): Promise<RecruitingDashboardMetrics> {
  const cached = dashboardMetricsCache.get(slug);
  if (cached && (cached.expiresAt === null || cached.expiresAt > Date.now())) {
    return cached.promise;
  }
  dashboardMetricsCache.delete(slug);

  const token = Symbol(slug);
  const promise = (async () => {
    try {
      const metrics = await loadMetrics(slug);
      const current = dashboardMetricsCache.get(slug);
      if (current?.token === token) {
        current.expiresAt = Date.now() + 10_000;
      }
      return metrics;
    } catch (error) {
      if (dashboardMetricsCache.get(slug)?.token === token) {
        dashboardMetricsCache.delete(slug);
      }
      throw error;
    }
  })();
  dashboardMetricsCache.set(slug, {
    expiresAt: null,
    promise,
    token,
  });
  return promise;
}
