import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { NotificationsGrid } from "@/components/features/platform/notifications/notifications-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformNotificationsState } from "@/lib/start/platform/notifications.functions";
import type { PlatformNotificationFilters } from "@/lib/start/platform/notifications.server";

const INITIAL_PAGE_SIZE = 20;
const INITIAL_FILTERS: PlatformNotificationFilters = {
  providerId: "all",
  status: "all",
};

function parsePlatformNotificationsQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
): DataGridQueryState<PlatformNotificationFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: [
      "createdAt",
      "sentAt",
      "updatedAt",
      "status",
      "providerId",
      "candidateName",
      "organizationName",
    ],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: INITIAL_FILTERS,
  });
}

function PlatformNotificationsRoute() {
  const state = useLoaderData({ from: "/platform/notifications" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <NotificationsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/notifications")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformNotificationsQuery(location.search);
    const state = await loadPlatformNotificationsState({
      data: { query },
    });
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("平台 · 飞书通知") }],
  }),
  component: PlatformNotificationsRoute,
  shouldReload: false,
});
