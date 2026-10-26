// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "@/components/features/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/features/data-grid/data-grid";
import { selectColumn } from "@/components/features/data-grid/columns/select-column";
import { installNoopResizeObserver, installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: Vitest's jsdom global supports React's documented act-environment marker.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();
installNoopWebAnimations();

interface Row {
  id: string;
  kind: "ai" | "human";
}

const rows: Row[] = [
  { id: "ai-1", kind: "ai" },
  { id: "human-1", kind: "human" },
  { id: "ai-2", kind: "ai" },
];
const SORTING: SortingState = [];
const columns: DataGridColumnDef<Row>[] = [
  selectColumn<Row>(),
  { accessorFn: (row) => row.id, cell: ({ row }) => row.original.id, header: "编号", id: "id" },
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGrid canSelectRow", () => {
  it("disables rows that cannot be selected and skips them when selecting the page", () => {
    const selections: RowSelectionState[] = [];

    function Harness() {
      const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
      selections.push(rowSelection);
      return (
        <DataGrid
          canSelectRow={(row) => row.kind === "ai"}
          columns={columns}
          data={rows}
          empty={<p>暂无记录</p>}
          getRowId={(row) => row.id}
          onRowSelectionChange={setRowSelection}
          onSortingChange={() => null}
          pagination={{
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
            page: 1,
            pageSize: rows.length,
          }}
          rowSelection={rowSelection}
          sorting={SORTING}
          total={rows.length}
          totalPages={1}
        />
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Harness />));

    const rowCheckbox = (id: string) =>
      container.querySelector<HTMLElement>(`[data-row-id="${id}"] [aria-label="选择此行"]`);
    expect(rowCheckbox("human-1")?.dataset.disabled).toBeDefined();
    expect(rowCheckbox("ai-1")?.dataset.disabled).toBeUndefined();

    const selectAll = container.querySelector('[aria-label="全选当前页"]');
    act(() => selectAll?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(selections.at(-1)).toEqual({ "ai-1": true, "ai-2": true });
    expect(rowCheckbox("human-1")?.getAttribute("aria-checked")).toBe("false");

    act(() => root.unmount());
  });
});
