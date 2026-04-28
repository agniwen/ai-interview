"use client";

import type { OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

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
  namespace: string;
  fetcher: (params: DataGridFetchParams<F>) => Promise<DataGridFetchResult<TData>>;
  initialData: DataGridFetchResult<TData> & { page: number; pageSize: number };
  defaultPageSize?: number;
  defaultSorting?: SortingState;
  initialFilters: F;
  syncToUrl?: boolean;
  refetchOnWindowFocus?: boolean;
  staleTime?: number;
}

function getInitialSortOrder(first: SortingState[number] | undefined): string {
  if (!first) {
    return "";
  }
  return first.desc === true ? "desc" : "asc";
}

export function useDataGridState<TData, F extends Record<string, string>>(
  opts: UseDataGridStateOptions<TData, F>,
) {
  const queryClient = useQueryClient();
  const defaultPageSize = opts.defaultPageSize ?? opts.initialData.pageSize ?? 10;

  const [page, setPageRaw] = useQueryState("page", parseAsInteger.withDefault(1));
  const [pageSize, setPageSizeRaw] = useQueryState(
    "pageSize",
    parseAsInteger.withDefault(defaultPageSize),
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

  const initialSort = opts.defaultSorting ?? [];
  const [sortBy, setSortByRaw] = useQueryState(
    "sortBy",
    parseAsString.withDefault(initialSort[0]?.id ?? ""),
  );
  const [sortOrder, setSortOrderRaw] = useQueryState(
    "sortOrder",
    parseAsString.withDefault(getInitialSortOrder(initialSort[0])),
  );
  const sorting: SortingState = useMemo(() => {
    if (!sortBy) {
      return [];
    }
    return [{ desc: sortOrder === "desc", id: sortBy }];
  }, [sortBy, sortOrder]);

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

  const queryKey = useMemo(
    () =>
      [
        opts.namespace,
        deferredSearch.trim(),
        ...filterKeys.map((k) => filters[k]),
        page,
        pageSize,
        sortBy,
        sortOrder,
      ] as const,
    [opts.namespace, deferredSearch, filters, filterKeys, page, pageSize, sortBy, sortOrder],
  );

  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    queryClient.setQueryData(queryKey, opts.initialData);
  }

  const listQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () =>
      opts.fetcher({
        filters,
        page,
        pageSize,
        search: deferredSearch.trim(),
        sortBy: sortBy || undefined,
        sortOrder: (sortOrder as "asc" | "desc") || undefined,
      }),
    queryKey,
    refetchOnWindowFocus: opts.refetchOnWindowFocus ?? true,
    staleTime: opts.staleTime ?? 30 * 1000,
  });

  const data = listQuery.data ?? opts.initialData;
  const loading = listQuery.isFetching && !listQuery.isRefetching;
  const refetching = listQuery.isRefetching;

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: [opts.namespace] });
  }

  const pagination = {
    onPageChange: (p: number) => void setPageRaw(p),
    onPageSizeChange: (s: number) => {
      void setPageSizeRaw(s);
      void setPageRaw(1);
    },
    page,
    pageSize,
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

  const bind = {
    data: data.records,
    filterValues,
    loading,
    onFilterChange,
    onRefresh: invalidate,
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
    page,
    pageSize,
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
