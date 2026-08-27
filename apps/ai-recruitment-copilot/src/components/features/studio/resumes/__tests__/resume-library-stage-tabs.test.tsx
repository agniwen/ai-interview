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
import { buildInfiniteDataGridQueryKey } from "@/components/data-grid/query-contract";
import { ResumeLibraryPageShell } from "../resume-library-page-shell";
import { coerceSearchParams, useResumeLibrarySearchState } from "../resume-library-page-model";
import type { ResumeLibraryGridState, SearchParamsRecord } from "../resume-library-page-model";

enableReactActEnvironment();
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

function tab(label: string) {
  const element = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
    (button) => button.textContent === label,
  );
  expect(element).toBeDefined();
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
  it("restores the six stage tabs and reads the selected stage from the URL", async () => {
    await renderPage({ stage: "human_interview" });
    expect([...document.querySelectorAll('[role="tab"]')].map((item) => item.textContent)).toEqual([
      "全部",
      "简历筛选",
      "AI 面试",
      "真人复面",
      "Offer",
      "已结案",
    ]);
    expect(tab("真人复面")?.getAttribute("aria-selected")).toBe("true");
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
    act(() => tab("AI 面试")?.click());
    await flushReactUpdates();
    expect(currentSearch).toMatchObject({
      creatorIds: "member-1",
      page: 1,
      skills: "Docker",
      stage: "ai_interview",
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
    act(() => tab("全部")?.click());
    await flushReactUpdates();
    expect(currentSearch.stage).toBeUndefined();
    expect(currentGrid.filters.skills).toBe("Docker");
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
    expect(tab("Offer")?.getAttribute("aria-selected")).toBe("true");
    expect(currentGrid.bind.canResetFilters).toBe(false);
    expect(currentGrid.rowSelection).toEqual({});
  });
});
