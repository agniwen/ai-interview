// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "@/components/features/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/features/data-grid/data-grid";
import { installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopWebAnimations();

interface Row {
  id: string;
  name: string;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGrid sortable header", () => {
  it("renders only an isolated sort button when the column is pinned", () => {
    const onSortingChange = vi.fn();
    const columns: DataGridColumnDef<Row>[] = [
      {
        enablePinning: false,
        enableSorting: true,
        header: "姓名",
        id: "name",
      },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGrid
          columnPinning={{ start: ["name"] }}
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
    const sortButton = header?.querySelector("button");
    const headerLabel = sortButton?.previousElementSibling;

    expect(header?.className).toContain("px-3");
    expect(header?.className).toContain("font-medium");
    expect(header?.className).toContain("whitespace-nowrap");
    expect(header?.className).not.toContain("bg-muted");
    expect(header?.textContent).toContain("姓名");
    expect(header?.querySelectorAll("button")).toHaveLength(1);
    expect(header?.dataset.pinned).toBe("start");
    expect(header?.style.position).toBe("sticky");
    expect(headerLabel?.className).not.toContain("text-secondary-foreground");
    expect(headerLabel?.className).not.toContain("font-normal");
    expect(sortButton?.textContent).not.toContain("姓名");
    expect(sortButton?.getAttribute("aria-label")).toBe("姓名：升序");
    expect(sortButton?.dataset.size).toBe("icon-xs");
    expect(sortButton?.dataset.variant).toBe("ghost");
    expect(sortButton?.className).toContain("rounded-sm");

    act(() => {
      sortButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSortingChange).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
