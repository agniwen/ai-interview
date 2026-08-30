// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDataGridState } from "@/components/data-grid/use-data-grid-state";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = vi.fn();

type Grid = ReturnType<typeof useDataGridState<{ id: string }, { status: string }>>;

interface GridSearchParams {
  page?: number;
  status?: string;
}

async function renderGridHook({
  queryFn = vi.fn(() => Promise.resolve({ records: [], total: 0, totalPages: 5 })),
  searchParams = "",
  keywordSearch = false,
}: {
  queryFn?: ReturnType<
    typeof vi.fn<() => Promise<{ records: { id: string }[]; total: number; totalPages: number }>>
  >;
  searchParams?: string;
  keywordSearch?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let current: Grid | null = null;

  function Harness() {
    current = useDataGridState<{ id: string }, { status: string }>({
      initialFilters: { status: "" },
      keywordSearch,
      queryFn,
      queryKeyBase: ["test-grid"],
    });
    return null;
  }

  const rootRoute = createRootRoute({
    component: Outlet,
    validateSearch: (search: GridSearchParams) => search,
  });
  const indexRoute = createRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    ),
    getParentRoute: () => rootRoute,
    path: "/",
  });
  const routeTree = rootRoute.addChildren([indexRoute]);
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [`/${searchParams}`] }),
    routeTree,
  });

  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
    await Promise.resolve();
  });

  return {
    get current() {
      if (!current) {
        throw new Error("Hook did not render");
      }
      return current;
    },
    queryFn,
    root,
    router,
  };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("useDataGridState", () => {
  it("ignores legacy mixed search unless the page explicitly enables task-ID lookup", async () => {
    const migrated = await renderGridHook({ searchParams: "?search=hidden" });
    expect(migrated.current.search).toBe("");
    expect(migrated.queryFn).toHaveBeenLastCalledWith(expect.objectContaining({ search: "" }));
    const queue = await renderGridHook({ keywordSearch: true, searchParams: "?search=job-1" });
    expect(queue.current.search).toBe("job-1");
  });
  it("clears condition values in one update without changing page context or sorting", async () => {
    const harness = await renderGridHook({
      searchParams: "?page=3&status=done&context=queue-2&sortBy=createdAt&sortOrder=asc",
    });
    act(() => harness.current.setRowSelection({ candidate: true }));
    harness.queryFn.mockClear();
    await act(async () => {
      harness.current.bind.onResetFilters({ status: "all", textFilters: "" });
      await Promise.resolve();
    });
    expect(harness.router.state.location.search).toMatchObject({
      context: "queue-2",
      page: 1,
      sortBy: "createdAt",
      sortOrder: "asc",
      status: "all",
    });
    expect(harness.current.rowSelection).toEqual({});
    expect(harness.queryFn).toHaveBeenCalledTimes(1);
  });

  it("keeps atomic conditions together in the URL, request and page reset", async () => {
    const harness = await renderGridHook({ searchParams: "?page=3" });
    harness.queryFn.mockClear();
    await act(async () => {
      harness.current.bind.onFilterChange("textFilters", '{"company":"腾讯","school":"清华"}');
      await Promise.resolve();
    });
    expect(harness.router.state.location.search).toMatchObject({
      page: 1,
      textFilters: '{"company":"腾讯","school":"清华"}',
    });
    expect(harness.queryFn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        filters: { status: "", textFilters: '{"company":"腾讯","school":"清华"}' },
        page: 1,
      }),
    );
    await act(async () => {
      harness.current.bind.onResetFilters();
      await Promise.resolve();
    });
    expect(harness.current.filters.textFilters).toBe("");
    expect(harness.current.bind.canResetFilters).toBe(false);
  });

  it("hydrates a non-default page from the URL", async () => {
    const harness = await renderGridHook({ searchParams: "?page=2" });

    expect(harness.current.page).toBe(2);
  });

  it("does not reset pagination after moving to the next page", async () => {
    const harness = await renderGridHook({
      searchParams: "?page=1",
    });

    await act(async () => {
      harness.current.setPage(2);
      await Promise.resolve();
    });

    expect(harness.current.page).toBe(2);
    expect(harness.router.state.location.search).toMatchObject({ page: 2 });
    expect(harness.router.state.location.href).toContain("?page=2");
    expect(harness.router.state.location.href).not.toContain('"2"');
  });

  it("commits a filter and page reset together and clears selected records", async () => {
    const harness = await renderGridHook({ searchParams: "?page=3" });
    act(() => harness.current.setRowSelection({ candidate: true }));
    harness.queryFn.mockClear();

    await act(async () => {
      harness.current.setFilter("status", "done");
      await Promise.resolve();
    });

    expect(harness.current.page).toBe(1);
    expect(harness.current.rowSelection).toEqual({});
    expect(harness.router.state.location.search).toMatchObject({ page: 1, status: "done" });
    expect(harness.queryFn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ filters: { status: "done", textFilters: "" }, page: 1 }),
    );
  });

  it("exposes a failed list query and a retry callback", async () => {
    const failure = new Error("加载部门列表失败");
    const queryFn = vi.fn<
      () => Promise<{ records: { id: string }[]; total: number; totalPages: number }>
    >(() => Promise.reject(failure));
    const harness = await renderGridHook({ queryFn });

    await act(async () => {
      await vi.waitFor(() => {
        expect(harness.current.bind.error).toBe(failure);
      });
    });

    queryFn.mockResolvedValueOnce({ records: [], total: 0, totalPages: 0 });
    await act(async () => {
      harness.current.bind.onRetry();
      await vi.waitFor(() => {
        expect(queryFn).toHaveBeenCalledTimes(2);
      });
    });
  });
});
