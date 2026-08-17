import type { ColumnDef, RowData } from "@tanstack/react-table";

import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import type { DataGridFeatures } from "../table-features";

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
    cell: ({ row }) => (
      <TimeDisplay
        emptyText={opts.emptyText}
        options={formatOptions}
        value={row.original[opts.key] as string | number | Date}
      />
    ),
    enableSorting: opts.sortable ?? false,
    header: opts.title,
    id: opts.key,
  };
}
