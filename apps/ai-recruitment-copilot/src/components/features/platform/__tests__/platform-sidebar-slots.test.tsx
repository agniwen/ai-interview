// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";
import { PlatformSidebarSlots, resolvePlatformSidebarNavItem } from "../platform-sidebar-slots";
import { resolvePlatformSidebarTab } from "../platform-sidebar-tabs";

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  pathname: "/platform/organizations",
}));
const commandMocks = vi.hoisted(() => ({
  setOpen: vi.fn(),
}));

vi.mock("@/components/features/mastra-studio/upstream/lib/command", () => ({
  useNavigationCommand: () => ({ setOpen: commandMocks.setOpen }),
}));

vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      children,
      to,
      ...props
    }: { children: React.ReactNode; to: string } & React.HTMLAttributes<HTMLAnchorElement>) =>
      React.createElement("a", { ...props, href: to }, children),
    useNavigate: () => routerMocks.navigate,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => string;
    }) => select({ location: { pathname: routerMocks.pathname } }),
  };
});

vi.mock("@/components/layout/app-sidebar/portals", async () => {
  const React = await import("react");
  const PortalContent = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    SidebarBodyPortalContent: PortalContent,
    SidebarFooterPortalContent: PortalContent,
    SidebarHeaderPortalContent: PortalContent,
  };
});

vi.mock("@/components/layout/sidebar-user-section", async () => {
  const React = await import("react");
  return {
    SidebarUserSection: () => React.createElement("div", { "data-testid": "sidebar-user" }),
  };
});

vi.mock("@/components/ui/sidebar", async () => {
  const React = await import("react");
  const Element = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children);

  return {
    SidebarGroup: Element,
    SidebarGroupContent: Element,
    SidebarGroupLabel: ({ children }: { children: React.ReactNode }) =>
      React.createElement("h2", null, children),
    SidebarMenu: Element,
    SidebarMenuButton: ({
      children,
      isActive,
      render,
      tooltip,
      ...props
    }: {
      children?: React.ReactNode;
      isActive: boolean;
      render?: React.ReactElement;
      tooltip: string;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.cloneElement(render ?? React.createElement("button", props, children), {
        "aria-label": props["aria-label"] ?? tooltip,
        "data-active": String(isActive),
      } as React.HTMLAttributes<HTMLElement>),
    SidebarMenuItem: Element,
    useSidebar: () => ({ state: "expanded" }),
  };
});

vi.mock("@/components/ui/tabs", async () => {
  const React = await import("react");
  const Element = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children);
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
    TabsList: Element,
    TabsTrigger: ({ children, value }: { children: React.ReactNode; value: string }) => {
      const tabs = React.useContext(TabsContext);
      return React.createElement(
        "button",
        {
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
  commandMocks.setOpen.mockReset();
  routerMocks.pathname = "/platform/organizations";
  document.body.innerHTML = "";
});

describe("PlatformSidebarSlots", () => {
  it("resolves the active tab from nested platform paths", () => {
    expect(resolvePlatformSidebarTab("/platform/users")).toBe("manage");
    expect(resolvePlatformSidebarTab("/platform/mastra-studio")).toBe("mastra");
    expect(resolvePlatformSidebarTab("/platform/mastra-studio/agents/demo")).toBe("mastra");
  });

  it("resolves active menu items from nested paths", () => {
    expect(resolvePlatformSidebarNavItem("/platform/users/member-1")?.title).toBe("所有用户");
    expect(
      resolvePlatformSidebarNavItem("/platform/mastra-studio/agents/demo")?.icon,
    ).toBeDefined();
  });

  it("keeps the existing management navigation and switches to debugging", async () => {
    const { root } = await renderInAct(<PlatformSidebarSlots />);
    roots.push(root);

    expect(document.body.textContent).toContain("所有工作区");
    expect(document.body.textContent).toContain("队列任务");
    expect(document.body.textContent).toContain("解析缓存");
    expect(document.body.textContent).toContain("LiveKit");
    expect(document.body.textContent).toContain("服务概览");
    expect(document.body.textContent).toContain("实时房间");
    expect(document.body.textContent).toContain("运行指标");
    expect(document.body.textContent).not.toContain("Agents");
    expect(document.querySelector("button[data-active='true']")?.textContent).toBe("管理");

    const debugTab = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "调试",
    );
    act(() => debugTab?.click());

    expect(routerMocks.navigate).toHaveBeenCalledWith({
      to: "/platform/mastra-studio/agents",
    });
  });

  it("shows grouped debugging navigation and marks nested items active", async () => {
    routerMocks.pathname = "/platform/mastra-studio/agents/demo";
    const { root } = await renderInAct(<PlatformSidebarSlots />);
    roots.push(root);

    expect(document.body.textContent).toContain("基础能力");
    expect(document.body.textContent).toContain("评估");
    expect(document.body.textContent).toContain("可观测性");
    expect(document.body.textContent).toContain("MCP 服务器");
    expect(document.body.textContent).toContain("设置");
    expect(document.body.textContent).toContain("资源");
    expect(document.body.textContent).toContain("搜索");
    expect(document.body.textContent).not.toContain("所有工作区");
    expect(document.querySelector("button[data-active='true']")?.textContent).toBe("调试");
    const agentsLink = document.querySelector<HTMLAnchorElement>(
      "a[href='/platform/mastra-studio/agents']",
    );
    expect(agentsLink).not.toBeNull();
    expect(agentsLink?.dataset.active).toBe("true");

    const searchButton = document.querySelector<HTMLButtonElement>(
      "button[aria-label='搜索并导航']",
    );
    act(() => searchButton?.click());
    expect(commandMocks.setOpen).toHaveBeenCalledWith(true);

    const manageTab = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "管理",
    );
    act(() => manageTab?.click());

    expect(routerMocks.navigate).toHaveBeenCalledWith({ to: "/platform/organizations" });
  });
});
