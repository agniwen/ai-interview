// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { setTimeout as delay } from "node:timers/promises";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route as approvalRoute } from "./w.$slug.studio.offer-approvals";
import { Route as indexRoute } from "./w.$slug.studio.offer-approvals.index";
import { Route as detailRoute } from "./w.$slug.studio.offer-approvals.$approvalId";

// SAFETY: React's test environment flag is set to its documented boolean value.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Offer approval nested routes", () => {
  it.each([
    ["/w/acme/studio/offer-approvals", "列表候选人", "详情申请理由"],
    ["/w/acme/studio/offer-approvals/approval-1", "详情申请理由", "列表候选人"],
  ])("renders the matching page at %s", async (url, expected, hidden) => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        Response.json(
          url.endsWith("approval-1")
            ? {
                attemptNumber: 1,
                id: "approval-1",
                status: "pending",
                reason: "详情申请理由",
                snapshot: {
                  candidateName: "候选人",
                  companyName: "公司",
                  position: "岗位",
                  currency: "CNY",
                  baseSalary: 30_000,
                  bonus: null,
                },
                steps: [],
                notifications: [],
                history: [],
              }
            : {
                items: [
                  {
                    id: "approval-1",
                    candidateName: "列表候选人",
                    position: "岗位",
                    status: "pending",
                    createdAt: new Date().toISOString(),
                  },
                ],
                total: 1,
                page: 1,
              },
        ),
      ),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const rootRoute = createRootRoute();
    const parent = createRoute({
      component: approvalRoute.options.component,
      getParentRoute: () => rootRoute,
      path: "/w/$slug/studio/offer-approvals",
    });
    const index = createRoute({
      component: indexRoute.options.component,
      getParentRoute: () => parent,
      path: "/",
    });
    const detail = createRoute({
      component: detailRoute.options.component,
      getParentRoute: () => parent,
      path: "$approvalId",
    });
    const router = createRouter({
      history: createMemoryHistory({ initialEntries: [url] }),
      routeTree: rootRoute.addChildren([parent.addChildren([index, detail])]),
    });
    await router.load();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>,
        );
        await Promise.resolve();
      });
      await act(async () => {
        await delay(10);
      });
      expect(host.textContent).toContain(expected);
      expect(host.textContent).not.toContain(hidden);
    } finally {
      act(() => root.unmount());
      host.remove();
      queryClient.clear();
    }
  });
});
