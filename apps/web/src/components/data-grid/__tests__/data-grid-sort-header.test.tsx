// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "@/components/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/data-grid/data-grid";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: string;
  name: string;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGrid sortable header", () => {
  it("limits sorting to a ghost icon button beside the regular label", () => {
    const onSortingChange = vi.fn();
    const columns: DataGridColumnDef<Row>[] = [
      {
        accessorKey: "name",
        enableSorting: true,
        header: "姓名",
      },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGrid
          columns={columns}
          data={[{ id: "1", name: "张三" }]}
          empty={<p>暂无记录</p>}
          getRowId={(row) => row.id}
          onSortingChange={onSortingChange}
          pagination={{
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
            page: 1,
            pageSize: 20,
          }}
          sorting={[]}
          total={1}
          totalPages={1}
        />,
      );
    });

    const header = container.querySelector("th");
    const label = header?.querySelector("span");
    const sortButton = header?.querySelector("button");

    expect(header?.className).toContain("px-2.5");
    expect(header?.className).toContain("font-medium");
    expect(label?.textContent).toBe("姓名");
    expect(sortButton?.contains(label ?? null)).toBe(false);
    expect(sortButton?.dataset.variant).toBe("ghost");
    expect(sortButton?.dataset.size).toBe("icon-xs");
    expect(sortButton?.className).toContain("rounded-sm");
    expect(sortButton?.className).not.toContain("rounded-md");

    act(() => {
      label?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSortingChange).not.toHaveBeenCalled();

    act(() => {
      sortButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSortingChange).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
