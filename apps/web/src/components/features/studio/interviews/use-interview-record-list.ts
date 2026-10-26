import { listTextQuery } from "@app/shared/list-text-filters";
import type {
  PaginatedStudioInterviewRecordsResult,
  StudioInterviewRecordListRecord,
} from "@app/shared/studio-interview-rounds";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useDataGridState } from "@/components/features/data-grid";
import type { DataGridFetchParams } from "@/components/features/data-grid/use-data-grid-state";
import { buildInfiniteDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

// 面试记录不分页：每批加载 40 条，滚动接近末尾时再取下一批。
// Interview records load in batches of 40 and fetch more near the end of the scroll.
const INTERVIEW_RECORD_BATCH_SIZE = 40;
const INTERVIEW_RECORD_TABLE_MAX_HEIGHT = "max(24rem, calc(100svh - 22rem))";

export const INTERVIEW_RECORD_SORTABLE_COLUMN_IDS = ["createdAt", "lastInterviewAt"] as const;

type InterviewRecordFilters = Record<"creatorIds" | "status" | "kind", string>;

function fetchInterviewRecordPage(
  slug: string,
  params: DataGridFetchParams<InterviewRecordFilters>,
): Promise<PaginatedStudioInterviewRecordsResult> {
  const query: SearchParamsRecord = {
    ...listTextQuery(params),
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: params.sortBy ?? "createdAt",
    sortOrder: params.sortOrder ?? "desc",
  };
  if (params.filters.kind === "ai" || params.filters.kind === "human") {
    query.kind = params.filters.kind;
  }
  if (params.search) {
    query.search = params.search;
  }
  // 多选过滤：CSV 形式传递给后端。/ Multi-select: CSV-serialised for the backend.
  if (params.filters.status) {
    query.status = params.filters.status;
  }
  if (params.filters.creatorIds) {
    query.creatorIds = params.filters.creatorIds;
  }
  return rpcFetch(
    rpc.api.w[":slug"].studio.interviews.$get({ param: { slug }, query }),
    "加载面试记录失败",
  );
}

/**
 * 面试记录页的列表状态：筛选/排序仍走 URL（useDataGridState），数据按批无限加载，
 * 返回可直接展开到 DataGrid 的虚拟滚动参数与当前列表的查询键。
 * Interview records list state: URL-backed filters/sorting with batched infinite loading,
 * returned as virtualized DataGrid props plus the active list query key.
 */
export function useInterviewRecordList(slug: string) {
  const fetchPage = useCallback(
    (params: DataGridFetchParams<InterviewRecordFilters>) => fetchInterviewRecordPage(slug, params),
    [slug],
  );
  const grid = useDataGridState<StudioInterviewRecordListRecord, InterviewRecordFilters>({
    allowedSortIds: INTERVIEW_RECORD_SORTABLE_COLUMN_IDS,
    defaultSorting: [{ desc: true, id: "createdAt" }],
    enabled: false,
    initialFilters: { creatorIds: "", kind: "all", status: "" },
    queryFn: fetchPage,
    queryKeyBase: ["studio-interviews", slug],
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
  // 与 grid 的 queryKeyBase 同前缀，失效 ["studio-interviews"] 会一并刷新。
  // Shares the grid prefix, so invalidating ["studio-interviews"] refreshes it too.
  const queryKey = buildInfiniteDataGridQueryKey(["studio-interviews", slug], listState);
  const listQuery = useInfiniteQuery({
    getNextPageParam: (lastPage: PaginatedStudioInterviewRecordsResult) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchPage({ ...listState, page: pageParam, pageSize: INTERVIEW_RECORD_BATCH_SIZE }),
    queryKey,
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
    maxHeight: INTERVIEW_RECORD_TABLE_MAX_HEIGHT,
    onRetry: retry,
    refetching: listQuery.isRefetching,
    total: listQuery.data?.pages[0]?.total ?? 0,
    virtualized: {
      fetchNextPage: loadNextPage,
      hasNextPage: listQuery.hasNextPage,
      isFetchingNextPage: listQuery.isFetchingNextPage,
    },
  };

  return { grid, listGridProps, queryKey };
}
