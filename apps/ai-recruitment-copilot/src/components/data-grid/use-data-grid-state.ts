"use client";

import type { OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createParser, parseAsString, useQueryState } from "nuqs";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

const parseAsStrictPositiveInteger = createParser({
  parse: (value) => {
    const parsed = parseStrictPositiveInteger(value, Number.NaN);
    return Number.isNaN(parsed) ? null : parsed;
  },
  serialize: String,
});

export function useDataGridState<TData, F extends Record<string, string>>(
  opts: UseDataGridStateOptions<TData, F>,
) {
  const queryClient = useQueryClient();
  const defaultPageSize = opts.defaultPageSize ?? 10;

  const [page, setPageRaw] = useQueryState("page", parseAsStrictPositiveInteger.withDefault(1));
  const [pageSize, setPageSizeRaw] = useQueryState(
    "pageSize",
    parseAsStrictPositiveInteger.withDefault(defaultPageSize),
  );
  const [search, setSearchRaw] = useQueryState("search", parseAsString.withDefault(""));
  const deferredSearch = useDeferredValue(search);

  // Multi-key filter state via nuqs (each filter gets its own URL key).
  // filterKeys order is locked at mount via useMemo([]) so the hook order in the
  // .map below stays stable across renders — that is the React rule that matters.
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- intentional: filterKeys locked at mount
  const filterKeys = useMemo(() => Object.keys(opts.initialFilters) as (keyof F & string)[], []);
  const filterStates = filterKeys.map((key) =>
    // oxlint-disable-next-line eslint-plugin-react-hooks/rules-of-hooks -- hook count stable (filterKeys locked at mount)
    useQueryState(key, parseAsString.withDefault(opts.initialFilters[key])),
  );
  const filters = useMemo(() => {
    const out = {} as F;
    let idx = 0;
    for (const key of filterKeys) {
      out[key] = filterStates[idx][0] as F[typeof key];
      idx += 1;
    }
    return out;
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- filterStates spread intentional
  }, [filterKeys, ...filterStates.map((s) => s[0])]);
  const setFilter = (key: keyof F & string, value: string) => {
    const idx = filterKeys.indexOf(key);
    if (idx !== -1) {
      void filterStates[idx][1](value);
    }
  };

  const initialSortFirst = opts.defaultSorting?.[0];
  const fallbackSortBy = initialSortFirst?.id;
  const fallbackSortOrder = initialSortFirst
    ? (getInitialSortOrder(initialSortFirst) as DataGridSortOrder)
    : undefined;
  const [sortBy, setSortByRaw] = useQueryState(
    "sortBy",
    parseAsString.withDefault(fallbackSortBy ?? ""),
  );
  const [sortOrder, setSortOrderRaw] = useQueryState(
    "sortOrder",
    parseAsString.withDefault(getInitialSortOrder(initialSortFirst)),
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const lastFilterSig = useRef<string>(JSON.stringify({ filters, search: deferredSearch.trim() }));
  useEffect(() => {
    const sig = JSON.stringify({ filters, search: deferredSearch.trim() });
    if (sig !== lastFilterSig.current) {
      lastFilterSig.current = sig;
      if (page !== 1) {
        void setPageRaw(1);
      }
    }
  }, [filters, deferredSearch, page, setPageRaw]);

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
    void setSortByRaw(head?.id ?? "");
    let nextOrder = "";
    if (head) {
      nextOrder = head.desc === true ? "desc" : "asc";
    }
    void setSortOrderRaw(nextOrder);
    void setPageRaw(1);
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

  const pagination = {
    onPageChange: (p: number) => void setPageRaw(p),
    onPageSizeChange: (s: number) => {
      void setPageSizeRaw(s);
      void setPageRaw(1);
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
      void setSearchRaw(value);
      return;
    }
    setFilter(key as keyof F & string, value);
  };

  // 是否处于"非默认"过滤状态（用于决定 reset 按钮的 disabled 态）。
  // / Whether any filter (incl. search) deviates from initialFilters defaults.
  const canResetFilters =
    search.trim() !== "" || filterKeys.some((k) => filters[k] !== opts.initialFilters[k]);

  const onResetFilters = () => {
    void setSearchRaw("");
    for (const key of filterKeys) {
      setFilter(key, opts.initialFilters[key]);
    }
    void setPageRaw(1);
  };

  const bind = {
    canResetFilters,
    data: data.records,
    filterValues,
    loading,
    onFilterChange,
    onRefresh: invalidate,
    onResetFilters,
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
    setPage: (p: number) => void setPageRaw(p),
    setPageSize: (s: number) => void setPageSizeRaw(s),
    setRowSelection,
    setSearch: (v: string) => void setSearchRaw(v),
    setSorting: onSortingChange,
    sorting,
  };
}
