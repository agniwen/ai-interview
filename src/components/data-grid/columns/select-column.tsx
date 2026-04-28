import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";

export function selectColumn<TData>(): ColumnDef<TData> {
  return {
    cell: ({ row }) => (
      <Checkbox
        aria-label="选择此行"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="全选当前页"
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    id: "select",
    size: 36,
  };
}
