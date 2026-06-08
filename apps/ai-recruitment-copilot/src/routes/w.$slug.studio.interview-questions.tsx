import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { InterviewQuestionTemplateManagementPage } from "@/components/studio/interview-questions/interview-question-template-management-page";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { createQueryClient } from "@arc/shared/query-client";

interface InterviewQuestionFilters extends Record<string, string> {
  archivedFilter: string;
  jobDescriptionId: string;
  scope: string;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioInterviewQuestionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      dehydratedState: JsonValue;
      jobDescriptions: JobDescriptionListRecord[];
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

function parseInterviewQuestionQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<InterviewQuestionFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
  });
}

function normalizeArchivedFilter(value: string): "active" | "archived" | "all" {
  return value === "archived" || value === "all" ? value : "active";
}

const loadStudioInterviewQuestionsState = createServerFn({ method: "GET" })
  .validator(
    (input: { query: DataGridQueryState<InterviewQuestionFilters>; slug: string }) => input,
  )
  .handler(async ({ data }): Promise<StudioInterviewQuestionsState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listInterviewQuestionTemplates } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries");
    const { listAllJobDescriptions } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    const [jobDescriptions] = await Promise.all([
      listAllJobDescriptions(access.workspace.id),
      queryClient.prefetchQuery({
        queryFn: () =>
          listInterviewQuestionTemplates(
            access.workspace.id,
            {
              archivedFilter: normalizeArchivedFilter(data.query.filters.archivedFilter),
              jobDescriptionId: data.query.filters.jobDescriptionId,
              scope: data.query.filters.scope,
              search: data.query.search,
            },
            {
              page: data.query.page,
              pageSize: data.query.pageSize,
              sortBy: data.query.sortBy,
              sortOrder: data.query.sortOrder,
            },
          ),
        queryKey: buildDataGridQueryKey(["interview-question-templates", data.slug], data.query),
      }),
    ]);

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      jobDescriptions,
      status: "ready" as const,
    };
  });

function StudioInterviewQuestionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/interview-questions",
  }) as unknown as StudioInterviewQuestionsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <InterviewQuestionTemplateManagementPage jobDescriptions={state.jobDescriptions} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/interview-questions")({
  component: StudioInterviewQuestionsRoute,
  head: () => ({
    meta: [{ title: "面试题" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<InterviewQuestionFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioInterviewQuestionsState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioInterviewQuestionsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/interview-questions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseInterviewQuestionQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
