import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { JobDescriptionManagementPage } from "@/components/studio/job-descriptions/job-description-management-page";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { JobDescriptionMetrics } from "@arc/shared/job-descriptions";
import { createQueryClient } from "@arc/shared/query-client";

interface JobDescriptionFilters extends Record<string, string> {
  departmentId: string;
  interviewerId: string;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioJobDescriptionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
      dehydratedState: JsonValue;
      interviewers: InterviewerListRecord[];
      metrics: JobDescriptionMetrics;
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

function parseJobDescriptionQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<JobDescriptionFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { departmentId: "", interviewerId: "" },
  });
}

const loadStudioJobDescriptionsState = createServerFn({ method: "GET" })
  .validator((input: { query: DataGridQueryState<JobDescriptionFilters>; slug: string }) => input)
  .handler(async ({ data }): Promise<StudioJobDescriptionsState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listAllDepartments } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao");
    const { listAllInterviewers } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao");
    const { listJobDescriptions, loadJobDescriptionMetrics } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    const [departments, interviewers, metrics] = await Promise.all([
      listAllDepartments(access.workspace.id),
      listAllInterviewers(access.workspace.id),
      loadJobDescriptionMetrics(access.workspace.id),
      queryClient.prefetchQuery({
        queryFn: () =>
          listJobDescriptions(
            access.workspace.id,
            {
              departmentId: data.query.filters.departmentId,
              interviewerId: data.query.filters.interviewerId,
              search: data.query.search,
            },
            {
              page: data.query.page,
              pageSize: data.query.pageSize,
              sortBy: data.query.sortBy,
              sortOrder: data.query.sortOrder,
            },
          ),
        queryKey: buildDataGridQueryKey(["job-descriptions", data.slug], data.query),
      }),
    ]);

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      departments,
      interviewers,
      metrics,
      status: "ready" as const,
    };
  });

function StudioJobDescriptionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/job-descriptions",
  }) as unknown as StudioJobDescriptionsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <JobDescriptionManagementPage
        departments={state.departments}
        interviewers={state.interviewers}
        metrics={state.metrics}
      />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/job-descriptions")({
  component: StudioJobDescriptionsRoute,
  head: () => ({
    meta: [{ title: "在招岗位管理" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<JobDescriptionFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioJobDescriptionsState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioJobDescriptionsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/job-descriptions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseJobDescriptionQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
