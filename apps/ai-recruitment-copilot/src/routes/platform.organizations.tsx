import { HydrationBoundary } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, redirect, useLoaderData } from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { OrganizationsGrid } from "@/components/features/platform/organizations/organizations-grid";
import { loadPlatformOrganizationsState } from "@/lib/start/platform/organizations.functions";
import type { PlatformOrganizationsState } from "@/lib/start/platform/organizations.functions";

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

function parsePlatformOrganizationsQuery(
  searchParams: SearchParamsRecord,
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
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <div className="container mx-auto max-w-7xl">
        <OrganizationsGrid />
      </div>
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/platform/organizations")({
  component: PlatformOrganizationsRoute,
  head: () => ({
    meta: [{ title: "平台 · 所有工作区" }],
  }),
  loader: async (loaderContext) => {
    const { location } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
    };
    const query = parsePlatformOrganizationsQuery(location.search);
    const state = (await loadPlatformOrganizationsState({
      data: { query },
    })) as PlatformOrganizationsState;
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
