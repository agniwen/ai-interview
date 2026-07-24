import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { NotificationsGrid } from "@/components/features/platform/notifications/notifications-grid";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformNotificationsState } from "@/lib/start/platform/notifications.functions";
import type { PlatformNotificationsState } from "@/lib/start/platform/notifications.functions";
import type { PlatformNotificationFilters } from "@/lib/start/platform/notifications.server";

const INITIAL_PAGE_SIZE = 20;
const INITIAL_FILTERS: PlatformNotificationFilters = {
  providerId: "all",
  status: "all",
};

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is boolean | number | string =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function parsePlatformNotificationsQuery(
  searchParams: SearchParamsRecord,
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
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <div className="container mx-auto">
        <NotificationsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/notifications")({
  component: PlatformNotificationsRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("平台 · 飞书通知") }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformNotificationsQuery(location.search);
    const state = (await loadPlatformNotificationsState({
      data: { query },
    })) as PlatformNotificationsState;
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  shouldReload: false,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
