"use client";

import type { ColumnDef, OnChangeFn, RowSelectionState, SortingState } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@arc/shared/utils";
import { PaginationBar } from "./parts/pagination-bar";
import {
  getPinnedEdgeClassName,
  getPinnedEdgeSides,
  getPinningStyles,
  PINNED_CELL_CLASS,
  PINNED_HEADER_CLASS,
  readHorizontalScrollOverflow,
  STICKY_HEADER_CLASS,
} from "./parts/pinned-cell";
import { Toolbar } from "./parts/toolbar";
import type { ToolbarFilterConfig } from "./parts/toolbar";
import { ListLoadError } from "./list-load-error";

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;
const SKELETON_CELL_WIDTHS = ["w-16", "w-24", "w-32", "w-20"] as const;

function DataGridSkeleton({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  const columnIndexes = Array.from({ length: Math.max(columnCount, 1) }, (_, index) => index);
  const rowIndexes = Array.from({ length: rowCount }, (_, index) => index);

  return (
    <div
      aria-label="正在加载表格"
      aria-busy="true"
      className="w-full overflow-hidden rounded-lg border"
      data-slot="data-grid-skeleton"
    >
      <Table>
        <TableHeader>
          <TableRow>
            {columnIndexes.map((columnIndex) => (
              <TableHead key={`header-${columnIndex}`}>
                <Skeleton
                  className={cn(
                    "h-4",
                    SKELETON_CELL_WIDTHS[columnIndex % SKELETON_CELL_WIDTHS.length],
                  )}
                />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowIndexes.map((rowIndex) => (
            <TableRow key={`row-${rowIndex}`}>
              {columnIndexes.map((columnIndex) => (
                <TableCell key={`cell-${rowIndex}-${columnIndex}`}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      SKELETON_CELL_WIDTHS[(rowIndex + columnIndex) % SKELETON_CELL_WIDTHS.length],
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

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
  error?: unknown;
  onRefresh?: () => void;
  onRetry?: () => void;
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
    error,
    filterValues,
    filters,
    filtersExtra,
    getRowId,
    headerExtra,
    loading,
    maxHeight = null,
    onFilterChange,
    onRefresh,
    onRetry,
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
  const hasPinning = normalizedPinning.left.length > 0 || normalizedPinning.right.length > 0;

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
  let emptyContent = empty;
  if (loading) {
    emptyContent = (
      <DataGridSkeleton
        columnCount={table.getAllLeafColumns().length}
        rowCount={Math.min(pagination.pageSize, 6)}
      />
    );
  }
  if (error) {
    emptyContent = <ListLoadError error={error} onRetry={onRetry ?? onRefresh} />;
  }

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollOverflow, setScrollOverflow] = useState({
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollOverflow = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    setScrollOverflow(readHorizontalScrollOverflow(element));
  }, []);

  const setScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (!(node && hasPinning)) {
        return;
      }
      setScrollOverflow(readHorizontalScrollOverflow(node));
    },
    [hasPinning],
  );

  useEffect(() => {
    if (!hasPinning) {
      setScrollOverflow({ canScrollLeft: false, canScrollRight: false });
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    updateScrollOverflow();
    const resizeObserver = new ResizeObserver(() => {
      updateScrollOverflow();
    });
    resizeObserver.observe(element);
    const tableElement = element.querySelector("table");
    if (tableElement) {
      resizeObserver.observe(tableElement);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [hasPinning, rows.length, columns, updateScrollOverflow]);

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

      {error && rows.length > 0 ? (
        <ListLoadError compact error={error} onRetry={onRetry ?? onRefresh} />
      ) : null}

      {rows.length > 0 ? (
        <div className="w-full overflow-hidden rounded-lg border">
          <Table
            render={
              <div
                className={cn(maxHeight ? "overflow-auto" : "overflow-x-auto")}
                onScroll={hasPinning ? updateScrollOverflow : undefined}
                ref={setScrollNode}
                style={maxHeight ? { maxHeight } : undefined}
              />
            }
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const pin = header.column.getIsPinned();
                    const edge = getPinnedEdgeSides(header.column);
                    return (
                      <TableHead
                        className={cn(
                          maxHeight && STICKY_HEADER_CLASS,
                          pin && PINNED_HEADER_CLASS,
                          getPinnedEdgeClassName({
                            isLeftEdge: edge.isLeftEdge,
                            isRightEdge: edge.isRightEdge,
                            showLeftEdge: scrollOverflow.canScrollLeft,
                            showRightEdge: scrollOverflow.canScrollRight,
                          }),
                        )}
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
              {rows.map((row) => (
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getVisibleCells().map((cell) => {
                    const pin = cell.column.getIsPinned();
                    const edge = getPinnedEdgeSides(cell.column);
                    return (
                      <TableCell
                        className={cn(
                          pin && PINNED_CELL_CLASS,
                          getPinnedEdgeClassName({
                            isLeftEdge: edge.isLeftEdge,
                            isRightEdge: edge.isRightEdge,
                            showLeftEdge: scrollOverflow.canScrollLeft,
                            showRightEdge: scrollOverflow.canScrollRight,
                          }),
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
        </div>
      ) : (
        emptyContent
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
