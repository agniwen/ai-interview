import { asc, desc } from "drizzle-orm";
import type { Column, SQL } from "drizzle-orm";
import type { SortOrder } from "@app/shared/pagination";

export {
  calcTotalPages,
  DEFAULT_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE_SIZE_OPTIONS,
  makePaginationSchema,
  paginationOffset,
  paginationSearchParams,
  SORT_ORDERS,
  toPaginatedResult,
} from "@app/shared/pagination";
export type { PaginatedResult, PaginationParams, SortOrder } from "@app/shared/pagination";

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
