import { createServerFn } from "@tanstack/react-start";
import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioDashboardMetrics } from "./dashboard.server";
import { resolveAuthorizedStudioPageAccessFromRequest } from "./page-access.server";

export type StudioDashboardState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { metrics: RecruitingDashboardMetrics; status: "ready" };

export const loadStudioDashboardState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioDashboardState> => {
    const access = await resolveAuthorizedStudioPageAccessFromRequest(data.slug, "dashboard");
    if (access.status !== "ready") {
      return access;
    }

    return {
      metrics: await loadStudioDashboardMetrics(access.workspace.id),
      status: "ready",
    };
  });
