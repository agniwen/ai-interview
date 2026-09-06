// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { act, useEffect } from "react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enableReactActEnvironment,
  renderInAct,
  unmountInAct,
  flushReactUpdates,
} from "@/test-utils/react-act";
import { buildInfiniteDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { ResumeLibraryPageShell } from "../resume-library-page-shell";
import { coerceSearchParams, useResumeLibrarySearchState } from "../resume-library-page-model";
import type { ResumeLibraryGridState, SearchParamsRecord } from "../resume-library-page-model";

enableReactActEnvironment();
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = vi.fn();
    disconnect = vi.fn();
  },
);
const roots: Root[] = [];
let currentGrid: ResumeLibraryGridState;
let currentSearch: SearchParamsRecord;

function Harness() {
  const search = useRouterState({ select: (state) => state.location.search });
  const grid = useResumeLibrarySearchState({ onRefresh: vi.fn(), search, slug: "default" });
  useEffect(() => {
    currentGrid = grid;
    currentSearch = search;
  }, [grid, search]);
  return (
    <ResumeLibraryPageShell
      grid={grid}
      metrics={undefined}
      metricsChartKey="team:0"
      metricsError={null}
      metricsFetching={false}
      metricsScope="team"
      metricsSwitching={false}
      onMetricsRetry={() => Promise.resolve()}
      onMetricsScopeChange={vi.fn()}
      slug="default"
    >
      <button
        disabled={!grid.bind.canResetFilters}
        onClick={grid.bind.onResetFilters}
        type="button"
      >
        清空筛选
      </button>
    </ResumeLibraryPageShell>
  );
}

async function renderPage(search: SearchParamsRecord) {
  const rootRoute = createRootRoute();
  const pageRoute = createRoute({
    component: Harness,
    getParentRoute: () => rootRoute,
    path: "/w/$slug/studio/resumes",
    validateSearch: coerceSearchParams,
  });
  const queryString = new URLSearchParams(
    Object.entries(search).map(([key, value]) => [key, String(value)]),
  );
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [`/w/default/studio/resumes?${queryString}`] }),
    routeTree: rootRoute.addChildren([pageRoute]),
  });
  await router.load();
  const { root } = await renderInAct(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  roots.push(root);
}

function tab(label: string, listLabel?: string) {
  const element = [
    ...document.querySelectorAll<HTMLButtonElement>(
      listLabel ? `[role="tablist"][aria-label="${listLabel}"] [role="tab"]` : '[role="tab"]',
    ),
  ].find((button) => button.textContent === label);
  if (!element) {
    throw new Error(`Missing tab: ${label}`);
  }
  return element;
}

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("recruitment stage tabs", () => {
  it("resets pagination and query cache when creation dates change while preserving stage", async () => {
    await renderPage({
      createdAtRange: "custom:2026-08-01:2026-08-20",
      page: 3,
      skills: "Docker",
      stage: "ai_interview",
    });
    const previousKey = buildInfiniteDataGridQueryKey(["studio-resumes", "default"], {
      filters: currentGrid.filters,
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    act(() => currentGrid.setRowSelection({ candidate: true }));
    act(() => currentGrid.bind.onFilterChange("createdAtRange", "custom:2026-08-26:2026-08-26"));
    await flushReactUpdates();
    expect(currentSearch).toMatchObject({
      createdAtRange: "custom:2026-08-26:2026-08-26",
      page: 1,
      skills: "Docker",
      stage: "ai_interview",
    });
    expect(currentGrid.rowSelection).toEqual({});
    expect(currentGrid.bind.canResetFilters).toBe(true);
    expect(
      buildInfiniteDataGridQueryKey(["studio-resumes", "default"], {
        filters: currentGrid.filters,
        search: "",
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).not.toEqual(previousKey);
  });
  it("restores all recruitment stage tabs and reads the selected stage from the URL", async () => {
    await renderPage({ stage: "second_interview" });
    expect(
      [...document.querySelectorAll('[role="tablist"][aria-label="招聘阶段"] [role="tab"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["全部", "简历筛选", "面试", "Offer协商", "入职办理", "已结束"]);
    expect(
      [...document.querySelectorAll('[role="tablist"][aria-label="面试子流程"] [role="tab"]')].map(
        (item) => item.textContent,
      ),
    ).toEqual(["全部", "AI 初面", "复试", "终试"]);
    expect(tab("面试")?.getAttribute("aria-selected")).toBe("true");
    expect(tab("复试")?.getAttribute("aria-selected")).toBe("true");
    expect(currentGrid.bind.canResetFilters).toBe(false);
    expect(currentGrid.bind.filterValues).not.toHaveProperty("stage");
  });

  it("preserves filters while switching stages, resets selection/page, and isolates query caches", async () => {
    await renderPage({ creatorIds: "member-1", page: 4, skills: "Docker", stage: "screening" });
    const previousKey = buildInfiniteDataGridQueryKey(["studio-resumes", "default"], {
      filters: currentGrid.filters,
      search: "",
      sortBy: "createdAt",
      sortOrder: "desc",
    });
    act(() => currentGrid.setRowSelection({ candidate: true }));
    act(() => tab("面试")?.click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("interview:all");
    act(() => tab("AI 初面")?.click());
    await flushReactUpdates();
    expect(currentSearch).toMatchObject({
      creatorIds: "member-1",
      page: 1,
      skills: "Docker",
      stage: "interview:ai",
    });
    expect(currentGrid.rowSelection).toEqual({});
    expect(
      buildInfiniteDataGridQueryKey(["studio-resumes", "default"], {
        filters: currentGrid.filters,
        search: "",
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).not.toEqual(previousKey);
    act(() => tab("全部", "面试子流程")?.click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("interview:all");
    expect(currentGrid.filters.skills).toBe("Docker");
  });

  it("restores an aggregate child URL with every stage still visible", async () => {
    await renderPage({ page: 2, stage: "all:interview:final" });
    expect(tab("全部", "招聘阶段").getAttribute("aria-selected")).toBe("true");
    expect(tab("面试 · 终试").getAttribute("aria-selected")).toBe("true");
    expect(tab("已结束 · 已归档")).toBeDefined();
    act(() => tab("全部", "全部子流程").click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("all");
    expect(currentSearch.page).toBe(1);
  });

  it("clears filter values without changing the stage or sorting", async () => {
    await renderPage({
      createdAtRange: "custom:2026-08-01:2026-08-26",
      creatorIds: "member-1",
      page: 3,
      skills: "Docker",
      sortBy: "createdAt",
      sortOrder: "asc",
      stage: "offer",
    });
    act(() => currentGrid.setRowSelection({ candidate: true }));
    act(() => currentGrid.bind.onResetFilters());
    await flushReactUpdates();
    expect(currentSearch).toMatchObject({
      page: 1,
      sortBy: "createdAt",
      sortOrder: "asc",
      stage: "offer",
    });
    expect(currentSearch.skills).toBeUndefined();
    expect(currentSearch.createdAtRange).toBeUndefined();
    expect(currentSearch.creatorIds).toBeUndefined();
    expect(tab("Offer协商")?.getAttribute("aria-selected")).toBe("true");
    expect(currentGrid.bind.canResetFilters).toBe(false);
    expect(currentGrid.rowSelection).toEqual({});
  });
  it("defaults to all and preserves the aggregate group in child URLs", async () => {
    await renderPage({});
    expect(tab("全部", "招聘阶段").getAttribute("aria-selected")).toBe("true");
    expect(tab("全部", "全部子流程").getAttribute("aria-selected")).toBe("true");
    act(() => tab("简历筛选 · 合格").click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("all:screening:pass");
    expect(tab("全部", "招聘阶段").getAttribute("aria-selected")).toBe("true");
    act(() => tab("Offer协商").click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("offer:all");
    expect(tab("全部", "Offer协商子流程").getAttribute("aria-selected")).toBe("true");
    expect(tab("谈薪")).toBeDefined();
    expect(tab("发 Offer")).toBeDefined();
    act(() => tab("发 Offer").click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("offer:send");
    act(() => tab("入职办理").click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBe("onboarding:all");
    expect(tab("待入职")).toBeDefined();
    expect(tab("放弃")).toBeDefined();
    expect(tab("已入职")).toBeDefined();
  });
});
