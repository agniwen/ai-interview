import type { ColumnDef, RowData } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataGridFeatures } from "../table-features";

export function selectColumn<TData extends RowData>(): ColumnDef<DataGridFeatures, TData> {
  return {
    cell: ({ row }) => (
      <Checkbox
        aria-label="选择此行"
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
      />
    ),
    enableSorting: false,
    header: ({ table }) => {
      // Server-paginated grids only hold the current page in `data`, so
      // all-rows checks equal page-level selection. V9: "some" includes "all".
      const allSelected = table.getIsAllRowsSelected();
      const someSelected = table.getIsSomeRowsSelected();
      return (
        <Checkbox
          aria-label="全选当前页"
          checked={allSelected}
          indeterminate={someSelected && !allSelected}
          onCheckedChange={(value) => table.toggleAllRowsSelected(!!value)}
        />
      );
    },
    id: "select",
    // Must match rendered width so subsequent pinned columns' sticky offsets align.
    maxSize: 40,
    minSize: 40,
    size: 40,
  };
}
