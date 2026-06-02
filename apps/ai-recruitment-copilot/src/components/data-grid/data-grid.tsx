"use client";

import type { ColumnDef, OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Fragment, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowDivider,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";
import { PaginationBar } from "./parts/pagination-bar";
import {
  getPinningStyles,
  PINNED_CELL_CLASS,
  PINNED_HEADER_CLASS,
  STICKY_HEADER_CLASS,
} from "./parts/pinned-cell";
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
   * 表格滚动区最大高度。默认不限制高度，页面滚动交给外层 layout。
   * 传入具体高度时会启用表格内部滚动与 sticky 表头。
   *
   * Max height for the table scroll viewport. By default there is no height cap,
   * so the outer layout owns scrolling. Pass a concrete height to enable an
   * internal scroll viewport and sticky header.
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
    maxHeight = null,
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
    <div className="flex flex-col gap-4">
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
        <Table
          containerClassName={maxHeight ? "overflow-auto" : undefined}
          containerStyle={maxHeight ? { maxHeight } : undefined}
        >
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const pin = header.column.getIsPinned();
                  return (
                    <TableHead
                      className={cn(maxHeight && STICKY_HEADER_CLASS, pin && PINNED_HEADER_CLASS)}
                      key={header.id}
                      style={getPinningStyles(header.column, {
                        isHeader: true,
                        stickToTop: !!maxHeight,
                      })}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIndex) => (
              <Fragment key={row.id}>
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const pin = cell.column.getIsPinned();
                    return (
                      <TableCell
                        className={cn(pin && PINNED_CELL_CLASS)}
                        key={cell.id}
                        style={getPinningStyles(cell.column)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
                {rowIndex < rows.length - 1 ? <TableRowDivider /> : null}
              </Fragment>
            ))}
          </TableBody>
        </Table>
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
