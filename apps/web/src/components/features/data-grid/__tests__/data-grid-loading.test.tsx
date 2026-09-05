// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid, DataGridContentSkeleton } from "@/components/features/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/features/data-grid/data-grid";
import { installNoopResizeObserver, installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopWebAnimations();
installNoopResizeObserver();

interface Row {
  email: string;
  id: string;
  name: string;
}

const columns: DataGridColumnDef<Row>[] = [
  { accessorKey: "name", header: "姓名" },
  { accessorKey: "email", header: "邮箱" },
  { cell: () => null, header: "操作", id: "actions", size: 80 },
];

function renderGrid({ data = [], loading = false }: { data?: Row[]; loading?: boolean }) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <DataGrid
        columns={columns}
        data={data}
        empty={<p>暂无记录</p>}
        getRowId={(row) => row.id}
        loading={loading}
        pagination={{
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
          page: 1,
          pageSize: 20,
        }}
        total={data.length}
        totalPages={data.length > 0 ? 1 : 0}
      />,
    );
  });

  return container;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DataGrid initial loading", () => {
  it("shows a table skeleton before the first rows arrive", () => {
    const container = renderGrid({ loading: true });

    const grid = container.querySelector('[data-slot="data-grid"]');
    const rows = container.querySelectorAll("tbody tr");
    const headers = container.querySelectorAll("th");
    expect(grid).not.toBeNull();
    expect(container.querySelector('[data-slot="data-grid-scroll-area"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="data-grid-pagination"]')?.parentElement).toBe(grid);
    expect(container.querySelector('[data-slot="pagination-bar-skeleton"]')).toBeNull();
    expect(rows).toHaveLength(20);
    expect(headers).toHaveLength(3);
    expect(headers[0]?.textContent).toContain("姓名");
    expect(headers[0]?.className).toContain("border-e");
    expect(headers[2]?.className).toContain("border-s");
    expect(rows[0]?.querySelector("td")?.className).toContain("border-e");
    expect(rows[0]?.querySelector('td[data-pinned="end"]')?.className).toContain("border-s");
    expect(rows[0]?.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect([...rows].every((row) => row.classList.contains("h-[53px]"))).toBe(true);
  });

  it("keeps existing rows visible while loading", () => {
    const container = renderGrid({
      data: [{ email: "zhangsan@example.com", id: "1", name: "张三" }],
      loading: true,
    });

    expect(container.querySelector('[data-slot="data-grid-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-slot="pagination-bar-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-slot="data-grid-pagination"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="data-grid-scroll-area"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="data-grid"]')?.className).toContain("shadow-none");
    expect(container.textContent).toContain("张三");
    expect(container.querySelector('tbody tr[data-row-id="1"]')).not.toBeNull();
    expect(container.querySelector("tbody tr")?.className).toContain("h-[53px]");
    expect(container.querySelector("tbody td")?.className).toContain("border-e");
  });

  it("shows the empty state after an empty initial request finishes", () => {
    const container = renderGrid({ loading: false });

    expect(container.querySelector('[data-slot="data-grid-skeleton"]')).toBeNull();
    expect(container.textContent).toContain("暂无记录");
    expect(container.querySelector('[data-slot="data-grid"]')).toBeNull();
  });

  it("reveals loaded content once and keeps it visible during refresh", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (loading: boolean, data: Row[]) => {
      act(() =>
        root.render(
          <DataGrid
            columns={columns}
            data={data}
            empty={<p>暂无记录</p>}
            getRowId={(row) => row.id}
            loading={loading}
            pagination={{ onPageChange: vi.fn(), onPageSizeChange: vi.fn(), page: 1, pageSize: 20 }}
            total={data.length}
            totalPages={1}
          />,
        ),
      );
    };
    render(true, []);
    const reveal = container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]');
    expect(reveal?.dataset.state).toBe("loading");
    expect(
      container.querySelector('[data-slot="skeleton-reveal-content"]')?.hasAttribute("inert"),
    ).toBe(true);
    const data = [{ email: "zhangsan@example.com", id: "1", name: "张三" }];
    render(false, data);
    expect(container.querySelector('[data-slot="skeleton-reveal"]')).toBe(reveal);
    expect(reveal?.dataset.state).toBe("revealed");
    expect(container.querySelector('[data-slot="skeleton-reveal-placeholder"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="skeleton-reveal-content"]')?.textContent).toContain(
      "张三",
    );
    render(true, data);
    expect(reveal?.dataset.state).toBe("revealed");
    expect(
      container.querySelector('[data-slot="skeleton-reveal-content"]')?.hasAttribute("inert"),
    ).toBe(false);
    act(() => root.unmount());
  });

  it("uses the same grid shell for route-level skeletons", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<DataGridContentSkeleton columnCount={3} rowCount={4} />);
    });

    const skeleton = container.querySelector('[data-slot="data-grid-skeleton"]');
    const grid = skeleton?.querySelector('[data-slot="data-grid"]');
    expect(grid).not.toBeNull();
    expect(skeleton?.querySelectorAll("th")).toHaveLength(3);
    expect(skeleton?.querySelectorAll("tbody tr")).toHaveLength(4);
    expect(skeleton?.querySelector('[data-slot="data-grid-pagination"]')?.parentElement).toBe(grid);

    act(() => root.unmount());
  });
});
