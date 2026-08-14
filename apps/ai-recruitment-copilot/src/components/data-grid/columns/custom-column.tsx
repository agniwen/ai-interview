// src/components/data-grid/columns/custom-column.tsx
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
  /** When set, this column also reads `row[accessorKey]` (used by sort + filter) */
  accessorKey?: keyof TData & string;
}

export function customColumn<TData extends RowData>(
  opts: CustomColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  const base = {
    cell: ({ row }) => opts.cell(row.original),
    enableSorting: opts.enableSorting ?? false,
    header: opts.title,
    id: opts.key,
    size: opts.size,
  } satisfies ColumnDef<DataGridFeatures, TData>;
  return opts.accessorKey ? { ...base, accessorKey: opts.accessorKey } : base;
}
