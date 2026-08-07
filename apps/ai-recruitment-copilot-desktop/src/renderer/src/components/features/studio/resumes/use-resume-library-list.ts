import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RESUME_LIBRARY_INFINITE_PAGE_SIZE } from "@arc/shared/studio-resumes";
import type { PaginatedResumeLibraryResult } from "@arc/shared/studio-resumes";
import { useMemo } from "react";
import { fetchStudioResumes } from "@/lib/client/studio-resumes";
import { resolveActiveWorkspace } from "@/lib/client/workspace";

export function useResumeLibraryList() {
  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: ["desktop-active-workspace"],
    staleTime: 60_000,
  });

  const slug = workspaceQuery.data?.slug ?? null;

  const listQuery = useInfiniteQuery({
    enabled: Boolean(slug),
    getNextPageParam: (
      lastPage: PaginatedResumeLibraryResult,
      allPages: PaginatedResumeLibraryResult[],
    ) =>
      lastPage.page < lastPage.totalPages
        ? { knownTotal: allPages[0]?.total, page: lastPage.page + 1 }
        : undefined,
    initialPageParam: { knownTotal: undefined as number | undefined, page: 1 },
    queryFn: ({ pageParam }) =>
      fetchStudioResumes(slug as string, {
        knownTotal: pageParam.knownTotal,
        page: pageParam.page,
        pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    queryKey: ["studio-resumes", slug, "infinite", { sortBy: "createdAt", sortOrder: "desc" }],
    staleTime: 30_000,
  });

  const records = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [listQuery.data?.pages],
  );
  const total = listQuery.data?.pages[0]?.total ?? 0;

  return {
    fetchNextPage: listQuery.fetchNextPage,
    hasNextPage: Boolean(listQuery.hasNextPage),
    isFetchingNextPage: listQuery.isFetchingNextPage,
    isInitialLoading: workspaceQuery.isPending || (Boolean(slug) && listQuery.isPending),
    isRefetching: listQuery.isRefetching,
    listError: listQuery.error,
    records,
    refetch: listQuery.refetch,
    total,
    workspace: workspaceQuery.data ?? null,
    workspaceError: workspaceQuery.error,
    workspacePending: workspaceQuery.isPending,
  };
}
