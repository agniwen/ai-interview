import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/features/data-grid/query-contract";
import { OrganizationsGrid } from "@/components/features/platform/organizations/organizations-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformOrganizationsState } from "@/lib/start/platform/organizations.functions";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;

function parsePlatformOrganizationsQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["name", "slug", "createdAt", "memberCount"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });
}

function PlatformOrganizationsRoute() {
  const state = useLoaderData({ from: "/platform/organizations" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <OrganizationsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/organizations")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformOrganizationsQuery(location.search);
    const state = await loadPlatformOrganizationsState({
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
    meta: [{ title: formatDocumentTitle("平台 · 所有工作区") }],
  }),
  component: PlatformOrganizationsRoute,
  shouldReload: false,
});
