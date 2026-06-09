import { createServerFn } from "@tanstack/react-start";
import type { RecruitingDashboardMetrics } from "@arc/shared/studio-dashboard";
import { resolveWorkspaceAccessFromRequest } from "@/lib/start/auth-session.server";
import { slugInputSchema } from "@/lib/start/server-fn-validators";
import { loadStudioDashboardMetrics } from "./dashboard.server";

export type StudioDashboardState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { metrics: RecruitingDashboardMetrics; status: "ready" };

export const loadStudioDashboardState = createServerFn({ method: "GET" })
  .validator(slugInputSchema)
  .handler(async ({ data }): Promise<StudioDashboardState> => {
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    return {
      metrics: await loadStudioDashboardMetrics(access.workspace.id),
      status: "ready",
    };
  });
