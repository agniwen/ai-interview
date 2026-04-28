// src/components/data-grid/columns/custom-column.tsx
import type { ColumnDef, HeaderContext } from "@tanstack/react-table";
import type { ReactNode } from "react";

export interface CustomColumnOptions<TData> {
  /** column id */
  key: string;
  title: string | ((ctx: HeaderContext<TData, unknown>) => ReactNode);
  cell: (row: TData) => ReactNode;
  size?: number;
  enableSorting?: boolean;
  /** When set, this column also reads `row[accessorKey]` (used by sort + filter) */
  accessorKey?: keyof TData & string;
}

export function customColumn<TData>(opts: CustomColumnOptions<TData>): ColumnDef<TData> {
  const base = {
    cell: ({ row }) => opts.cell(row.original),
    enableSorting: opts.enableSorting ?? false,
    header: opts.title,
    id: opts.key,
    size: opts.size,
  } satisfies ColumnDef<TData>;
  return opts.accessorKey ? { ...base, accessorKey: opts.accessorKey } : base;
}
