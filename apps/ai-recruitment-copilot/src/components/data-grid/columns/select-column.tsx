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
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={!table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      />
    ),
    id: "select",
    // 必须与 DataGrid 中实际渲染宽度对齐（Checkbox 16px + cell padding），
    // 否则后续 pinned 列的 sticky `left:` 偏移会错开造成"余量"。
    // Must match the actual rendered width so subsequent pinned columns'
    // sticky left offsets line up exactly.
    maxSize: 40,
    minSize: 40,
    size: 40,
  };
}
