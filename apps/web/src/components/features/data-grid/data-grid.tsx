"use client";

import type {
  ColumnDef,
  HeaderContext,
  OnChangeFn,
  PaginationState,
  RowData,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { IconArrowsUpDown } from "@tabler/icons-react";
import { flexRender, functionalUpdate, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { z } from "zod";
import {
  DataGrid as ReuiDataGrid,
  DataGridContainer as ReuiDataGridContainer,
} from "@/components/reui/data-grid/data-grid";
import type {
  DataGridCellEditRequest,
  DataGridCellsChangeDetails,
} from "@/components/reui/data-grid/data-grid";
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header";
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination";
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area";
import { DataGridTable } from "@/components/reui/data-grid/data-grid-table";
import { Button } from "@/components/ui/button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@app/shared/utils";
import { PaginationBar } from "./parts/pagination-bar";
import { Toolbar } from "./parts/toolbar";
import type { ToolbarFilterConfig } from "./parts/toolbar";
import { ListLoadError } from "./list-load-error";
import { dataGridFeatures } from "./table-features";
import type { DataGridFeatures } from "./table-features";

const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;
const DEFAULT_END_COLUMN_PINNING = ["actions"];
const EMPTY_COLUMN_PINNING: string[] = [];
const EMPTY_SORTING: SortingState = [];
const DATA_GRID_ROW_CLASS = "h-[53px]";
const SKELETON_CELL_WIDTHS = ["w-16", "w-24", "w-32", "w-20"] as const;
const EMPTY_SKELETON_ROWS: Record<string, never>[] = [];
const DATA_GRID_I18N = {
  labels: {
    empty: "暂无数据",
    nextPage: "下一页",
    paginationInfo: ({ count, from, to }: { count: number; from: number; to: number }) =>
      `${from} - ${to} / ${count}`,
    previousPage: "上一页",
    rowsPerPage: "每页行数",
    selectAll: "全选当前页",
    selectRow: "选择此行",
    sortAscending: "升序",
    sortDescending: "降序",
  },
} as const;

function isColdLoading({
  error,
  loading,
  rowCount,
}: {
  error: unknown;
  loading: boolean;
  rowCount: number;
}) {
  return loading && rowCount === 0 && !error;
}

function DataGridSkeleton({ columnCount, rowCount }: { columnCount: number; rowCount: number }) {
  const columns = useMemo<DataGridColumnDef<Record<string, never>>[]>(
    () =>
      Array.from({ length: Math.max(columnCount, 1) }, (_, columnIndex) => ({
        accessorKey: `skeleton-${columnIndex}`,
        header: () => (
          <Skeleton
            className={cn("h-4", SKELETON_CELL_WIDTHS[columnIndex % SKELETON_CELL_WIDTHS.length])}
          />
        ),
        id: `skeleton-${columnIndex}`,
        meta: {
          skeleton: (
            <Skeleton
              className={cn("h-4", SKELETON_CELL_WIDTHS[columnIndex % SKELETON_CELL_WIDTHS.length])}
            />
          ),
        },
      })),
    [columnCount],
  );
  const table = useTable({
    columns,
    data: EMPTY_SKELETON_ROWS,
    features: dataGridFeatures,
    getRowId: (_, index) => String(index),
    manualPagination: true,
    rowCount: 0,
    state: { pagination: { pageIndex: 0, pageSize: rowCount } },
  });

  return (
    <div
      aria-busy="true"
      aria-label="正在加载表格"
      className="min-w-0"
      data-slot="data-grid-skeleton"
    >
      <ReuiDataGrid
        i18n={DATA_GRID_I18N}
        isLoading
        recordCount={0}
        table={table}
        tableClassNames={{ bodyRow: DATA_GRID_ROW_CLASS }}
        tableLayout={{ cellBorder: true, headerBackground: false, rowBorder: true, width: "auto" }}
      >
        <ReuiDataGridContainer className="rounded-lg border shadow-none">
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
          <DataGridPagination />
        </ReuiDataGridContainer>
      </ReuiDataGrid>
    </div>
  );
}

export function DataGridContentSkeleton({
  columnCount = 5,
  rowCount = 10,
}: {
  columnCount?: number;
  rowCount?: number;
}) {
  return <DataGridSkeleton columnCount={columnCount} rowCount={rowCount} />;
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
  /**
   * Logical pin sides (TanStack Table V9). `start` ≈ left in LTR, `end` ≈ right.
   * The conventional `actions` column is pinned to the end by default; pass `end: []` to opt out.
   */
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
  /** Only these server-backed column ids expose ascending/descending controls. */
  sortableColumnIds?: readonly string[];

  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;

  filters?: ToolbarFilterConfig[];
  filterStorageKey?: string;
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
  onResetFilters?: (clearedValues?: Record<string, string>) => void;
  canResetFilters?: boolean;
  /**
   * 表格滚动区最大高度。默认不限制高度，页面滚动交给外层 layout。
   * Max height for the table scroll viewport.
   */
  maxHeight?: string | null;

  /** REUI spreadsheet editing stays opt-in so existing interactive cells keep their behavior. */
  cellSelection?: boolean;
  cellEditMode?: "click" | "dblclick";
  cellEditEnterAdvance?: boolean;
  onCellsChange?: (details: DataGridCellsChangeDetails<TData>) => void;
  onCellEditRequest?: (request: DataGridCellEditRequest<TData>) => void;
}

export function DataGrid<TData extends RowData>(props: DataGridProps<TData>) {
  const {
    bulkActions,
    canResetFilters,
    cellEditEnterAdvance,
    cellEditMode,
    cellSelection,
    columnPinning,
    columns,
    data,
    empty,
    error,
    filterValues,
    filterStorageKey,
    filters,
    filtersExtra,
    getRowId,
    headerExtra,
    loading,
    maxHeight = null,
    onFilterChange,
    onCellEditRequest,
    onCellsChange,
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
    sortableColumnIds,
    toolbarRight,
    total,
    totalPages,
  } = props;

  const normalizedPinning = useMemo(
    () => ({
      end:
        columnPinning?.end ??
        (columns.some((column) => column.id === "actions")
          ? DEFAULT_END_COLUMN_PINNING
          : EMPTY_COLUMN_PINNING),
      start: columnPinning?.start ?? EMPTY_COLUMN_PINNING,
    }),
    [columnPinning, columns],
  );
  const hasPinning = normalizedPinning.start.length > 0 || normalizedPinning.end.length > 0;
  const sortingEnabled = onSortingChange !== undefined;

  const renderedColumns = useMemo(() => {
    const sortableIds = sortableColumnIds ? new Set(sortableColumnIds) : null;
    return columns.map((column, columnIndex) => {
      // SAFETY: the clone preserves the original ColumnDef discriminator and only augments shared meta.
      const columnWithSkeleton = {
        ...column,
        meta: {
          ...column.meta,
          skeleton:
            column.meta?.skeleton ??
            (column.id === "select" ? (
              <Skeleton className="size-4 rounded-sm" />
            ) : (
              <Skeleton
                className={cn(
                  "h-4 max-w-full",
                  SKELETON_CELL_WIDTHS[columnIndex % SKELETON_CELL_WIDTHS.length],
                )}
              />
            )),
        },
      } as DataGridColumnDef<TData>;
      const parsedAccessorKey =
        "accessorKey" in columnWithSkeleton
          ? z.string().safeParse(columnWithSkeleton.accessorKey)
          : null;
      const columnId =
        columnWithSkeleton.id ?? (parsedAccessorKey?.success ? parsedAccessorKey.data : null);
      const canSort = Boolean(
        sortingEnabled &&
        columnId &&
        (sortableIds ? sortableIds.has(columnId) : columnWithSkeleton.enableSorting === true),
      );
      if (!canSort) {
        return columnWithSkeleton;
      }

      const originalHeader = columnWithSkeleton.header;
      const parsedHeader = z.string().safeParse(originalHeader);
      const hasAccessor = "accessorFn" in column || "accessorKey" in column;
      // ColumnDef is a discriminated union whose string-header arm cannot express
      // replacing that same header with a renderer, although TanStack accepts it.
      // SAFETY: the clone preserves the original column discriminator and only replaces shared fields.
      const nextColumn = {
        ...columnWithSkeleton,
        enableSorting: true,
        header: (context: HeaderContext<DataGridFeatures, TData, unknown>) =>
          parsedHeader.success ? (
            <DataGridColumnHeader column={context.column} title={parsedHeader.data} />
          ) : (
            <div className="flex items-center gap-0.5">
              {flexRender(originalHeader, context)}
              <Button
                aria-label="切换排序"
                onClick={() => context.column.toggleSorting(context.column.getIsSorted() === "asc")}
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <IconArrowsUpDown />
              </Button>
            </div>
          ),
      } as DataGridColumnDef<TData> & { accessorFn?: () => null };
      if (!hasAccessor) {
        nextColumn.accessorFn = () => null;
      }
      return nextColumn;
    });
  }, [columns, sortableColumnIds, sortingEnabled]);

  const paginationState = useMemo<PaginationState>(
    () => ({ pageIndex: pagination.page - 1, pageSize: pagination.pageSize }),
    [pagination.page, pagination.pageSize],
  );

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    const next = functionalUpdate(updater, paginationState);
    if (next.pageSize !== paginationState.pageSize) {
      pagination.onPageSizeChange(next.pageSize);
      return;
    }
    if (next.pageIndex !== paginationState.pageIndex) {
      pagination.onPageChange(next.pageIndex + 1);
    }
  };

  const table = useTable({
    columns: renderedColumns,
    data,
    // Preserve V8 non-range checkbox behavior (V9 enables Shift range by default).
    enableRowRangeSelection: false,
    enableRowSelection: rowSelection !== undefined,
    enableSortingRemoval: false,
    features: dataGridFeatures,
    getRowId,
    manualPagination: true,
    manualSorting: true,
    onPaginationChange,
    onRowSelectionChange,
    onSortingChange,
    rowCount: total,
    state: {
      columnPinning: normalizedPinning,
      pagination: paginationState,
      rowSelection: rowSelection ?? {},
      sorting: sorting ?? EMPTY_SORTING,
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
  if (error) {
    emptyContent = <ListLoadError error={error} onRetry={onRetry ?? onRefresh} />;
  }
  const isInitialLoading = isColdLoading({
    error,
    loading: Boolean(loading),
    rowCount: rows.length,
  });

  const renderTable = (showSkeleton: boolean) => (
    <ReuiDataGrid
      onCellEditRequest={onCellEditRequest}
      onCellsChange={onCellsChange}
      i18n={DATA_GRID_I18N}
      isLoading={showSkeleton}
      recordCount={total}
      table={table}
      tableLayout={{
        cellBorder: true,
        cellEditEnterAdvance,
        cellEditMode,
        cellSelection,
        columnsPinnable: hasPinning,
        headerBackground: false,
        headerSticky: Boolean(maxHeight),
        rowBorder: true,
        width: "auto",
      }}
      tableClassNames={{
        bodyRow: DATA_GRID_ROW_CLASS,
        headerSticky: "sticky top-0 z-40 bg-background",
      }}
    >
      <ReuiDataGridContainer className="rounded-lg border shadow-none">
        <DataGridScrollArea style={maxHeight ? { maxHeight } : undefined}>
          <DataGridTable />
        </DataGridScrollArea>
        <DataGridPagination sizes={[...pageSizeOptions]} />
      </ReuiDataGridContainer>
    </ReuiDataGrid>
  );

  return (
    <div className="flex flex-col gap-4">
      {headerExtra ? <div>{headerExtra}</div> : null}

      <Toolbar
        bulkActionsSlot={bulkSlot}
        canResetFilters={canResetFilters}
        filterValues={filterValues}
        filters={filters}
        filterStorageKey={filterStorageKey}
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

      <SkeletonReveal className="min-w-0" loading={isInitialLoading} skeleton={renderTable(true)}>
        {rows.length > 0 ? renderTable(false) : !isInitialLoading && emptyContent}

        {rows.length === 0 && !isInitialLoading ? (
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
        ) : null}
      </SkeletonReveal>
    </div>
  );
}
