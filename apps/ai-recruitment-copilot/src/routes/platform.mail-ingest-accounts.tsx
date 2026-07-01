import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { PlatformMailIngestAccountsGrid } from "@/components/features/platform/mail-ingest-accounts/mail-ingest-accounts-grid";
import { loadPlatformMailIngestAccountsState } from "@/lib/start/platform/mail-ingest-accounts.functions";
import type { PlatformMailIngestAccountsState } from "@/lib/start/platform/mail-ingest-accounts.functions";

const INITIAL_PAGE_SIZE = 10;

type EmptyFilters = Record<string, never>;
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

function parsePlatformMailIngestAccountsQuery(
  searchParams: SearchParamsRecord,
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
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <div className="container mx-auto max-w-7xl">
        <PlatformMailIngestAccountsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/mail-ingest-accounts")({
  component: PlatformMailIngestAccountsRoute,
  head: () => ({
    meta: [{ title: "平台 · 邮箱监听" }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformMailIngestAccountsQuery(location.search);
    const state = (await loadPlatformMailIngestAccountsState({
      data: { query },
    })) as PlatformMailIngestAccountsState;
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
