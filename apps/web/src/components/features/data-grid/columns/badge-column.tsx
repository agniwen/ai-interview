// src/components/features/data-grid/columns/badge-column.tsx
import type { ColumnDef, RowData } from "@tanstack/react-table";
import type { ComponentProps, ReactNode } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import type { DataGridFeatures } from "../table-features";

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;
const badgeValueSchema = z.string();

export interface BadgeColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  /** Map raw value -> { label, tone } */
  meta?: Record<string, { label: string; tone: BadgeVariant }>;
  /** Custom cell — overrides default meta-based rendering */
  cell?: (row: TData) => ReactNode;
  size?: number;
}

export function badgeColumn<TData extends RowData>(
  opts: BadgeColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  return {
    accessorKey: opts.key,
    cell: ({ row }) => {
      if (opts.cell) {
        return opts.cell(row.original);
      }
      const result = badgeValueSchema.safeParse(row.original[opts.key]);
      const raw = result.success ? result.data : "—";
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
