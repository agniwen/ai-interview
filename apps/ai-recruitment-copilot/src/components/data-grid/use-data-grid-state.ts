"use client";

import type { OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  buildDataGridQueryKey,
  normalizeDataGridQueryState,
  parseStrictPositiveInteger,
} from "./query-contract";
import type { DataGridSortOrder } from "./query-contract";

export interface DataGridFetchParams<F extends Record<string, string>> {
  page: number;
  pageSize: number;
  search: string;
  filters: F;
  sortBy: string | undefined;
  sortOrder: "asc" | "desc" | undefined;
}

export interface DataGridFetchResult<TData> {
  records: TData[];
  total: number;
  totalPages: number;
}

export interface UseDataGridStateOptions<TData, F extends Record<string, string>> {
  queryKeyBase: readonly unknown[];
  queryFn: (params: DataGridFetchParams<F>) => Promise<DataGridFetchResult<TData>>;
  allowedSortIds?: readonly string[];
  defaultPageSize?: number;
  defaultSorting?: SortingState;
  initialFilters: F;
  maxPageSize?: number;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
}

function getInitialSortOrder(first: SortingState[number] | undefined): string {
  if (!first) {
    return "";
  }
  return first.desc === true ? "desc" : "asc";
}

export function buildDataGridFilterResetSignature<F extends Record<string, string>>({
  filters,
  filterKeys,
  search,
}: {
  filters: F;
  filterKeys: readonly (keyof F & string)[];
  search: string;
}) {
  return JSON.stringify({
    filters: filterKeys.map((key) => [key, filters[key]]),
    search: search.trim(),
  });
}

function firstSearchValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }
  if (Array.isArray(value) && (typeof value[0] === "number" || typeof value[0] === "boolean")) {
    return String(value[0]);
  }
  return undefined;
}

export function useDataGridState<TData, F extends Record<string, string>>(
  opts: UseDataGridStateOptions<TData, F>,
) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const routeSearch = useRouterState({
    select: (state) => state.location.search as Record<string, unknown>,
  });
  const queryClient = useQueryClient();
  const defaultPageSize = opts.defaultPageSize ?? 10;

  const page = parseStrictPositiveInteger(firstSearchValue(routeSearch.page), 1);
  const pageSize = parseStrictPositiveInteger(
    firstSearchValue(routeSearch.pageSize),
    defaultPageSize,
  );
  const search = firstSearchValue(routeSearch.search) ?? "";
  const deferredSearch = useDeferredValue(search);

  // Multi-key filter state via route search (each filter gets its own URL key).
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- intentional: filterKeys locked at mount
  const filterKeys = useMemo(() => Object.keys(opts.initialFilters) as (keyof F & string)[], []);
  const filters = useMemo(() => {
    const out = {} as F;
    for (const key of filterKeys) {
      out[key] = (firstSearchValue(routeSearch[key]) ?? opts.initialFilters[key]) as F[typeof key];
    }
    return out;
  }, [filterKeys, opts.initialFilters, routeSearch]);

  const initialSortFirst = opts.defaultSorting?.[0];
  const fallbackSortBy = initialSortFirst?.id;
  const fallbackSortOrder = initialSortFirst
    ? (getInitialSortOrder(initialSortFirst) as DataGridSortOrder)
    : undefined;
  const sortBy = firstSearchValue(routeSearch.sortBy) ?? fallbackSortBy ?? "";
  const sortOrder =
    firstSearchValue(routeSearch.sortOrder) ?? getInitialSortOrder(initialSortFirst);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const updateRouteSearch = useCallback(
    (updates: Record<string, number | string | undefined>) => {
      void router.navigate({
        replace: true,
        resetScroll: false,
        search: (prev: Record<string, unknown>) => {
          const nextSearch: Record<string, unknown> = Object.fromEntries(
            Object.entries(prev).filter(
              ([key]) => !(Object.hasOwn(updates, key) && updates[key] === undefined),
            ),
          );
          for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
              nextSearch[key] = value;
            }
          }
          return nextSearch;
        },
        to: pathname,
      } as never);
    },
    [pathname, router],
  );

  const setPageRaw = useCallback(
    (value: number) => updateRouteSearch({ page: value }),
    [updateRouteSearch],
  );
  const setPageSizeRaw = useCallback(
    (value: number) => updateRouteSearch({ pageSize: value }),
    [updateRouteSearch],
  );
  const setSearchRaw = useCallback(
    (value: string) => updateRouteSearch({ search: value || undefined }),
    [updateRouteSearch],
  );
  const setFilter = useCallback(
    (key: keyof F & string, value: string) => updateRouteSearch({ [key]: value || undefined }),
    [updateRouteSearch],
  );
  const updateRouteSearchAndResetPage = useCallback(
    (updates: Record<string, string | undefined>) => {
      updateRouteSearch({ ...updates, page: 1 });
    },
    [updateRouteSearch],
  );

  const filterResetSig = buildDataGridFilterResetSignature({
    filterKeys,
    filters,
    search: deferredSearch,
  });
  const lastFilterSig = useRef<string>(filterResetSig);
  useEffect(() => {
    if (filterResetSig !== lastFilterSig.current) {
      lastFilterSig.current = filterResetSig;
      if (page !== 1) {
        setPageRaw(1);
      }
    }
  }, [filterResetSig, page, setPageRaw]);

  const queryParams = useMemo(
    () =>
      normalizeDataGridQueryState(
        {
          filters,
          page,
          pageSize,
          search: deferredSearch,
          sortBy,
          sortOrder: (sortOrder as DataGridSortOrder) || undefined,
        },
        {
          allowedSortIds: opts.allowedSortIds,
          defaultPageSize,
          fallbackSortBy,
          fallbackSortOrder,
          maxPageSize: opts.maxPageSize,
        },
      ),
    [
      deferredSearch,
      defaultPageSize,
      fallbackSortBy,
      fallbackSortOrder,
      filters,
      opts.allowedSortIds,
      opts.maxPageSize,
      page,
      pageSize,
      sortBy,
      sortOrder,
    ],
  );

  const sorting: SortingState = useMemo(() => {
    if (!queryParams.sortBy) {
      return [];
    }
    return [{ desc: queryParams.sortOrder === "desc", id: queryParams.sortBy }];
  }, [queryParams.sortBy, queryParams.sortOrder]);

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const [head] = next;
    let nextOrder = "";
    if (head) {
      nextOrder = head.desc === true ? "desc" : "asc";
    }
    updateRouteSearchAndResetPage({
      sortBy: head?.id || undefined,
      sortOrder: nextOrder || undefined,
    });
  };

  const queryKey = useMemo(
    () => buildDataGridQueryKey(opts.queryKeyBase, queryParams),
    [opts.queryKeyBase, queryParams],
  );

  const listQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => opts.queryFn(queryParams),
    queryKey,
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? true,
    staleTime: opts.staleTime ?? 30 * 1000,
  });

  const emptyFallback = useMemo<DataGridFetchResult<TData>>(
    () => ({ records: [], total: 0, totalPages: 0 }),
    [],
  );
  const data = listQuery.data ?? emptyFallback;
  const loading = listQuery.isFetching && !listQuery.isRefetching;
  const refetching = listQuery.isRefetching;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: opts.queryKeyBase });
  }

  function retry() {
    void listQuery.refetch();
  }

  const pagination = {
    onPageChange: (p: number) => setPageRaw(p),
    onPageSizeChange: (s: number) => {
      updateRouteSearch({ page: 1, pageSize: s });
    },
    page: queryParams.page,
    pageSize: queryParams.pageSize,
  };

  const filterValues = useMemo(() => {
    const out: Record<string, string> = { search };
    for (const key of filterKeys) {
      out[key] = filters[key];
    }
    return out;
  }, [search, filters, filterKeys]);

  const onFilterChange = (key: string, value: string) => {
    if (key === "search") {
      updateRouteSearchAndResetPage({ search: value || undefined });
      return;
    }
    updateRouteSearchAndResetPage({ [key]: value || undefined });
  };

  // 是否处于"非默认"过滤状态（用于决定 reset 按钮的 disabled 态）。
  // / Whether any filter (incl. search) deviates from initialFilters defaults.
  const canResetFilters =
    search.trim() !== "" || filterKeys.some((k) => filters[k] !== opts.initialFilters[k]);

  const onResetFilters = () => {
    const updates: Record<string, number | string | undefined> = { page: 1, search: undefined };
    for (const key of filterKeys) {
      updates[key] = opts.initialFilters[key] || undefined;
    }
    updateRouteSearch(updates);
  };

  const bind = {
    canResetFilters,
    data: data.records,
    error: listQuery.error,
    filterValues,
    loading,
    onFilterChange,
    onRefresh: invalidate,
    onResetFilters,
    onRetry: retry,
    onRowSelectionChange: setRowSelection,
    onSortingChange,
    pagination,
    refetching,
    rowSelection,
    sorting,
    total: data.total,
    totalPages: data.totalPages,
  };

  return {
    bind,
    data,
    deferredSearch,
    filters,
    invalidate,
    loading,
    page: queryParams.page,
    pageSize: queryParams.pageSize,
    queryKey,
    refetching,
    rowSelection,
    search,
    setFilter,
    setPage: setPageRaw,
    setPageSize: setPageSizeRaw,
    setRowSelection,
    setSearch: setSearchRaw,
    setSorting: onSortingChange,
    sorting,
  };
}
