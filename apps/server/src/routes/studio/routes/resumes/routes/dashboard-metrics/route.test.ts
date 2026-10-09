import { describe, expect, it, vi } from "vitest";
import type { RecruitingDashboardMetrics } from "@app/shared/studio-dashboard";
import { factory } from "../../../../../../factory";
import { createDashboardMetricsRouter } from "./route";

describe("dashboard metrics route", () => {
  it("returns workspace-scoped recruiting metrics behind the dashboard page permission", async () => {
    const metrics: RecruitingDashboardMetrics = {
      actions: [],
      activity: [],
      cumulativeFunnel: {
        enteredInterview: 0,
        enteredOffer: 0,
        enteredSecondInterview: 0,
        hired: 0,
        resumesAdded: 0,
      },
      jobPipeline: [],
      offerStatuses: [],
      recruiterProgress: [],
      resume: {
        byPipeline: [],
        conversion: { withInterview: 0, withoutInterview: 0 },
        dailyAdded: [],
      },
      summary: {
        activeJobs: 0,
        aiCompleted30d: 0,
        formsSubmitted30d: 0,
        hired: 0,
        humanCompleted30d: 0,
        negativeClosed: 0,
        offerOnboarding: 0,
        offersSent30d: 0,
        progressing: 0,
        unconfiguredHeadcount: 0,
        vacancies: 0,
      },
      vacancies: [],
    };
    const loadRecruitingDashboardMetrics = vi.fn().mockResolvedValue(metrics);
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
    expect(await response.json()).toMatchObject({
      cumulativeFunnel: { resumesAdded: 0 },
      summary: { activeJobs: 0, vacancies: 0 },
    });
    expect(loadRecruitingDashboardMetrics).toHaveBeenCalledWith("org-1");
    expect(permissionChecks).toEqual([["page", "dashboard"]]);
  });
});
