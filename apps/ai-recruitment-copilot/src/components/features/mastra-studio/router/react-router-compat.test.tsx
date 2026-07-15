// @vitest-environment jsdom

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
import { Link } from "./react-router-compat";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = vi.fn();

async function renderStudioLink() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rootRoute = createRootRoute({ component: Outlet });
  const workflowsRoute = createRoute({
    component: () => <Link to="/workflows/resume-analysis">Resume analysis</Link>,
    getParentRoute: () => rootRoute,
    path: "/platform/mastra-studio/workflows",
  });
  const workflowRoute = createRoute({
    component: () => null,
    getParentRoute: () => rootRoute,
    path: "/platform/mastra-studio/workflows/$workflowId",
  });
  const router = createRouter({
    defaultPreload: "intent",
    defaultPreloadDelay: 10,
    history: createMemoryHistory({
      initialEntries: ["/platform/mastra-studio/workflows"],
    }),
    routeTree: rootRoute.addChildren([workflowsRoute, workflowRoute]),
  });

  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });

  return { container, root, router };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Mastra Studio router compatibility", () => {
  it("does not preload a route when a Studio link receives hover intent", async () => {
    const { container, root, router } = await renderStudioLink();
    const preloadRoute = vi.spyOn(router, "preloadRoute");
    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("/platform/mastra-studio/workflows/resume-analysis");

    vi.useFakeTimers();
    act(() => {
      link?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      vi.advanceTimersByTime(30);
    });
    vi.useRealTimers();

    expect(preloadRoute).not.toHaveBeenCalled();

    await act(async () => {
      link?.click();
      await Promise.resolve();
    });

    expect(router.state.location.pathname).toBe(
      "/platform/mastra-studio/workflows/resume-analysis",
    );
    root.unmount();
  });
});
