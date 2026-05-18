"use client";

import type { ColumnDef, OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";
import { PaginationBar } from "./parts/pagination-bar";
import { getPinningStyles, PINNED_CELL_CLASS, STICKY_HEADER_CLASS } from "./parts/pinned-cell";
import { Toolbar } from "./parts/toolbar";
import type { ToolbarFilterConfig } from "./parts/toolbar";

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

export interface BulkActionContext<TData> {
  selectedIds: string[];
  selectedRows: TData[];
  clearSelection: () => void;
}

export interface DataGridProps<TData> {
  data: TData[];
  total: number;
  totalPages: number;
  loading?: boolean;
  refetching?: boolean;

  columns: ColumnDef<TData>[];
  getRowId: (row: TData) => string;
  columnPinning?: { left?: string[]; right?: string[] };

  pagination: {
    page: number;
    pageSize: number;
    onPageChange: (p: number) => void;
    onPageSizeChange: (s: number) => void;
  };
  pageSizeOptions?: readonly number[];

  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  filters?: ToolbarFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  /**
   * 渲染在配置式 filters 之后、左侧 filter 区内的额外节点。
   * 用于在不扩展 ToolbarFilterConfig 类型的前提下，把页面定制的筛选器
   * （比如 DropdownMenu 单选）和搜索/多选挤在同一行。
   * Extra node rendered after the configured filters in the left filter region.
   */
  filtersExtra?: ReactNode;
  toolbarRight?: ReactNode;
  bulkActions?: (ctx: BulkActionContext<TData>) => ReactNode;
  headerExtra?: ReactNode;

  empty: ReactNode;
  onRefresh?: () => void;
  onResetFilters?: () => void;
  canResetFilters?: boolean;
  /**
   * 表格滚动区最大高度（启用 sticky 表头依赖此值）。
   * 默认 `calc(100svh - 22rem)`，给工具栏 / 分页 / 页头留出空间。
   * 传入 `null` 可关闭高度约束，从而禁用 sticky 行为。
   *
   * Max height for the scroll viewport (enables sticky header).
   * Defaults to `calc(100svh - 22rem)`. Pass `null` to disable height cap
   * (which also makes the sticky header a no-op since there's no scroll container).
   */
  maxHeight?: string | null;
}

export function DataGrid<TData>(props: DataGridProps<TData>) {
  const {
    bulkActions,
    canResetFilters,
    columnPinning,
    columns,
    data,
    empty,
    filterValues,
    filters,
    filtersExtra,
    getRowId,
    headerExtra,
    loading,
    maxHeight = "calc(100svh - 22rem)",
    onFilterChange,
    onRefresh,
    onResetFilters,
    onRowSelectionChange,
    onSortingChange,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    pagination,
    refetching,
    rowSelection,
    sorting,
    toolbarRight,
    total,
    totalPages,
  } = props;

  const normalizedPinning = useMemo(
    () => ({
      left: columnPinning?.left ?? [],
      right: columnPinning?.right ?? [],
    }),
    [columnPinning],
  );

  const table = useReactTable({
    columns,
    data,
    enableRowSelection: rowSelection !== undefined,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    manualPagination: true,
    manualSorting: true,
    onRowSelectionChange,
    onSortingChange,
    state: {
      columnPinning: normalizedPinning,
      rowSelection: rowSelection ?? {},
      sorting: sorting ?? [],
    },
  });

  const selectedIds = useMemo(
    () => Object.keys(rowSelection ?? {}).filter((id) => rowSelection?.[id]),
    [rowSelection],
  );
  const selectedRows = useMemo(
    () => data.filter((row) => rowSelection?.[getRowId(row)]),
    [data, rowSelection, getRowId],
  );
  const clearSelection = () => onRowSelectionChange?.({});

  const bulkSlot =
    bulkActions && selectedIds.length > 0
      ? bulkActions({ clearSelection, selectedIds, selectedRows })
      : null;

  const { rows } = table.getRowModel();

  return (
    <div className="space-y-4">
      {headerExtra ? <div>{headerExtra}</div> : null}

      <Toolbar
        bulkActionsSlot={bulkSlot}
        canResetFilters={canResetFilters}
        filterValues={filterValues}
        filters={filters}
        filtersExtra={filtersExtra}
        onFilterChange={onFilterChange}
        onRefresh={onRefresh}
        onResetFilters={onResetFilters}
        refreshing={refetching}
        searchLoading={loading}
        toolbarRight={toolbarRight}
      />

      {rows.length > 0 ? (
        <Card className="overflow-hidden py-0">
          <Table
            containerClassName={maxHeight ? "overflow-auto" : undefined}
            containerStyle={maxHeight ? { maxHeight } : undefined}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                // 表头行不响应 hover：基础 TableRow 自带 `hover:bg-muted`，
                // 但表头不应该跟随光标变色（否则非固定列变 muted、固定列保持 card 会撕裂）。
                // Override the base TableRow hover so the whole header stays flat —
                // otherwise non-pinned header cells would tint while pinned ones don't.
                <TableRow className="" key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      className={cn(
                        // 统一 12px 水平 padding；shadcn `<TableHead>` 自带的
                        // `[&:has([role=checkbox])]:pr-0` 会让 checkbox 列变成 pl:12 / pr:0
                        // 的不对称形态，这里用同变体的 `pr-3` 把右内距找回来。
                        "px-3 [&:has([role=checkbox])]:pr-3 bg-background",
                        maxHeight && STICKY_HEADER_CLASS,
                      )}
                      key={header.id}
                      style={getPinningStyles(header.column, { isHeader: !!maxHeight })}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const isPinned = cell.column.getIsPinned();
                    return (
                      <TableCell
                        className={cn(
                          // 同 TableHead：统一 12px 水平 padding，并把 checkbox 列的 pr-0 找回来。
                          // Same as TableHead — uniform px-3 plus pr restore for checkbox cells.
                          "px-3 [&:has([role=checkbox])]:pr-3",
                          isPinned && PINNED_CELL_CLASS,
                        )}
                        key={cell.id}
                        style={getPinningStyles(cell.column)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        empty
      )}

      <PaginationBar
        loading={loading || refetching}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
        page={pagination.page}
        pageSize={pagination.pageSize}
        pageSizeOptions={pageSizeOptions}
        total={total}
        totalPages={totalPages}
      />
    </div>
  );
}
