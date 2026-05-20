import "server-only";

import { asc, desc } from "drizzle-orm";
import type { Column, SQL } from "drizzle-orm";
import { z } from "zod";

// 统一分页契约：所有列表 DAO 共享同一份 schema/参数形状，
// 仅由调用方提供允许排序的列名集合。
// Shared pagination contract: every list DAO uses the same schema/param shape,
// callers only supply the set of allowed sort columns.

export const SORT_ORDERS = ["asc", "desc"] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface PaginationParams<TSort extends string = string> {
  page: number;
  pageSize: number;
  sortBy: TSort;
  sortOrder: SortOrder;
}

export interface PaginatedResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface MakePaginationSchemaOptions<TSort extends string> {
  defaultSortBy?: TSort;
  defaultPageSize?: number;
  maxPageSize?: number;
  defaultSortOrder?: SortOrder;
}

// 工厂：返回一个 Zod schema，列表 DAO 用它解析 query string。
// Factory returning a Zod schema that list DAOs use to parse query strings.
export function makePaginationSchema<TSort extends string>(
  sortColumns: readonly [TSort, ...TSort[]],
  options: MakePaginationSchemaOptions<TSort> = {},
) {
  const {
    defaultSortBy = sortColumns[0],
    defaultPageSize = 10,
    maxPageSize = 100,
    defaultSortOrder = "desc",
  } = options;
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
    sortBy: z.enum(sortColumns).default(defaultSortBy),
    sortOrder: z.enum(SORT_ORDERS).default(defaultSortOrder),
  });
}

// 排序方向辅助：根据 columnMap 选出 Drizzle Column 并包裹 asc/desc。
// Resolve a Drizzle Column from columnMap and wrap it with asc/desc.
export function buildOrderBy<TSort extends string>(
  columnMap: Record<TSort, Column>,
  sortBy: TSort,
  sortOrder: SortOrder,
): SQL {
  const column = columnMap[sortBy];
  return sortOrder === "asc" ? asc(column) : desc(column);
}

export function calcTotalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
