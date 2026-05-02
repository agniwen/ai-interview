import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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

export function textColumn<TData>(opts: TextColumnOptions<TData>): ColumnDef<TData> {
  let truncateClass: string | undefined;
  if (opts.truncate === true) {
    truncateClass = "max-w-sm truncate";
  } else if (typeof opts.truncate === "string") {
    truncateClass = `${opts.truncate} truncate`;
  }

  return {
    accessorKey: opts.key,
    cell: ({ row }) => {
      if (opts.cell) {
        return opts.cell(row.original);
      }
      const raw = row.original[opts.key] as unknown;
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
