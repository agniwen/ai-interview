// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { SidebarTabsView } from "./sidebar-tabs";

const routerMocks = {
  navigate: vi.fn(),
  pathname: "/w/acme/agent",
  preloadRoute: vi.fn(),
};

enableReactActEnvironment();

const roots: Awaited<ReturnType<typeof renderInAct>>["root"][] = [];

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  routerMocks.navigate.mockReset();
  routerMocks.preloadRoute.mockReset();
  routerMocks.pathname = "/w/acme/agent";
  document.body.innerHTML = "";
});

function findTab(label: string) {
  return [...document.querySelectorAll("button")].find((button) => button.textContent === label);
}

describe("SidebarTabs", () => {
  it("preloads the Studio route on pointer intent and navigates with the same typed target", async () => {
    const { root } = await renderInAct(
      <SidebarTabsView
        dependencies={{
          navigate: routerMocks.navigate,
          pathname: routerMocks.pathname,
          preloadRoute: routerMocks.preloadRoute,
          slug: "acme",
        }}
      />,
    );
    roots.push(root);
    const studioTab = findTab("Studio");

    act(() => {
      studioTab?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    });

    expect(routerMocks.preloadRoute).toHaveBeenCalledWith({
      params: { slug: "acme" },
      to: "/w/$slug/studio/resumes",
    });

    act(() => studioTab?.click());

    expect(routerMocks.navigate).toHaveBeenCalledOnce();
    expect(routerMocks.navigate).toHaveBeenCalledWith({
      params: { slug: "acme" },
      to: "/w/$slug/studio/resumes",
    });
  });

  it("preloads the inactive Agent route from keyboard and touch intent", async () => {
    routerMocks.pathname = "/w/acme/studio/resumes";
    const { root } = await renderInAct(
      <SidebarTabsView
        dependencies={{
          navigate: routerMocks.navigate,
          pathname: routerMocks.pathname,
          preloadRoute: routerMocks.preloadRoute,
          slug: "acme",
        }}
      />,
    );
    roots.push(root);
    const agentTab = findTab("Agent");

    act(() => agentTab?.focus());
    act(() => {
      agentTab?.dispatchEvent(new Event("touchstart", { bubbles: true }));
    });

    expect(routerMocks.preloadRoute).toHaveBeenCalledWith({
      params: { slug: "acme" },
      to: "/w/$slug/agent",
    });
  });

  it("does not preload the active route", async () => {
    const { root } = await renderInAct(
      <SidebarTabsView
        dependencies={{
          navigate: routerMocks.navigate,
          pathname: routerMocks.pathname,
          preloadRoute: routerMocks.preloadRoute,
          slug: "acme",
        }}
      />,
    );
    roots.push(root);
    const agentTab = findTab("Agent");

    act(() => {
      agentTab?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      agentTab?.focus();
    });

    expect(routerMocks.preloadRoute).not.toHaveBeenCalled();
  });

  it("still navigates when speculative preloading fails", async () => {
    routerMocks.preloadRoute.mockRejectedValueOnce(new Error("preload failed"));
    const { root } = await renderInAct(
      <SidebarTabsView
        dependencies={{
          navigate: routerMocks.navigate,
          pathname: routerMocks.pathname,
          preloadRoute: routerMocks.preloadRoute,
          slug: "acme",
        }}
      />,
    );
    roots.push(root);
    const studioTab = findTab("Studio");

    await act(async () => {
      studioTab?.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      await Promise.resolve();
    });
    act(() => studioTab?.click());

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      params: { slug: "acme" },
      to: "/w/$slug/studio/resumes",
    });
  });
});
