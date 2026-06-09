import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDownIcon } from "lucide-react";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/display/time-display";
import { Button } from "@/components/ui/button";

export interface DateColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  sortable?: boolean;
  /** dayjs format string; defaults to DATE_TIME_DISPLAY_OPTIONS (`YY/MM/DD HH:mm`). */
  options?: string;
  /** Text rendered when the value is null / empty. Defaults to TimeDisplay's default ("待定"). */
  emptyText?: string;
}

export function dateColumn<TData>(opts: DateColumnOptions<TData>): ColumnDef<TData> {
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
    header: opts.sortable
      ? ({ column }) => (
          <Button
            className="h-5 px-1 text-muted-foreground text-xs"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            size="xs"
            variant="ghost"
          >
            {opts.title}
            <ArrowUpDownIcon className="size-3.5" />
          </Button>
        )
      : opts.title,
    id: opts.key,
  };
}
