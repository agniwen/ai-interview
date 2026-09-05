// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserMenuDropdown } from "./sidebar-user-section";

// SAFETY: This React-owned test flag is optional and intentionally set only for the jsdom process.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("sidebar user menu", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("opens workspace switching as a hoverable submenu", () => {
    const onSwitchWorkspace = vi.fn();
    act(() => {
      root.render(
        <UserMenuDropdown
          activeWorkspace={{ id: "workspace-1", name: "产品团队", slug: "product" }}
          onSignOut={vi.fn()}
          onSwitchWorkspace={onSwitchWorkspace}
          onThemeChange={vi.fn()}
          switchingWorkspace={false}
          theme="system"
          user={{ email: "user@example.com", id: "user-1", name: "测试用户" }}
          workspaces={[
            { id: "workspace-1", name: "产品团队", slug: "product" },
            { id: "workspace-2", name: "招聘团队", slug: "recruiting" },
          ]}
        />,
      );
    });

    const userMenuTrigger = container.querySelector<HTMLButtonElement>("button");
    expect(userMenuTrigger).not.toBeNull();
    expect(userMenuTrigger?.classList).toContain("h-10");
    expect(userMenuTrigger?.classList).toContain("border-transparent");
    expect(userMenuTrigger?.classList).toContain("hover:border-transparent");
    expect(userMenuTrigger?.classList).toContain("focus-visible:border-transparent");
    expect(userMenuTrigger?.classList).toContain("dark:hover:bg-sidebar-accent");
    act(() => userMenuTrigger?.click());

    const workspaceSubmenuTrigger = document.body.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-sub-trigger"]',
    );
    expect(workspaceSubmenuTrigger?.textContent).toContain("切换工作区");
    expect(workspaceSubmenuTrigger?.getAttribute("aria-haspopup")).toBe("menu");

    vi.useFakeTimers();
    act(() => {
      workspaceSubmenuTrigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      workspaceSubmenuTrigger?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      vi.advanceTimersByTime(100);
    });

    const workspaceSubmenu = document.body.querySelector<HTMLElement>(
      '[data-slot="dropdown-menu-sub-content"]',
    );
    expect(workspaceSubmenu?.textContent).toContain("产品团队");
    expect(workspaceSubmenu?.textContent).toContain("招聘团队");
    const workspaceItems = workspaceSubmenu?.querySelectorAll<HTMLElement>(
      '[data-slot="dropdown-menu-radio-item"]',
    );
    expect(workspaceItems).toHaveLength(2);
    act(() => workspaceItems?.[1]?.click());
    expect(onSwitchWorkspace).toHaveBeenCalledWith("workspace-2");
  });

  it("switches theme from a hoverable submenu", () => {
    const onThemeChange = vi.fn();
    act(() => {
      root.render(
        <UserMenuDropdown
          activeWorkspace={{ id: "workspace-1", name: "产品团队", slug: "product" }}
          onSignOut={vi.fn()}
          onSwitchWorkspace={vi.fn()}
          onThemeChange={onThemeChange}
          switchingWorkspace={false}
          theme="system"
          user={{ email: "user@example.com", id: "user-1", name: "测试用户" }}
          workspaces={[]}
        />,
      );
    });

    const userMenuTrigger = container.querySelector<HTMLButtonElement>("button");
    act(() => userMenuTrigger?.click());
    const themeSubmenuTrigger = [
      ...document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-sub-trigger"]'),
    ].find((element) => element.textContent?.includes("主题"));

    vi.useFakeTimers();
    act(() => {
      themeSubmenuTrigger?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      themeSubmenuTrigger?.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      vi.advanceTimersByTime(100);
    });

    const darkThemeItem = [
      ...document.body.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-radio-item"]'),
    ].find((element) => element.textContent?.includes("深色"));
    act(() => darkThemeItem?.click());

    expect(onThemeChange).toHaveBeenCalledWith("dark");
  });
});
