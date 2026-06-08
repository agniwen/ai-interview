import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { InterviewerManagementPage } from "@/components/studio/interviewers/interviewer-management-page";
import type { DepartmentRecord } from "@arc/shared/departments";
import { createQueryClient } from "@arc/shared/query-client";

type EmptyFilters = Record<string, never>;
type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioInterviewersState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
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

function parseInterviewerQuery(searchParams: SearchParamsRecord): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });
}

const loadStudioInterviewersState = createServerFn({ method: "GET" })
  .validator((input: { query: DataGridQueryState<EmptyFilters>; slug: string }) => input)
  .handler(async ({ data }): Promise<StudioInterviewersState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listAllDepartments } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao");
    const { listInterviewers } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    const [departments] = await Promise.all([
      listAllDepartments(access.workspace.id),
      queryClient.prefetchQuery({
        queryFn: () =>
          listInterviewers(
            access.workspace.id,
            { search: data.query.search },
            {
              page: data.query.page,
              pageSize: data.query.pageSize,
              sortBy: data.query.sortBy,
              sortOrder: data.query.sortOrder,
            },
          ),
        queryKey: buildDataGridQueryKey(["interviewers", data.slug], data.query),
      }),
    ]);

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      departments,
      status: "ready" as const,
    };
  });

function StudioInterviewersRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/interviewers",
  }) as unknown as StudioInterviewersState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <InterviewerManagementPage departments={state.departments} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/interviewers")({
  component: StudioInterviewersRoute,
  head: () => ({
    meta: [{ title: "面试官管理" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<EmptyFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioInterviewersState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioInterviewersState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/interviewers`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseInterviewerQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
