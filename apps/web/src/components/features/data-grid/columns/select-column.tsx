import type { ColumnDef, RowData } from "@tanstack/react-table";
import {
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
} from "@/components/reui/data-grid/data-grid-table";
import type { DataGridFeatures } from "../table-features";

export function selectColumn<TData extends RowData>(): ColumnDef<DataGridFeatures, TData> {
  return {
    cell: ({ row }) => <DataGridTableRowSelect row={row} />,
    enableSorting: false,
    header: () => <DataGridTableRowSelectAll />,
    id: "select",
    // Must match rendered width so subsequent pinned columns' sticky offsets align.
    maxSize: 40,
    minSize: 40,
    size: 40,
  };
}
