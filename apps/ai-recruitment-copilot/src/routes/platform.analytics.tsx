import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  normalizePlatformAnalyticsActivityPage,
  normalizePlatformAnalyticsActivityPageSize,
  normalizePlatformAnalyticsRangeDays,
} from "@arc/shared/platform-analytics";
import type { PlatformAnalyticsSummary } from "@arc/shared/platform-analytics";
import { AnalyticsDashboardPage } from "@/components/platform/analytics/analytics-dashboard-page";

interface PlatformAnalyticsSearch {
  page?: string;
  pageSize?: string;
  rangeDays?: string;
  userId?: string;
  workspaceId?: string;
}

type PlatformAnalyticsState =
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | {
      dashboard: PlatformAnalyticsSummary;
      status: "ready";
    };

function coercePlatformAnalyticsSearch(search: Record<string, unknown>): PlatformAnalyticsSearch {
  return {
    page: typeof search.page === "string" ? search.page : undefined,
    pageSize: typeof search.pageSize === "string" ? search.pageSize : undefined,
    rangeDays: typeof search.rangeDays === "string" ? search.rangeDays : undefined,
    userId: typeof search.userId === "string" ? search.userId : undefined,
    workspaceId: typeof search.workspaceId === "string" ? search.workspaceId : undefined,
  };
}

const loadPlatformAnalyticsState = createServerFn({ method: "GET" })
  .validator((input: PlatformAnalyticsSearch) => input)
  .handler(async ({ data }): Promise<PlatformAnalyticsState> => {
    const { getPlatformAdminStateFromRequest } = await import("@/lib/start/platform-admin.server");
    const adminState = await getPlatformAdminStateFromRequest();
    if (adminState.status !== "ready") {
      return adminState;
    }

    const { loadPlatformAnalyticsSummary } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/platform/analytics");
    const { loadPlatformAnalyticsDirectory } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/platform/directory");
    const directory = await loadPlatformAnalyticsDirectory();
    return {
      dashboard: await loadPlatformAnalyticsSummary({
        directory,
        page: normalizePlatformAnalyticsActivityPage(data.page),
        pageSize: normalizePlatformAnalyticsActivityPageSize(data.pageSize),
        rangeDays: normalizePlatformAnalyticsRangeDays(data.rangeDays),
        userId: data.userId || null,
        workspaceId: data.workspaceId || null,
      }),
      status: "ready" as const,
    };
  });

function PlatformAnalyticsRoute() {
  const state = useLoaderData({ from: "/platform/analytics" });

  if (state.status !== "ready") {
    return null;
  }

  return <AnalyticsDashboardPage dashboard={state.dashboard} />;
}

export const Route = createFileRoute("/platform/analytics")({
  component: PlatformAnalyticsRoute,
  head: () => ({
    meta: [{ title: "平台 · 埋点数据" }],
  }),
  loader: async (loaderContext) => {
    const { deps } = loaderContext as unknown as { deps: { search: PlatformAnalyticsSearch } };
    const state = await loadPlatformAnalyticsState({ data: deps.search });
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    search,
  }),
  validateSearch: (search: Record<string, unknown>) => coercePlatformAnalyticsSearch(search),
});
