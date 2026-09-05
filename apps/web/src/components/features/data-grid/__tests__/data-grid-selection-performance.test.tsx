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
  name: string;
}

const rows = Array.from({ length: 10 }, (_, index) => ({
  id: String(index + 1),
  name: `候选人 ${index + 1}`,
}));
const BUSINESS_COLUMN_COUNT = 11;
const SORTABLE_COLUMN_IDS = ["business-1"] as const;
const SORTING: SortingState = [];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGrid row-selection rendering", () => {
  it("does not re-render unrelated business cells when selecting rows", () => {
    const renderBusinessCell = vi.fn((row: Row) => row.name);
    const businessColumns = Array.from(
      { length: BUSINESS_COLUMN_COUNT },
      (_, index): DataGridColumnDef<Row> => ({
        accessorFn: (row) => row.name,
        cell: ({ row }) => renderBusinessCell(row.original),
        header: `业务列 ${index + 1}`,
        id: `business-${index + 1}`,
      }),
    );
    const columns: DataGridColumnDef<Row>[] = [selectColumn<Row>(), ...businessColumns];

    function SelectionHarness() {
      const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
      return (
        <DataGrid
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
          sortableColumnIds={SORTABLE_COLUMN_IDS}
          sorting={SORTING}
          total={rows.length}
          totalPages={1}
        />
      );
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(<SelectionHarness />));
    expect(renderBusinessCell).toHaveBeenCalledTimes(rows.length * BUSINESS_COLUMN_COUNT);

    renderBusinessCell.mockClear();
    const firstRowCheckbox = container.querySelector('[aria-label="选择此行"]');
    act(() => firstRowCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(renderBusinessCell).not.toHaveBeenCalled();
    expect(firstRowCheckbox?.getAttribute("aria-checked")).toBe("true");
    expect(container.querySelector<HTMLElement>('[data-row-id="1"]')?.dataset.state).toBe(
      "selected",
    );

    renderBusinessCell.mockClear();
    const selectAllCheckbox = container.querySelector('[aria-label="全选当前页"]');
    act(() => selectAllCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(renderBusinessCell).not.toHaveBeenCalled();
    expect(
      [...container.querySelectorAll('[aria-label="选择此行"]')].every(
        (checkbox) => checkbox.getAttribute("aria-checked") === "true",
      ),
    ).toBe(true);

    renderBusinessCell.mockClear();
    act(() => selectAllCheckbox?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(renderBusinessCell).not.toHaveBeenCalled();
    expect(
      [...container.querySelectorAll('[aria-label="选择此行"]')].every(
        (checkbox) => checkbox.getAttribute("aria-checked") === "false",
      ),
    ).toBe(true);

    act(() => root.unmount());
  });
});
