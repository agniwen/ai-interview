// @vitest-environment jsdom

import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatPendingSkeleton } from "./chat-page-skeleton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = vi.fn();

async function renderPendingSkeleton(
  pathname: string,
  {
    indexLoader,
    sessionLoader,
  }: { indexLoader?: () => Promise<unknown>; sessionLoader?: () => Promise<unknown> } = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const rootRoute = createRootRoute();
  const agentRoute = createRoute({
    component: ChatPendingSkeleton,
    getParentRoute: () => rootRoute,
    path: "/w/$slug/agent",
  });
  const agentIndexRoute = createRoute({
    getParentRoute: () => agentRoute,
    loader: indexLoader,
    path: "/",
  });
  const agentSessionRoute = createRoute({
    getParentRoute: () => agentRoute,
    loader: sessionLoader,
    path: "/$sessionId",
  });
  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [pathname] }),
    routeTree: rootRoute.addChildren([
      agentRoute.addChildren([agentIndexRoute, agentSessionRoute]),
    ]),
  });

  await act(async () => {
    await router.load();
    root.render(<RouterProvider router={router} />);
  });

  return { container, root, router };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ChatPendingSkeleton", () => {
  it("keeps the current skeleton on the new chat route", async () => {
    const { container, root } = await renderPendingSkeleton("/w/demo/agent");

    expect(container.querySelector("output")?.getAttribute("aria-label")).toBe("招聘对话加载中");
    root.unmount();
  });

  it("shows the message list skeleton on a session route", async () => {
    const { container, root } = await renderPendingSkeleton("/w/demo/agent/session-1");

    expect(container.querySelector("output")?.getAttribute("aria-label")).toBe("聊天记录加载中");
    root.unmount();
  });

  it("prefers the pending new chat route over the current session route", async () => {
    const loader = Promise.withResolvers<null>();
    const { container, root, router } = await renderPendingSkeleton("/w/demo/agent/session-1", {
      indexLoader: () => loader.promise,
    });

    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({ params: { slug: "demo" }, to: "/w/$slug/agent" });
      await Promise.resolve();
    });

    expect(container.querySelector("output")?.getAttribute("aria-label")).toBe("招聘对话加载中");

    await act(async () => {
      loader.resolve(null);
      await navigation;
    });
    root.unmount();
  });

  it("shows the message list skeleton while a session route is pending", async () => {
    const loader = Promise.withResolvers<null>();
    const { container, root, router } = await renderPendingSkeleton("/w/demo/agent", {
      sessionLoader: () => loader.promise,
    });

    let navigation!: Promise<void>;
    await act(async () => {
      navigation = router.navigate({
        params: { sessionId: "session-1", slug: "demo" },
        to: "/w/$slug/agent/$sessionId",
      });
      await Promise.resolve();
    });

    expect(container.querySelector("output")?.getAttribute("aria-label")).toBe("聊天记录加载中");

    await act(async () => {
      loader.resolve(null);
      await navigation;
    });
    root.unmount();
  });
});
