// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { SidebarTabs } from "./sidebar-tabs";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/w/acme/agent",
  preloadRoute: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => routerMocks.navigate,
  useRouter: () => ({ preloadRoute: routerMocks.preloadRoute }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname: routerMocks.pathname } }),
}));

vi.mock("@/lib/client/workspace-context", () => ({
  useWorkspaceSlug: () => "acme",
}));

vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const TabsContext = React.createContext<{
    onValueChange: (value: string) => void;
    value: string;
  }>({ onValueChange: () => {}, value: "" });

  return {
    Tabs: ({
      children,
      onValueChange,
      value,
    }: {
      children: React.ReactNode;
      onValueChange: (value: string) => void;
      value: string;
    }) => React.createElement(TabsContext.Provider, { value: { onValueChange, value } }, children),
    TabsList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
    TabsTrigger: ({
      children,
      value,
      ...props
    }: {
      children: React.ReactNode;
      value: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) => {
      const tabs = React.useContext(TabsContext);
      return React.createElement(
        "button",
        {
          ...props,
          "data-active": String(tabs.value === value),
          onClick: () => tabs.onValueChange(value),
          type: "button",
        },
        children,
      );
    },
  };
});

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
    const { root } = await renderInAct(<SidebarTabs />);
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
    const { root } = await renderInAct(<SidebarTabs />);
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
    const { root } = await renderInAct(<SidebarTabs />);
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
    const { root } = await renderInAct(<SidebarTabs />);
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
