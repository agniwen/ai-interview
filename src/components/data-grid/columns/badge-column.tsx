// src/components/data-grid/columns/badge-column.tsx
import type { ColumnDef } from "@tanstack/react-table";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export interface BadgeColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  /** Map raw value -> { label, tone } */
  meta?: Record<string, { label: string; tone: BadgeVariant }>;
  /** Custom cell — overrides default meta-based rendering */
  cell?: (row: TData) => ReactNode;
  size?: number;
}

export function badgeColumn<TData>(opts: BadgeColumnOptions<TData>): ColumnDef<TData> {
  return {
    accessorKey: opts.key,
    cell: ({ row }) => {
      if (opts.cell) {
        return opts.cell(row.original);
      }
      const raw = row.original[opts.key] as string;
      const entry = opts.meta?.[raw];
      if (!entry) {
        return <Badge variant="outline">{raw}</Badge>;
      }
      return <Badge variant={entry.tone}>{entry.label}</Badge>;
    },
    enableSorting: false,
    header: opts.title,
    id: opts.key,
    size: opts.size,
  };
}
