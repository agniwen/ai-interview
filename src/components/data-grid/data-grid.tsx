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
import { PaginationBar } from "./parts/pagination-bar";
import { getPinningStyles, PINNED_CELL_CLASS } from "./parts/pinned-cell";
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
  toolbarRight?: ReactNode;
  bulkActions?: (ctx: BulkActionContext<TData>) => ReactNode;
  headerExtra?: ReactNode;

  empty: ReactNode;
  onRefresh?: () => void;

  dataTour?: {
    table?: string;
    search?: string;
    filters?: Partial<Record<string, string>>;
    create?: string;
    stats?: string;
  };
}

export function DataGrid<TData>(props: DataGridProps<TData>) {
  const {
    bulkActions,
    columnPinning,
    columns,
    data,
    dataTour,
    empty,
    filterValues,
    filters,
    getRowId,
    headerExtra,
    loading,
    onFilterChange,
    onRefresh,
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
      {headerExtra ? <div data-tour={dataTour?.stats}>{headerExtra}</div> : null}

      <Toolbar
        bulkActionsSlot={bulkSlot}
        dataTour={{
          create: dataTour?.create,
          filters: dataTour?.filters,
          search: dataTour?.search,
        }}
        filterValues={filterValues}
        filters={filters}
        onFilterChange={onFilterChange}
        onRefresh={onRefresh}
        refreshing={refetching}
        searchLoading={loading}
        toolbarRight={toolbarRight}
      />

      {rows.length > 0 ? (
        <Card className="overflow-hidden py-0" data-tour={dataTour?.table}>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const isPinned = header.column.getIsPinned();
                    return (
                      <TableHead
                        className={isPinned ? PINNED_CELL_CLASS : undefined}
                        key={header.id}
                        style={getPinningStyles(header.column)}
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
                    const isPinned = cell.column.getIsPinned();
                    return (
                      <TableCell
                        className={isPinned ? PINNED_CELL_CLASS : undefined}
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
