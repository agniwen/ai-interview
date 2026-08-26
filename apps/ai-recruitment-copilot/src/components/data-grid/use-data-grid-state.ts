"use client";

import { functionalUpdate } from "@tanstack/react-table";
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
  keywordSearch?: boolean;
  maxPageSize?: number;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
}

type SearchParamValue = boolean | number | string | readonly (boolean | number | string)[];

type RouteSearchParams = Record<string, SearchParamValue | undefined>;

type RouteSearchUpdates = Record<string, number | string | undefined>;

const EMPTY_ROUTE_SEARCH: RouteSearchParams = {};

function isSearchParamValue(value: unknown): value is SearchParamValue {
  if (Array.isArray(value)) {
    return value.every(
      (item): item is boolean | number | string =>
        typeof item === "boolean" || typeof item === "number" || typeof item === "string",
    );
  }
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function isRouteSearchParams(value: unknown): value is RouteSearchParams {
  return (
    value !== null &&
    typeof value === "object" &&
    Object.values(value).every((item) => item === undefined || isSearchParamValue(item))
  );
}

function getInitialSortOrder(
  first: SortingState[number] | undefined,
): DataGridSortOrder | undefined {
  if (!first) {
    return undefined;
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

function firstSearchValue(value: SearchParamValue | undefined): string | undefined {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue === undefined ? undefined : String(firstValue);
}

export function useDataGridState<TData, F extends Record<string, string>>(
  opts: UseDataGridStateOptions<TData, F>,
) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const rawRouteSearch = useRouterState({
    select: (state) => state.location.search,
  });
  const routeSearch: RouteSearchParams = isRouteSearchParams(rawRouteSearch)
    ? rawRouteSearch
    : EMPTY_ROUTE_SEARCH;
  const queryClient = useQueryClient();
  const defaultPageSize = opts.defaultPageSize ?? 10;

  const page = parseStrictPositiveInteger(firstSearchValue(routeSearch.page), 1);
  const pageSize = parseStrictPositiveInteger(
    firstSearchValue(routeSearch.pageSize),
    defaultPageSize,
  );
  const search = opts.keywordSearch ? (firstSearchValue(routeSearch.search) ?? "") : "";
  const deferredSearch = useDeferredValue(search);

  // Multi-key filter state via route search (each filter gets its own URL key).
  // SAFETY: Object.keys returns own keys of the owner-supplied initial filter map.
  // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps -- intentional: filterKeys locked at mount
  const filterKeys = useMemo(() => Object.keys(opts.initialFilters) as (keyof F & string)[], []);
  const filters = useMemo(() => {
    const out = { ...opts.initialFilters };
    for (const key of filterKeys) {
      // SAFETY: this hook accepts only string-valued filter maps; URL values are normalized to strings.
      out[key] = (firstSearchValue(routeSearch[key]) ?? opts.initialFilters[key]) as F[typeof key];
    }
    return { ...out, textFilters: firstSearchValue(routeSearch.textFilters) ?? "" };
  }, [filterKeys, opts.initialFilters, routeSearch]);

  const initialSortFirst = opts.defaultSorting?.[0];
  const fallbackSortBy = initialSortFirst?.id;
  const fallbackSortOrder = getInitialSortOrder(initialSortFirst);
  const sortBy = firstSearchValue(routeSearch.sortBy) ?? fallbackSortBy ?? "";
  const sortOrder =
    firstSearchValue(routeSearch.sortOrder) ?? getInitialSortOrder(initialSortFirst);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const updateRouteSearch = useCallback(
    (updates: RouteSearchUpdates) => {
      void router.navigate({
        replace: true,
        resetScroll: false,
        search: (prev) => {
          const nextSearch = { ...prev };
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined) {
              Reflect.deleteProperty(nextSearch, key);
            }
          }
          for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined) {
              nextSearch[key] = value;
            }
          }
          return nextSearch;
        },
        to: pathname,
      });
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
    (key: keyof F & string, value: string) => {
      setRowSelection({});
      updateRouteSearch({ [key]: value || undefined, page: 1 });
    },
    [updateRouteSearch],
  );
  const updateRouteSearchAndResetPage = useCallback(
    (updates: Record<string, string | undefined>) => {
      setRowSelection({});
      updateRouteSearch({ ...updates, page: 1 });
    },
    [updateRouteSearch],
  );

  const filterResetSig = buildDataGridFilterResetSignature({
    filterKeys: [...filterKeys, "textFilters"],
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

  const queryParams = useMemo(() => {
    const sortOrderValue = sortOrder === "asc" || sortOrder === "desc" ? sortOrder : undefined;
    return normalizeDataGridQueryState(
      {
        filters,
        page,
        pageSize,
        search: deferredSearch,
        sortBy,
        sortOrder: sortOrderValue,
      },
      {
        allowedSortIds: opts.allowedSortIds,
        defaultPageSize,
        fallbackSortBy,
        fallbackSortOrder,
        maxPageSize: opts.maxPageSize,
      },
    );
  }, [
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
  ]);

  const sorting: SortingState = useMemo(() => {
    if (!queryParams.sortBy) {
      return [];
    }
    return [{ desc: queryParams.sortOrder === "desc", id: queryParams.sortBy }];
  }, [queryParams.sortBy, queryParams.sortOrder]);

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = functionalUpdate(updater, sorting);
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

  const filterValues = useMemo(() => ({ ...filters, search }), [search, filters]);

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
    search.trim() !== "" ||
    Boolean(filters.textFilters) ||
    filterKeys.some((k) => filters[k] !== opts.initialFilters[k]);

  const onResetFilters = (clearedValues?: Record<string, string>) => {
    setRowSelection({});
    const updates = Object.fromEntries([
      ...(clearedValues
        ? Object.entries(clearedValues).map(([key, value]) => [key, value || undefined])
        : [
            ["page", 1],
            ["search", undefined],
            ["textFilters", undefined],
            ...filterKeys.map((key) => [key, opts.initialFilters[key] || undefined]),
          ]),
      ["page", 1],
    ]);
    updateRouteSearch(updates);
  };

  const bind = {
    canResetFilters,
    data: data.records,
    error: listQuery.error,
    filterStorageKey: String(opts.queryKeyBase[0]),
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
