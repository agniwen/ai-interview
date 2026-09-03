import type { ColumnDef, RowData } from "@tanstack/react-table";
import { z } from "zod";

import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import type { DataGridFeatures } from "../table-features";

const timeDisplayValueSchema = z.union([z.date(), z.number(), z.string()]);

export interface DateColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  sortable?: boolean;
  /** dayjs format string; defaults to DATE_TIME_DISPLAY_OPTIONS (`YY/MM/DD HH:mm`). */
  options?: string;
  /** Text rendered when the value is null / empty. Defaults to TimeDisplay's default ("待定"). */
  emptyText?: string;
}

export function dateColumn<TData extends RowData>(
  opts: DateColumnOptions<TData>,
): ColumnDef<DataGridFeatures, TData> {
  const formatOptions = opts.options ?? DATE_TIME_DISPLAY_OPTIONS;

  return {
    accessorKey: opts.key,
    cell: ({ row }) => {
      const result = timeDisplayValueSchema.safeParse(row.original[opts.key]);
      return (
        <TimeDisplay
          emptyText={opts.emptyText}
          options={formatOptions}
          value={result.success ? result.data : undefined}
        />
      );
    },
    enableSorting: opts.sortable ?? false,
    header: opts.title,
    id: opts.key,
  };
}
