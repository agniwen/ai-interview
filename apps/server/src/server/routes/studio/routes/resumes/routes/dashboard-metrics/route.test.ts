import { describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../../factory";
import { createDashboardMetricsRouter } from "./route";

describe("dashboard metrics route", () => {
  it("returns workspace-scoped recruiting metrics behind the dashboard page permission", async () => {
    const loadRecruitingDashboardMetrics = vi.fn().mockResolvedValue({
      actions: [],
      activity: [],
      jobPipeline: [],
      offerStatuses: [],
      resume: {
        aiInterviewConversion: { conversionRate: 0, total: 0, withAiInterview: 0 },
        dailyNew: [],
        statusDistribution: [],
      },
      summary: {
        activeJobs: 0,
        aiInterviewsThisWeek: 0,
        pendingActions: 0,
        resumesThisWeek: 0,
      },
    });
    const permissionChecks: [string, string][] = [];
    const router = createDashboardMetricsRouter({
      loadRecruitingDashboardMetrics,
      requirePermission: (resource, action) => (_c, next) => {
        permissionChecks.push([resource, action]);
        return next();
      },
    });
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: This route only reads activeOrg.id; the focused fixture supplies that invariant.
        c.set("activeOrg", { id: "org-1" } as never);
        await next();
      })
      .route("/dashboard-metrics", router);

    const response = await app.request("/dashboard-metrics");

    expect(response.status).toBe(200);
    expect(loadRecruitingDashboardMetrics).toHaveBeenCalledWith("org-1");
    expect(permissionChecks).toEqual([["page", "dashboard"]]);
  });
});
