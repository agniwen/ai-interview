import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { QueuesGrid } from "@/components/features/platform/queues/queues-grid";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformQueuesState } from "@/lib/start/platform/queues.functions";
import type { PlatformQueuesState } from "@/lib/start/platform/queues.functions";
import type { PlatformQueueFilters } from "@/lib/start/platform/queues.server";

const INITIAL_PAGE_SIZE = 20;
const INITIAL_FILTERS: PlatformQueueFilters = {
  queue: "resume-parse",
  state: "all",
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

function parsePlatformQueuesQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<PlatformQueueFilters> {
  return parseDataGridSearchParams(searchParams, {
    defaultPageSize: INITIAL_PAGE_SIZE,
    initialFilters: INITIAL_FILTERS,
  });
}

function PlatformQueuesRoute() {
  const state = useLoaderData({ from: "/platform/queues" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <div className="container mx-auto">
        <QueuesGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/queues")({
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformQueuesQuery(location.search);
    const state = (await loadPlatformQueuesState({
      data: { query },
    })) as PlatformQueuesState;
    if (state.status === "unauthenticated") {
      throw redirect({ href: "/login" });
    }
    if (state.status === "forbidden") {
      throw redirect({ href: "/" });
    }
    return state;
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("平台 · 队列任务") }],
  }),
  component: PlatformQueuesRoute,
  shouldReload: false,
});
