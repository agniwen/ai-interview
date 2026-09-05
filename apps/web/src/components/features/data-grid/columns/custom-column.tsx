// src/components/features/data-grid/columns/custom-column.tsx
import type { ColumnDef, HeaderContext, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { DataGridFeatures } from "../table-features";

export interface CustomColumnOptions<TData extends RowData> {
  /** column id */
  key: string;
  title: string | ((ctx: HeaderContext<DataGridFeatures, TData, unknown>) => ReactNode);
  cell: (row: TData) => ReactNode;
  size?: number;
  enableSorting?: boolean;
  /** Keep false for layout-pinned columns that users must not pin or unpin. */
  enablePinning?: boolean;
  /** When set, this column also reads `row[accessorKey]` (used by sort + filter) */
  accessorKey?: keyof TData & string;
}

export function customColumn<TData extends RowData>(
  opts: CustomColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  const base = {
    cell: ({ row }) => opts.cell(row.original),
    enablePinning: opts.enablePinning,
    enableSorting: opts.enableSorting ?? false,
    header: opts.title,
    id: opts.key,
    size: opts.size,
  } satisfies ColumnDef<DataGridFeatures, TData>;
  return opts.accessorKey ? { ...base, accessorKey: opts.accessorKey } : base;
}
