import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { buildInfiniteDataGridQueryKey } from "@/components/data-grid/query-contract";
import { parseCsvParam } from "@arc/shared/csv";
import { RESUME_LIBRARY_INFINITE_PAGE_SIZE } from "@arc/shared/studio-resumes";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
} from "@arc/shared/studio-resumes";
import { useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  fetchStudioResumeDuplicateMatches,
  fetchStudioResumeMetrics,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
  forceStudioResumeReparse,
  retryStudioResumeParse,
  rpcFetch,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { studioResumeKeys } from "@/lib/client/api/query-keys";
import { resumeMetricsScopeAtom } from "@/lib/client/atoms/resume-metrics-scope";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useResumeLibrarySearchState } from "./resume-library-page-model";
import type {
  FetchParams,
  ResumeLibraryGridState,
  SearchParamsRecord,
  WorkspaceMember,
} from "./resume-library-page-model";

const recruitingJobDescriptionsPayloadSchema = z.object({
  records: z.array(
    z.object({
      departmentName: z.string().nullable(),
      evaluationMode: z.enum(["legacy", "structured", "qualitative"]),
      id: z.string(),
      name: z.string(),
    }),
  ),
});

interface ResumeLibraryPageParam {
  knownTotal: number | undefined;
  page: number;
}

const initialResumeLibraryPage: ResumeLibraryPageParam = {
  knownTotal: undefined,
  page: 1,
};

export function useResumeLibraryPageQueries({
  duplicateMatchRecord,
  routeSearch,
}: {
  duplicateMatchRecord: ResumeLibraryListRecord | null;
  routeSearch: SearchParamsRecord;
}) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
    void router.invalidate();
  }, [queryClient, router]);

  const fetcher = useMemo(
    () =>
      (params: FetchParams): Promise<PaginatedResumeLibraryResult> =>
        fetchStudioResumes(slug, {
          creatorIds: parseCsvParam(params.filters.creatorIds),
          jobDescriptionIds: parseCsvParam(params.filters.jdIds),
          knownTotal: params.knownTotal,
          page: params.page,
          pageSize: params.pageSize,
          pipelineStages: parseCsvParam(params.filters.stage),
          recommendationLevels: parseCsvParam(params.filters.recommendationLevels),
          search: params.search || undefined,
          skills: parseCsvParam(params.filters.skills),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          structuredMaxScore: params.filters.structuredMaxScore
            ? Number(params.filters.structuredMaxScore)
            : undefined,
          structuredMinScore: params.filters.structuredMinScore
            ? Number(params.filters.structuredMinScore)
            : undefined,
        }),
    [slug],
  );

  const { data: workspaceMembersResult } = useQuery({
    queryFn: () =>
      rpcFetch<{ records: WorkspaceMember[] }>(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
  const workspaceMembers = useMemo(
    () => workspaceMembersResult?.records ?? [],
    [workspaceMembersResult],
  );

  const { data: jobDescriptions = [] } = useQuery({
    queryFn: async () => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].recruiting.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = recruitingJobDescriptionsPayloadSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new Error("加载在招岗位列表失败");
      }
      return payload.data.records;
    },
    queryKey: ["job-descriptions", "recruiting", slug],
    staleTime: 60_000,
  });

  const { data: skillSuggestions = [] } = useQuery({
    queryFn: async () => {
      const result = await fetchStudioResumeSkillSuggestions(slug, { limit: 100 });
      return result.records;
    },
    queryKey: ["studio-resumes", "skill-suggestions", slug],
    staleTime: 60_000,
  });

  const refreshResumeList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
  }, [queryClient, slug]);

  const grid = useResumeLibrarySearchState({
    onRefresh: refreshResumeList,
    search: routeSearch,
    slug,
  });
  const { setRowSelection } = grid;

  useEffect(() => {
    setRowSelection({});
  }, [slug, setRowSelection]);

  const [activeSort] = grid.sorting;
  let activeSortOrder: "asc" | "desc" | undefined;
  if (activeSort) {
    activeSortOrder = activeSort.desc ? "desc" : "asc";
  }

  const resumeLibraryListQuery = useInfiniteQuery({
    getNextPageParam: (
      lastPage: PaginatedResumeLibraryResult,
      allPages: PaginatedResumeLibraryResult[],
    ) =>
      lastPage.page < lastPage.totalPages
        ? { knownTotal: allPages[0]?.total, page: lastPage.page + 1 }
        : undefined,
    initialPageParam: initialResumeLibraryPage,
    queryFn: ({ pageParam }) =>
      fetcher({
        filters: grid.filters,
        knownTotal: pageParam.knownTotal,
        page: pageParam.page,
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        search: grid.deferredSearch,
        sortBy: activeSort?.id,
        sortOrder: activeSortOrder,
      }),
    queryKey: buildInfiniteDataGridQueryKey(["studio-resumes", slug], {
      filters: grid.filters,
      search: grid.deferredSearch,
      sortBy: activeSort?.id,
      sortOrder: activeSortOrder,
    }),
    staleTime: 30_000,
  });

  const [metricsScope, setMetricsScope] = useAtom(resumeMetricsScopeAtom);
  const metricsQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => fetchStudioResumeMetrics(slug, metricsScope),
    queryKey: studioResumeKeys.metrics(slug, metricsScope),
    structuralSharing: false,
  });
  /** Dim charts only while switching scope and the previous scope is still shown. */
  const metricsSwitching = metricsQuery.isPlaceholderData;
  const metricsChartKey = metricsQuery.isPlaceholderData
    ? `pending:${metricsScope}`
    : `${metricsScope}:${metricsQuery.dataUpdatedAt}`;

  const retryParseMutation = useMutation({
    mutationFn: (record: ResumeLibraryListRecord) => retryStudioResumeParse(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "重新解析简历失败"),
    onSuccess: () => {
      toast.success("已重新加入解析队列");
      invalidateAll();
    },
  });

  const forceReparseMutation = useMutation({
    mutationFn: (record: ResumeLibraryListRecord) => forceStudioResumeReparse(slug, record.id),
    onError: (error) => toast.error(error instanceof Error ? error.message : "强制重新解析失败"),
    onSuccess: () => {
      toast.success("已重新加入解析队列（将覆盖现有解析结果）");
      invalidateAll();
    },
  });

  const loadedResumeRecords = useMemo(
    () => resumeLibraryListQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [resumeLibraryListQuery.data?.pages],
  );
  const resumeLibraryTotal = resumeLibraryListQuery.data?.pages[0]?.total ?? 0;
  const loadedResumeRowsById = useMemo(
    () => new Map(loadedResumeRecords.map((row) => [row.id, row])),
    [loadedResumeRecords],
  );

  const duplicateMatchesQuery = useQuery({
    enabled: duplicateMatchRecord !== null,
    queryFn: () => fetchStudioResumeDuplicateMatches(slug, duplicateMatchRecord?.id ?? ""),
    queryKey: ["studio-resumes", slug, duplicateMatchRecord?.id, "duplicate-matches"],
  });

  const isInitialPageLoading = resumeLibraryListQuery.isPending && metricsQuery.isPending;

  return {
    activeSort,
    duplicateMatchesQuery,
    forceReparseMutation,
    grid,
    invalidateAll,
    isInitialPageLoading,
    jobDescriptions,
    loadedResumeRecords,
    loadedResumeRowsById,
    metricsChartKey,
    metricsQuery,
    metricsScope,
    metricsSwitching,
    resumeLibraryListQuery,
    resumeLibraryTotal,
    retryParseMutation,
    setMetricsScope,
    skillSuggestions,
    slug,
    workspaceMembers,
  };
}

export type ResumeLibraryPageQueries = ReturnType<typeof useResumeLibraryPageQueries>;
export type { ResumeLibraryGridState };
