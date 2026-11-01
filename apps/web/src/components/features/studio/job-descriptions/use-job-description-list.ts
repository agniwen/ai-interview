import { listTextQuery } from "@app/shared/list-text-filters";
import type { JobDescriptionListRecord } from "@app/shared/job-descriptions";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useDataGridState } from "@/components/features/data-grid";
import type { DataGridFetchParams } from "@/components/features/data-grid/use-data-grid-state";
import { buildInfiniteDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

// 岗位列表不分页：每次按服务端上限加载一批，滚动接近末尾时再取下一批。
// The job list is unpaginated: load server-max batches and fetch more near the end of the scroll.
const JOB_DESCRIPTION_BATCH_SIZE = 100;
const JOB_DESCRIPTION_TABLE_MAX_HEIGHT = "max(24rem, calc(100svh - 14rem))";

type JobDescriptionListFilters = Record<"departmentId" | "interviewerId", string>;

interface JobDescriptionListQuery {
  departmentId?: string;
  interviewerId?: string;
  page: string;
  pageSize: string;
  search?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

function fetchJobDescriptionPage(
  slug: string,
  params: DataGridFetchParams<JobDescriptionListFilters>,
) {
  const query: JobDescriptionListQuery = {
    ...listTextQuery(params),
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: params.sortBy ?? "priority",
    sortOrder: params.sortOrder ?? "desc",
  };
  if (params.search) {
    query.search = params.search;
  }
  if (params.filters.departmentId) {
    query.departmentId = params.filters.departmentId;
  }
  if (params.filters.interviewerId) {
    query.interviewerId = params.filters.interviewerId;
  }
  return rpcFetch(
    rpc.api.w[":slug"].studio["job-descriptions"].$get({ param: { slug }, query }),
    "加载在招岗位列表失败",
  );
}

type JobDescriptionPage = Awaited<ReturnType<typeof fetchJobDescriptionPage>>;

/**
 * 岗位设置页的列表状态：筛选/排序仍走 URL（useDataGridState），数据按批无限加载，
 * 返回可直接展开到 DataGrid 的虚拟滚动参数。
 * Job settings list state: URL-backed filters/sorting with batched infinite loading, returned
 * as props ready to spread onto a virtualized DataGrid.
 */
export function useJobDescriptionList(slug: string) {
  const fetchPage = useCallback(
    (params: DataGridFetchParams<JobDescriptionListFilters>) =>
      fetchJobDescriptionPage(slug, params),
    [slug],
  );
  const grid = useDataGridState<JobDescriptionListRecord, JobDescriptionListFilters>({
    allowedSortIds: ["priority", "createdAt", "updatedAt"],
    defaultSorting: [{ desc: true, id: "priority" }],
    enabled: false,
    initialFilters: { departmentId: "", interviewerId: "" },
    queryFn: fetchPage,
    queryKeyBase: ["job-descriptions", slug],
  });

  const [activeSort] = grid.sorting;
  let sortOrder: "asc" | "desc" | undefined;
  if (activeSort) {
    sortOrder = activeSort.desc ? "desc" : "asc";
  }
  const listState = {
    filters: grid.filters,
    search: grid.deferredSearch,
    sortBy: activeSort?.id,
    sortOrder,
  };
  const listQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: JobDescriptionPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchPage({ ...listState, page: pageParam, pageSize: JOB_DESCRIPTION_BATCH_SIZE }),
    // 与 grid 的 queryKeyBase 同前缀，grid.invalidate() 会一并刷新。Shares the grid prefix for invalidation.
    queryKey: buildInfiniteDataGridQueryKey(["job-descriptions", slug], listState),
    staleTime: 30_000,
  });

  const records = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.records) ?? [],
    [listQuery.data],
  );
  const { fetchNextPage, refetch } = listQuery;
  const loadNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const listGridProps = {
    data: records,
    error: listQuery.error,
    loading: listQuery.isFetching && !listQuery.isFetchingNextPage && !listQuery.isRefetching,
    maxHeight: JOB_DESCRIPTION_TABLE_MAX_HEIGHT,
    onRetry: retry,
    refetching: listQuery.isRefetching,
    total: listQuery.data?.pages[0]?.total ?? 0,
    virtualized: {
      fetchNextPage: loadNextPage,
      hasNextPage: listQuery.hasNextPage,
      isFetchingNextPage: listQuery.isFetchingNextPage,
    },
  };

  return { grid, listGridProps };
}
