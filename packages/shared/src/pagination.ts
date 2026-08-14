import { z } from "zod";

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

export interface PaginationParams<TSort extends string = string> {
  page: number;
  pageSize: number;
  sortBy: TSort;
  sortOrder: SortOrder;
}

export interface PaginatedResult<T> {
  page: number;
  pageSize: number;
  records: T[];
  total: number;
  totalPages: number;
}

interface MakePaginationSchemaOptions<TSort extends string> {
  defaultPageSize?: number;
  defaultSortBy?: TSort;
  defaultSortOrder?: SortOrder;
  maxPageSize?: number;
}

export function makePaginationSchema<TSort extends string>(
  sortColumns: readonly [TSort, ...TSort[]],
  options: MakePaginationSchemaOptions<TSort> = {},
) {
  const {
    defaultPageSize = DEFAULT_PAGE_SIZE,
    defaultSortBy = sortColumns[0],
    defaultSortOrder = "desc",
    maxPageSize = DEFAULT_MAX_PAGE_SIZE,
  } = options;
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
    sortBy: z.enum(sortColumns).default(defaultSortBy),
    sortOrder: z.enum(SORT_ORDERS).default(defaultSortOrder),
  });
}

export function calcTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function paginationOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize;
}

export function toPaginatedResult<T>(
  records: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    page,
    pageSize,
    records,
    total,
    totalPages: calcTotalPages(total, pageSize),
  };
}

export function paginationSearchParams(
  input: PaginationParams & { search?: string },
): URLSearchParams {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
  });
  const search = input.search?.trim();
  if (search) {
    params.set("search", search);
  }
  return params;
}
