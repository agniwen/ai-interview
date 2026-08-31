import type { SortingState } from "@tanstack/react-table";

export type DataGridSortOrder = "asc" | "desc";

export interface DataGridQueryState<F extends Record<string, string>> {
  page: number;
  pageSize: number;
  search: string;
  filters: F;
  sortBy: string | undefined;
  sortOrder: DataGridSortOrder | undefined;
}

export type InfiniteDataGridQueryState<F extends Record<string, string>> = Pick<
  DataGridQueryState<F>,
  "filters" | "search" | "sortBy" | "sortOrder"
>;

interface ParseDataGridSearchParamsOptions<F extends Record<string, string>> {
  initialFilters: F;
  allowedSortIds?: readonly string[];
  defaultPageSize?: number;
  defaultSorting?: SortingState;
  maxPageSize?: number;
}

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsValue = SearchParamsPrimitive | SearchParamsPrimitive[] | undefined;
type SearchParamsRecord = Record<string, SearchParamsValue>;
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_MAX_PAGE_SIZE = 100;
const STRICT_DECIMAL_INTEGER_PATTERN = /^[1-9]\d*$/;

function firstParam(value: SearchParamsValue): string | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return first === undefined ? undefined : String(first);
  }
  return value === undefined ? undefined : String(value);
}

export function parseStrictPositiveInteger(value: string | undefined, fallback: number): number {
  const raw = value?.trim();
  if (!raw) {
    return fallback;
  }
  if (!STRICT_DECIMAL_INTEGER_PATTERN.test(raw)) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveIntegerOrDefault(value: SearchParamsValue, fallback: number): number {
  return parseStrictPositiveInteger(firstParam(value), fallback);
}

function normalizePositiveInteger(value: number, fallback: number, max: number): number {
  if (!(Number.isSafeInteger(value) && value > 0)) {
    return fallback;
  }
  return Math.min(value, max);
}

function sortOrderFromSorting(
  first: SortingState[number] | undefined,
): DataGridSortOrder | undefined {
  if (!first) {
    return undefined;
  }
  return first.desc === true ? "desc" : "asc";
}

function normalizeSortOrder(value: SearchParamsValue): DataGridSortOrder | undefined {
  const raw = firstParam(value);
  return raw === "asc" || raw === "desc" ? raw : undefined;
}

function normalizeSortBy(
  value: SearchParamsValue,
  fallback: string | undefined,
  allowedSortIds: readonly string[] | undefined,
): string | undefined {
  const raw = firstParam(value) || fallback;
  if (!raw) {
    return undefined;
  }
  if (allowedSortIds && !allowedSortIds.includes(raw)) {
    return fallback;
  }
  return raw;
}

export function normalizeDataGridQueryState<F extends Record<string, string>>(
  state: DataGridQueryState<F>,
  options: {
    allowedSortIds?: readonly string[];
    defaultPageSize?: number;
    fallbackSortBy?: string | undefined;
    fallbackSortOrder?: DataGridSortOrder | undefined;
    maxPageSize?: number;
  } = {},
): DataGridQueryState<F> {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? DEFAULT_MAX_PAGE_SIZE;
  return {
    ...state,
    page: normalizePositiveInteger(state.page, 1, Number.MAX_SAFE_INTEGER),
    pageSize: normalizePositiveInteger(state.pageSize, defaultPageSize, maxPageSize),
    search: state.search.trim(),
    sortBy: normalizeSortBy(state.sortBy, options.fallbackSortBy, options.allowedSortIds),
    sortOrder: normalizeSortOrder(state.sortOrder) ?? options.fallbackSortOrder,
  };
}

export function parseDataGridSearchParams<F extends Record<string, string>>(
  searchParams: SearchParamsRecord,
  options: ParseDataGridSearchParamsOptions<F>,
): DataGridQueryState<F> {
  const firstSort = options.defaultSorting?.[0];
  // SAFETY: The accumulator is populated only from keys and string values owned by initialFilters.
  const filters = {} as F;
  // SAFETY: Object.keys returns exactly the own string keys declared by the generic filter owner.
  for (const key of Object.keys(options.initialFilters) as (keyof F & string)[]) {
    // SAFETY: Both the parsed query value and its owner-provided fallback satisfy F's string value.
    filters[key] = (firstParam(searchParams[key]) ?? options.initialFilters[key]) as F[typeof key];
  }

  return normalizeDataGridQueryState(
    {
      filters,
      page: positiveIntegerOrDefault(searchParams.page, 1),
      pageSize: positiveIntegerOrDefault(
        searchParams.pageSize,
        options.defaultPageSize ?? DEFAULT_PAGE_SIZE,
      ),
      search: firstParam(searchParams.search) ?? "",
      sortBy: normalizeSortBy(searchParams.sortBy, firstSort?.id, options.allowedSortIds),
      sortOrder: normalizeSortOrder(searchParams.sortOrder) ?? sortOrderFromSorting(firstSort),
    },
    {
      allowedSortIds: options.allowedSortIds,
      defaultPageSize: options.defaultPageSize,
      fallbackSortBy: firstSort?.id,
      fallbackSortOrder: sortOrderFromSorting(firstSort),
      maxPageSize: options.maxPageSize,
    },
  );
}

export function buildDataGridQueryKey<F extends Record<string, string>>(
  baseKey: readonly unknown[],
  state: DataGridQueryState<F>,
) {
  return [...baseKey, normalizeDataGridQueryState(state)] as const;
}

export function buildInfiniteDataGridQueryKey<F extends Record<string, string>>(
  baseKey: readonly unknown[],
  state: InfiniteDataGridQueryState<F>,
) {
  return [
    ...baseKey,
    "infinite",
    {
      filters: state.filters,
      search: state.search.trim(),
      sortBy: state.sortBy,
      sortOrder: normalizeSortOrder(state.sortOrder),
    },
  ] as const;
}
