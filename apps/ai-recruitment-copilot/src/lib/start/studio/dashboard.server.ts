import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { loadRecruitingDashboardMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";
import { LRUCache } from "lru-cache";

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
  workspaceId: string,
  loadMetrics: typeof loadRecruitingDashboardMetrics = loadRecruitingDashboardMetrics,
): Promise<RecruitingDashboardMetrics> {
  const cached = dashboardMetricsCache.get(workspaceId);
  if (cached && (cached.expiresAt === null || cached.expiresAt > Date.now())) {
    return cached.promise;
  }
  dashboardMetricsCache.delete(workspaceId);

  const token = Symbol(workspaceId);
  const promise = (async () => {
    try {
      const metrics = await loadMetrics(workspaceId);
      const current = dashboardMetricsCache.get(workspaceId);
      if (current?.token === token) {
        current.expiresAt = Date.now() + 10_000;
      }
      return metrics;
    } catch (error) {
      if (dashboardMetricsCache.get(workspaceId)?.token === token) {
        dashboardMetricsCache.delete(workspaceId);
      }
      throw error;
    }
  })();
  dashboardMetricsCache.set(workspaceId, {
    expiresAt: null,
    promise,
    token,
  });
  return promise;
}
