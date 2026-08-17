import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { PlatformMailIngestAccountsGrid } from "@/components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformMailIngestAccountsState } from "@/lib/start/platform/mail-ingest-accounts.functions";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;

function parsePlatformMailIngestAccountsQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["userName", "userEmail", "emailAddress", "lastCheckedAt"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: false, id: "userName" }],
    initialFilters: {},
  });
}

function PlatformMailIngestAccountsRoute() {
  const state = useLoaderData({ from: "/platform/mail-ingest-accounts" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <PlatformMailIngestAccountsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/mail-ingest-accounts")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformMailIngestAccountsQuery(location.search);
    const state = await loadPlatformMailIngestAccountsState({
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
    meta: [{ title: formatDocumentTitle("平台 · 邮箱监听") }],
  }),
  component: PlatformMailIngestAccountsRoute,
  shouldReload: false,
});
