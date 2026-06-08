import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { InterviewManagementPage } from "@/components/studio/interviews/interview-management-page";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";

interface InterviewFilters extends Record<string, string> {
  creatorIds: string;
  status: string;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioInterviewsState =
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

function parseInterviewQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<InterviewFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["scheduledAt", "createdAt", "candidateName", "roundLabel"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", status: "" },
  });
}

const loadStudioInterviewsState = createServerFn({ method: "GET" })
  .validator((input: { query: DataGridQueryState<InterviewFilters>; slug: string }) => input)
  .handler(async ({ data }): Promise<StudioInterviewsState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listInterviewRounds, summarizeInterviewRoundCounts } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    await Promise.all([
      queryClient.prefetchQuery({
        queryFn: () =>
          listInterviewRounds(
            access.workspace.id,
            {
              creatorIds: parseCsvParam(data.query.filters.creatorIds),
              search: data.query.search,
              status: data.query.filters.status,
            },
            {
              page: data.query.page,
              pageSize: data.query.pageSize,
              sortBy: data.query.sortBy,
              sortOrder: data.query.sortOrder,
            },
          ),
        queryKey: buildDataGridQueryKey(["studio-interviews", data.slug], data.query),
      }),
      queryClient.prefetchQuery({
        queryFn: () => summarizeInterviewRoundCounts(access.workspace.id),
        queryKey: ["studio-interviews", data.slug, "summary"] as const,
      }),
    ]);

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      status: "ready" as const,
    };
  });

function StudioInterviewsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/interviews",
  }) as unknown as StudioInterviewsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <InterviewManagementPage />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/interviews")({
  component: StudioInterviewsRoute,
  head: () => ({
    meta: [{ title: "AI 面试" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<InterviewFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioInterviewsState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioInterviewsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/interviews`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseInterviewQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
