// @vitest-environment jsdom

import { Profiler, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "@/components/features/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/features/data-grid/data-grid";
import { installNoopResizeObserver, installNoopWebAnimations } from "@/test-utils/react-act";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();
installNoopWebAnimations();

interface Row {
  id: string;
  name: string;
}

const columns: DataGridColumnDef<Row>[] = [{ accessorKey: "name", header: "姓名" }];

afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("DataGrid column pinning", () => {
  it("pins the conventional actions column to the right by default", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DataGrid
          columns={[
            { accessorKey: "name", header: "姓名" },
            { cell: () => null, header: "操作", id: "actions", maxSize: 80, minSize: 80 },
          ]}
          data={[{ id: "1", name: "张三" }]}
          empty={<p>暂无记录</p>}
          getRowId={(row) => row.id}
          pagination={{
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
            page: 1,
            pageSize: 20,
          }}
          total={1}
          totalPages={1}
        />,
      );
    });

    const actionsHeader = [...container.querySelectorAll<HTMLElement>("th")].find(
      (cell) => cell.textContent === "操作",
    );

    expect(actionsHeader?.style.position).toBe("sticky");
    expect(actionsHeader?.style.insetInlineEnd).toBe("0px");

    act(() => root.unmount());
  });

  it("keeps the responsive pagination footer inside the table container", () => {
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
          pagination={{
            onPageChange: vi.fn(),
            onPageSizeChange: vi.fn(),
            page: 1,
            pageSize: 1,
          }}
          total={3}
          totalPages={3}
        />,
      );
    });

    const grid = container.querySelector('[data-slot="data-grid"]');
    const pagination = container.querySelector('[data-slot="data-grid-pagination"]');

    expect(pagination?.parentElement).toBe(grid);

    expect(
      pagination?.querySelector('[data-slot="data-grid-pagination-mobile-info"]')?.textContent,
    ).toContain("1 / 3");

    act(() => root.unmount());
  });

  it("does not add a scroll-state commit to an unpinned column update", () => {
    const onRender = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const data = [{ id: "1", name: "张三" }];
    const pagination = {
      onPageChange: vi.fn(),
      onPageSizeChange: vi.fn(),
      page: 1,
      pageSize: 20,
    };

    const renderGrid = (nextColumns: DataGridColumnDef<Row>[]) => (
      <Profiler id="data-grid" onRender={onRender}>
        <DataGrid
          columns={nextColumns}
          data={data}
          empty={<p>暂无记录</p>}
          getRowId={(row) => row.id}
          pagination={pagination}
          total={1}
          totalPages={1}
        />
      </Profiler>
    );

    act(() => {
      root.render(renderGrid(columns));
    });
    onRender.mockClear();

    act(() => {
      root.render(renderGrid([...columns]));
    });

    // TanStack Table may publish one nested update for its column model. The
    // grid must not add another commit by resetting unused overflow state.
    expect(onRender.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(onRender.mock.calls.length).toBeLessThanOrEqual(2);

    act(() => root.unmount());
  });

  it("restores sticky columns when pinning is re-enabled", () => {
    const pinnedColumns: DataGridColumnDef<Row>[] = [
      { accessorKey: "name", header: "姓名" },
      { cell: () => null, header: "操作", id: "actions" },
    ];
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const renderGrid = (pinned: boolean) => (
      <DataGrid
        columnPinning={pinned ? { end: ["actions"], start: ["name"] } : { end: [] }}
        columns={pinnedColumns}
        data={[{ id: "1", name: "张三" }]}
        empty={<p>暂无记录</p>}
        getRowId={(row) => row.id}
        pagination={{
          onPageChange: vi.fn(),
          onPageSizeChange: vi.fn(),
          page: 1,
          pageSize: 20,
        }}
        total={1}
        totalPages={1}
      />
    );

    act(() => root.render(renderGrid(true)));

    const header = (label: string) =>
      [...container.querySelectorAll("th")].find((cell) => cell.textContent === label);
    expect(header("姓名")?.style.position).toBe("sticky");
    expect(header("操作")?.style.position).toBe("sticky");

    act(() => root.render(renderGrid(false)));
    expect(header("姓名")?.style.position).toBe("");
    expect(header("操作")?.style.position).toBe("");

    act(() => root.render(renderGrid(true)));
    expect(header("姓名")?.style.position).toBe("sticky");
    expect(header("操作")?.style.position).toBe("sticky");

    act(() => root.unmount());
  });
});
