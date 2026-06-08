import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { ResumeLibraryPage } from "@/components/studio/resumes/resume-library-page";
import type { ResumeLibraryMetrics } from "@arc/shared/studio-resumes";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";

interface ResumeFilters extends Record<string, string> {
  creatorIds: string;
  jdIds: string;
  skills: string;
  stage: string;
}

type ResumeSortColumn = "createdAt" | "candidateName" | "updatedAt";
type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioResumesState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      metrics: ResumeLibraryMetrics;
      status: "ready";
    };

function normalizeResumeSortColumn(value: string | undefined): ResumeSortColumn | undefined {
  if (value === "createdAt" || value === "candidateName" || value === "updatedAt") {
    return value;
  }
  return undefined;
}

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

function parseResumeQuery(searchParams: SearchParamsRecord): DataGridQueryState<ResumeFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", jdIds: "", skills: "", stage: "" },
  });
}

const loadStudioResumesState = createServerFn({ method: "GET" })
  .validator((input: { query: DataGridQueryState<ResumeFilters>; slug: string }) => input)
  .handler(async ({ data }): Promise<StudioResumesState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { loadResumeLibraryMetrics } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics");
    const { listResumeRecords } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const metrics = await loadResumeLibraryMetrics(access.workspace.id);
    const queryClient = createQueryClient();
    await queryClient.prefetchQuery({
      queryFn: () =>
        listResumeRecords(
          access.workspace.id,
          {
            creatorIds: parseCsvParam(data.query.filters.creatorIds),
            jobDescriptionIds: parseCsvParam(data.query.filters.jdIds),
            pipelineStages: parseCsvParam(data.query.filters.stage),
            search: data.query.search,
            skills: parseCsvParam(data.query.filters.skills),
          },
          {
            page: data.query.page,
            pageSize: data.query.pageSize,
            sortBy: normalizeResumeSortColumn(data.query.sortBy),
            sortOrder: data.query.sortOrder,
          },
        ),
      queryKey: buildDataGridQueryKey(["studio-resumes", data.slug], data.query),
    });

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      metrics,
      status: "ready" as const,
    };
  });

function StudioResumesRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/resumes",
  }) as unknown as StudioResumesState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <ResumeLibraryPage metrics={state.metrics} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes")({
  component: StudioResumesRoute,
  head: () => ({
    meta: [{ title: "简历库" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<ResumeFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioResumesState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioResumesState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/resumes`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseResumeQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
