// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "@/components/features/data-grid/data-grid";
import type { DataGridColumnDef } from "@/components/features/data-grid/data-grid";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: string;
  name: string;
}

const columns: DataGridColumnDef<Row>[] = [{ accessorKey: "name", header: "姓名" }];

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
    const reveal = container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]');
    const placeholder = container.querySelector<HTMLElement>(
      '[data-slot="skeleton-reveal-placeholder"]',
    );
    const content = container.querySelector<HTMLElement>('[data-slot="skeleton-reveal-content"]');

    expect(container.querySelector('[data-slot="data-grid-skeleton"]')).not.toBeNull();
    expect(reveal?.classList.contains("min-w-0")).toBe(true);
    expect(reveal?.classList.contains("grid-cols-[minmax(0,1fr)]")).toBe(true);
    expect(placeholder?.classList.contains("min-w-0")).toBe(true);
    expect(content?.classList.contains("min-w-0")).toBe(true);
    expect(
      container.querySelectorAll('[data-slot="data-grid-skeleton"] [data-slot="table-body"] tr'),
    ).toHaveLength(20);
    expect(container.querySelector('[data-slot="pagination-bar-skeleton"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state,
    ).toBe("loading");
    expect(
      container.querySelector('[data-slot="skeleton-reveal-content"]')?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      [...container.querySelectorAll('[data-slot="data-grid-skeleton"] tbody tr')].every((row) =>
        row.classList.contains("h-[53px]"),
      ),
    ).toBe(true);
  });

  it("keeps existing rows visible while loading", () => {
    const container = renderGrid({ data: [{ id: "1", name: "张三" }], loading: true });

    expect(container.querySelector('[data-slot="data-grid-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-slot="pagination-bar-skeleton"]')).toBeNull();
    expect(container.querySelector('[data-slot="pagination-bar"]')).not.toBeNull();
    expect(
      container.querySelector('[data-slot="skeleton-reveal-content"] .overflow-x-auto'),
    ).not.toBeNull();
    expect(container.textContent).toContain("张三");
    expect(container.querySelector("tbody tr")?.classList.contains("h-[53px]")).toBe(true);
    expect(
      container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state,
    ).toBe("revealed");
  });

  it("shows the empty state after an empty initial request finishes", () => {
    const container = renderGrid({ loading: false });

    expect(container.querySelector('[data-slot="data-grid-skeleton"]')).toBeNull();
    expect(container.textContent).toContain("暂无记录");
    expect(
      container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]')?.dataset.state,
    ).toBe("revealed");
  });
});
