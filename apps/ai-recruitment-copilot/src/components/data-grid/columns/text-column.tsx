import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { cn } from "@arc/shared/utils";
import type { DataGridFeatures } from "../table-features";

export interface TextColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  primary?: boolean;
  secondary?: (row: TData) => ReactNode;
  fallback?: string;
  muted?: boolean;
  truncate?: boolean | string;
  size?: number;
  cell?: (row: TData) => ReactNode;
}

export function textColumn<TData extends RowData>(
  opts: TextColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  let truncateClass: string | undefined;
  if (opts.truncate === true) {
    truncateClass = "max-w-sm truncate";
  } else if (opts.truncate !== false && opts.truncate !== undefined) {
    truncateClass = `${opts.truncate} truncate`;
  }

  return {
    accessorKey: opts.key,
    cell: ({ row }) => {
      if (opts.cell) {
        return opts.cell(row.original);
      }
      const raw = row.original[opts.key];
      const display =
        raw === null || raw === undefined || raw === "" ? (opts.fallback ?? "") : String(raw);

      if (opts.secondary) {
        return (
          <div className={cn("min-w-0", truncateClass)}>
            <p className={cn("truncate", opts.primary && "font-medium")}>{display}</p>
            <p className="truncate text-muted-foreground text-xs">{opts.secondary(row.original)}</p>
          </div>
        );
      }

      return (
        <span
          className={cn(
            opts.primary && "font-medium",
            opts.muted && "text-muted-foreground",
            truncateClass && `block ${truncateClass}`,
          )}
        >
          {display}
        </span>
      );
    },
    enableSorting: false,
    header: opts.title,
    id: opts.key,
    size: opts.size,
  };
}
