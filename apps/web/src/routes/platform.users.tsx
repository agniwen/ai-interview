import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { UsersGrid } from "@/components/features/platform/users/users-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformUsersState } from "@/lib/start/platform/users.functions";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;

function parsePlatformUsersQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["name", "email", "role", "createdAt", "lastActiveAt"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "lastActiveAt" }],
    initialFilters: {},
  });
}

function PlatformUsersRoute() {
  const state = useLoaderData({ from: "/platform/users" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <UsersGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/users")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformUsersQuery(location.search);
    const state = await loadPlatformUsersState({
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
    meta: [{ title: formatDocumentTitle("平台 · 所有用户") }],
  }),
  component: PlatformUsersRoute,
  shouldReload: false,
});
