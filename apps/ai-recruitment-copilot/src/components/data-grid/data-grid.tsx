"use client";

import type {
  ColumnDef,
  OnChangeFn,
  RowData,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { IconArrowsUpDown } from "@tabler/icons-react";
import { flexRender, useTable } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
import { dataGridFeatures } from "./table-features";
import type { DataGridFeatures } from "./table-features";

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
              <TableHead className="bg-background" key={`header-${columnIndex}`}>
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

export type DataGridColumnDef<TData extends RowData> = ColumnDef<DataGridFeatures, TData>;

export interface DataGridProps<TData extends RowData> {
  data: TData[];
  total: number;
  totalPages: number;
  loading?: boolean;
  refetching?: boolean;

  columns: DataGridColumnDef<TData>[];
  getRowId: (row: TData) => string;
  /** Logical pin sides (TanStack Table V9). `start` ≈ left in LTR, `end` ≈ right. */
  columnPinning?: { end?: string[]; start?: string[] };

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
   * Extra node rendered after the configured filters in the start filter region.
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
   * Max height for the table scroll viewport.
   */
  maxHeight?: string | null;
}

export function DataGrid<TData extends RowData>(props: DataGridProps<TData>) {
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
      end: columnPinning?.end ?? [],
      start: columnPinning?.start ?? [],
    }),
    [columnPinning],
  );
  const hasPinning = normalizedPinning.start.length > 0 || normalizedPinning.end.length > 0;

  const table = useTable({
    columns,
    data,
    // Preserve V8 non-range checkbox behavior (V9 enables Shift range by default).
    enableRowRangeSelection: false,
    enableRowSelection: rowSelection !== undefined,
    features: dataGridFeatures,
    getRowId,
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
    canScrollEnd: false,
    canScrollStart: false,
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
      setScrollOverflow({ canScrollEnd: false, canScrollStart: false });
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
                    const canSort = Boolean(onSortingChange && header.column.getCanSort());
                    const headerContent = header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext());
                    return (
                      <TableHead
                        className={cn(
                          "bg-background",
                          maxHeight && STICKY_HEADER_CLASS,
                          pin && PINNED_HEADER_CLASS,
                          getPinnedEdgeClassName({
                            isEndEdge: edge.isEndEdge,
                            isStartEdge: edge.isStartEdge,
                            showEndEdge: scrollOverflow.canScrollEnd,
                            showStartEdge: scrollOverflow.canScrollStart,
                          }),
                        )}
                        key={header.id}
                        style={getPinningStyles(header.column, {
                          isHeader: true,
                          stickToTop: !!maxHeight,
                        })}
                      >
                        {canSort && headerContent ? (
                          <div className="flex items-center gap-0.5">
                            <span>{headerContent}</span>
                            <Button
                              aria-label="切换排序"
                              onClick={() =>
                                header.column.toggleSorting(header.column.getIsSorted() === "asc")
                              }
                              size="icon-xs"
                              type="button"
                              variant="ghost"
                            >
                              <IconArrowsUpDown />
                            </Button>
                          </div>
                        ) : (
                          headerContent
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow data-state={row.getIsSelected() ? "selected" : undefined} key={row.id}>
                  {row.getAllCells().map((cell) => {
                    const pin = cell.column.getIsPinned();
                    const edge = getPinnedEdgeSides(cell.column);
                    return (
                      <TableCell
                        className={cn(
                          pin && PINNED_CELL_CLASS,
                          getPinnedEdgeClassName({
                            isEndEdge: edge.isEndEdge,
                            isStartEdge: edge.isStartEdge,
                            showEndEdge: scrollOverflow.canScrollEnd,
                            showStartEdge: scrollOverflow.canScrollStart,
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
