import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { dateRangeFilterBounds } from "@app/shared/date-range-filter";
import { RESUME_LIBRARY_INFINITE_PAGE_SIZE } from "@app/shared/studio-resumes";
import type { PaginatedResumeLibraryResult } from "@app/shared/studio-resumes";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import {
  fetchRecruitingJobDescriptions,
  fetchStudioResumeSkillSuggestions,
  fetchStudioResumes,
  fetchWorkspaceMembers,
} from "@/lib/client/studio-resumes";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";
import {
  EMPTY_RESUME_LIBRARY_FILTERS,
  hasActiveResumeLibraryFilters,
  parseCsvValues,
} from "./resume-library-filter-model";
import type { ResumeLibraryFilters } from "./resume-library-filter-model";

interface ResumeLibraryPageParam {
  knownTotal: number | undefined;
  page: number;
}

const initialResumeLibraryPage: ResumeLibraryPageParam = {
  knownTotal: undefined,
  page: 1,
};

function requireWorkspaceSlug(slug: string | null): string {
  if (!slug) {
    throw new Error("当前工作区不可用");
  }
  return slug;
}

export function useResumeLibraryList() {
  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 60_000,
  });

  const slug = workspaceQuery.data?.slug ?? null;

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ResumeLibraryFilters>(EMPTY_RESUME_LIBRARY_FILTERS);
  const deferredSearch = useDeferredValue(search);

  const membersQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchWorkspaceMembers(requireWorkspaceSlug(slug)),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });

  const jobDescriptionsQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchRecruitingJobDescriptions(requireWorkspaceSlug(slug)),
    queryKey: ["job-descriptions", "recruiting", slug],
    staleTime: 60_000,
  });

  const skillSuggestionsQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchStudioResumeSkillSuggestions(requireWorkspaceSlug(slug), { limit: 100 }),
    queryKey: ["studio-resumes", "skill-suggestions", slug],
    staleTime: 60_000,
  });

  const jobDescriptions = jobDescriptionsQuery.data ?? [];
  const workspaceMembers = membersQuery.data ?? [];
  const skillSuggestions = skillSuggestionsQuery.data ?? [];

  const listQuery = useInfiniteQuery({
    enabled: Boolean(slug),
    getNextPageParam: (
      lastPage: PaginatedResumeLibraryResult,
      allPages: PaginatedResumeLibraryResult[],
    ) =>
      lastPage.page < lastPage.totalPages
        ? { knownTotal: allPages[0]?.total, page: lastPage.page + 1 }
        : undefined,
    initialPageParam: initialResumeLibraryPage,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }) => {
      const bounds = dateRangeFilterBounds(filters.createdAtRange);
      return fetchStudioResumes(requireWorkspaceSlug(slug), {
        createdFrom: bounds?.from,
        createdTo: bounds?.to,
        creatorIds: parseCsvValues(filters.creatorIds),
        jobDescriptionIds: parseCsvValues(filters.jdIds),
        knownTotal: pageParam.knownTotal,
        page: pageParam.page,
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        pipelineStages: parseCsvValues(filters.stage),
        recommendationLevels: parseCsvValues(filters.recommendationLevels),
        search: deferredSearch.trim() || undefined,
        skills: parseCsvValues(filters.skills),
        sortBy: "createdAt",
        sortOrder: "desc",
        textFilters: filters.textFilters || undefined,
      });
    },
    queryKey: [
      "studio-resumes",
      slug,
      "infinite",
      {
        filters,
        search: deferredSearch.trim(),
        sortBy: "createdAt",
        sortOrder: "desc",
      },
    ],
    staleTime: 30_000,
  });

  const records = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [listQuery.data?.pages],
  );
  const total = listQuery.data?.pages[0]?.total ?? 0;

  const canResetFilters = hasActiveResumeLibraryFilters(search, filters);

  const onFilterChange = useCallback(
    (key: keyof ResumeLibraryFilters | "search", value: string) => {
      if (key === "search") {
        setSearch(value);
        return;
      }
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const onResetFilters = useCallback(() => {
    setSearch("");
    setFilters((current) => ({ ...EMPTY_RESUME_LIBRARY_FILTERS, stage: current.stage }));
  }, []);

  const { fetchNextPage: fetchNextResumePage } = listQuery;
  const fetchNextPage = useCallback(async () => {
    await fetchNextResumePage({ cancelRefetch: false });
  }, [fetchNextResumePage]);

  const retry = () => {
    if (listQuery.isFetchNextPageError) {
      void fetchNextPage();
    } else {
      void listQuery.refetch();
    }
  };

  return {
    canResetFilters,
    fetchNextPage,
    filters,
    hasActiveFilters: canResetFilters || Boolean(filters.stage),
    hasNextPage: Boolean(listQuery.hasNextPage),
    isFetching: listQuery.isFetching,
    isFetchingNextPage: listQuery.isFetchingNextPage,
    isInitialLoading: workspaceQuery.isPending || (Boolean(slug) && listQuery.isPending),
    isRefetching: listQuery.isRefetching && !listQuery.isFetchingNextPage,
    jobDescriptions,
    listError: listQuery.error,
    onFilterChange,
    onResetFilters,
    records,
    refetch: listQuery.refetch,
    retry,
    search,
    skillSuggestions,
    total,
    workspace: workspaceQuery.data ?? null,
    workspaceError: workspaceQuery.error,
    workspaceMembers,
    workspacePending: workspaceQuery.isPending,
  };
}
