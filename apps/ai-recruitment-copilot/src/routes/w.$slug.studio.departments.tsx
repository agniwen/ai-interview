import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { DepartmentManagementPage } from "@/components/studio/departments/department-management-page";
import { createQueryClient } from "@arc/shared/query-client";

type EmptyFilters = Record<string, never>;
type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioDepartmentsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      status: "ready";
    };

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return out;
}

function parseDepartmentQuery(searchParams: SearchParamsRecord): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });
}

const loadStudioDepartmentsState = createServerFn({ method: "GET" })
  .validator((input: { query: DataGridQueryState<EmptyFilters>; slug: string }) => input)
  .handler(async ({ data }): Promise<StudioDepartmentsState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listDepartments } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    await queryClient.prefetchQuery({
      queryFn: () =>
        listDepartments(
          { organizationId: access.workspace.id, search: data.query.search },
          {
            page: data.query.page,
            pageSize: data.query.pageSize,
            sortBy: data.query.sortBy,
            sortOrder: data.query.sortOrder,
          },
        ),
      queryKey: buildDataGridQueryKey(["departments", data.slug], data.query),
    });

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      status: "ready" as const,
    };
  });

function StudioDepartmentsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/departments",
  }) as unknown as StudioDepartmentsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <DepartmentManagementPage />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/departments")({
  component: StudioDepartmentsRoute,
  head: () => ({
    meta: [{ title: "部门管理" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<EmptyFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioDepartmentsState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioDepartmentsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/departments`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseDepartmentQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
