import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDownIcon } from "lucide-react";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { Button } from "@/components/ui/button";

export interface DateColumnOptions<TData> {
  key: keyof TData & string;
  title: string;
  sortable?: boolean;
  options?: Intl.DateTimeFormatOptions;
}

export function dateColumn<TData>(opts: DateColumnOptions<TData>): ColumnDef<TData> {
  const formatOptions = opts.options ?? DATE_TIME_DISPLAY_OPTIONS;

  return {
    accessorKey: opts.key,
    cell: ({ row }) => (
      <TimeDisplay
        options={formatOptions}
        value={row.original[opts.key] as string | number | Date}
      />
    ),
    enableSorting: opts.sortable ?? false,
    header: opts.sortable
      ? ({ column }) => (
          <Button
            className="px-0"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            variant="ghost"
          >
            {opts.title}
            <ArrowUpDownIcon className="size-4" />
          </Button>
        )
      : opts.title,
    id: opts.key,
  };
}
