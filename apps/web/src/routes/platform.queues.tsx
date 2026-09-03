import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/features/data-grid/query-contract";
import { QueuesGrid } from "@/components/features/platform/queues/queues-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformQueuesState } from "@/lib/start/platform/queues.functions";
import type { PlatformQueueFilters } from "@/lib/start/platform/queues.server";

const INITIAL_PAGE_SIZE = 20;
const INITIAL_FILTERS: PlatformQueueFilters = {
  parseStatus: "all",
  queue: "resume-parse",
  state: "all",
  uploadStatus: "all",
};

function parsePlatformQueuesQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
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
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <QueuesGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/queues")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformQueuesQuery(location.search);
    const state = await loadPlatformQueuesState({
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
    meta: [{ title: formatDocumentTitle("平台 · 队列任务") }],
  }),
  component: PlatformQueuesRoute,
  shouldReload: false,
});
