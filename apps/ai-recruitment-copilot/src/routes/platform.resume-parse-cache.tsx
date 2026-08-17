import { HydrationBoundary } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { ResumeParseCacheGrid } from "@/components/features/platform/resume-parse-cache/resume-parse-cache-grid";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { parseDehydratedState } from "@/lib/client/query-hydration";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadPlatformResumeParseCacheState } from "@/lib/start/platform/resume-parse-cache.functions";
import type { ResumeParseCacheFilters } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/routes/resume-parse-cache/schema";

const INITIAL_PAGE_SIZE = 10;

function parsePlatformResumeParseCacheQuery(
  searchParams: ReturnType<typeof coerceSearchParams>,
): DataGridQueryState<ResumeParseCacheFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["filename", "size", "parsedAt", "createdAt", "parsedStatus"],
    defaultPageSize: INITIAL_PAGE_SIZE,
    defaultSorting: [{ desc: true, id: "parsedAt" }],
    initialFilters: {
      cacheType: "all",
      parsedStatus: "all",
      textSource: "all",
    },
  });
}

function PlatformResumeParseCacheRoute() {
  const state = useLoaderData({ from: "/platform/resume-parse-cache" });
  if (state.status !== "ready") {
    return null;
  }
  return (
    <HydrationBoundary state={parseDehydratedState(state.dehydratedState)}>
      <div className="container mx-auto">
        <ResumeParseCacheGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/resume-parse-cache")({
  validateSearch: coerceSearchParams,
  loader: async ({ location }) => {
    const query = parsePlatformResumeParseCacheQuery(location.search);
    const state = await loadPlatformResumeParseCacheState({
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
  head: () => ({ meta: [{ title: formatDocumentTitle("平台 · 解析缓存") }] }),
  component: PlatformResumeParseCacheRoute,
  shouldReload: false,
});
