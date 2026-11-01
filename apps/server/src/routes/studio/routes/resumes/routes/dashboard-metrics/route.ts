import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { loadRecruitingDashboardMetrics } from "../../dao/metrics";

export interface DashboardMetricsRouterDependencies {
  loadRecruitingDashboardMetrics: typeof loadRecruitingDashboardMetrics;
  requirePermission: typeof requirePermission;
}

const defaultDependencies: DashboardMetricsRouterDependencies = {
  loadRecruitingDashboardMetrics,
  requirePermission,
};

export function createDashboardMetricsRouter(
  dependencies: DashboardMetricsRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/", dependencies.requirePermission("page", "dashboard"), async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const metrics = await dependencies.loadRecruitingDashboardMetrics(activeOrg.id);
      return c.json(metrics, 200);
    });
}

export const dashboardMetricsRouter = createDashboardMetricsRouter();
