import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { ResumeParseCacheGrid } from "@/components/features/platform/resume-parse-cache/resume-parse-cache-grid";
import { loadPlatformResumeParseCacheState } from "@/lib/start/platform/resume-parse-cache.functions";
import type { PlatformResumeParseCacheState } from "@/lib/start/platform/resume-parse-cache.functions";
import type { ResumeParseCacheFilters } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/routes/resume-parse-cache/schema";

const INITIAL_PAGE_SIZE = 10;

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is SearchParamsPrimitive =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function parsePlatformResumeParseCacheQuery(
  searchParams: SearchParamsRecord,
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
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <div className="container mx-auto">
        <ResumeParseCacheGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/resume-parse-cache")({
  component: PlatformResumeParseCacheRoute,
  head: () => ({ meta: [{ title: "平台 · 解析缓存" }] }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformResumeParseCacheQuery(location.search);
    const state = (await loadPlatformResumeParseCacheState({
      data: { query },
    })) as PlatformResumeParseCacheState;
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
