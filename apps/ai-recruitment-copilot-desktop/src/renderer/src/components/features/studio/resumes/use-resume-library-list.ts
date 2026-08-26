import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RESUME_LIBRARY_INFINITE_PAGE_SIZE } from "@arc/shared/studio-resumes";
import type { PaginatedResumeLibraryResult } from "@arc/shared/studio-resumes";
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

  const selectedJobIds = useMemo(() => parseCsvValues(filters.jdIds), [filters.jdIds]);
  const selectedStructuredJob =
    selectedJobIds.length === 1
      ? jobDescriptions.find(
          (job) => job.id === selectedJobIds[0] && job.evaluationMode === "structured",
        )
      : undefined;

  // Clear score filters when structured single-JD gate no longer applies (matches web).
  const effectiveFilters = useMemo(() => {
    if (selectedStructuredJob) {
      return filters;
    }
    if (!filters.structuredMinScore && !filters.structuredMaxScore) {
      return filters;
    }
    return {
      ...filters,
      structuredMaxScore: "",
      structuredMinScore: "",
    };
  }, [filters, selectedStructuredJob]);

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
    queryFn: ({ pageParam }) =>
      fetchStudioResumes(requireWorkspaceSlug(slug), {
        creatorIds: parseCsvValues(effectiveFilters.creatorIds),
        jobDescriptionIds: parseCsvValues(effectiveFilters.jdIds),
        knownTotal: pageParam.knownTotal,
        page: pageParam.page,
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        pipelineStages: parseCsvValues(effectiveFilters.stage),
        search: deferredSearch.trim() || undefined,
        skills: parseCsvValues(effectiveFilters.skills),
        sortBy: "createdAt",
        sortOrder: "desc",
        structuredMaxScore: effectiveFilters.structuredMaxScore
          ? Number(effectiveFilters.structuredMaxScore)
          : undefined,
        structuredMinScore: effectiveFilters.structuredMinScore
          ? Number(effectiveFilters.structuredMinScore)
          : undefined,
        textFilters: effectiveFilters.textFilters || undefined,
      }),
    queryKey: [
      "studio-resumes",
      slug,
      "infinite",
      {
        filters: effectiveFilters,
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
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        // Changing JD selection may invalidate score filters; clear when multi/none/legacy.
        if (key === "jdIds") {
          const ids = parseCsvValues(value);
          const jobs = jobDescriptionsQuery.data ?? [];
          const structuredOnly =
            ids.length === 1 &&
            jobs.some((job) => job.id === ids[0] && job.evaluationMode === "structured");
          if (!structuredOnly) {
            next.structuredMaxScore = "";
            next.structuredMinScore = "";
          }
        }
        return next;
      });
    },
    [jobDescriptionsQuery.data],
  );

  const onResetFilters = useCallback(() => {
    setSearch("");
    setFilters(EMPTY_RESUME_LIBRARY_FILTERS);
  }, []);

  return {
    canResetFilters,
    fetchNextPage: listQuery.fetchNextPage,
    filters: effectiveFilters,
    hasActiveFilters: canResetFilters,
    hasNextPage: Boolean(listQuery.hasNextPage),
    isFetchingNextPage: listQuery.isFetchingNextPage,
    isInitialLoading: workspaceQuery.isPending || (Boolean(slug) && listQuery.isPending),
    isRefetching: listQuery.isRefetching && !listQuery.isFetchingNextPage,
    jobDescriptions,
    listError: listQuery.error,
    onFilterChange,
    onResetFilters,
    records,
    refetch: listQuery.refetch,
    search,
    selectedStructuredJob,
    skillSuggestions,
    total,
    workspace: workspaceQuery.data ?? null,
    workspaceError: workspaceQuery.error,
    workspaceMembers,
    workspacePending: workspaceQuery.isPending,
  };
}
