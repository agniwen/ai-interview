import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UserMenuDropdown } from "./sidebar-user-section";

const ACTIVE_WORKSPACE = {
  id: "workspace-1",
  name: "产品测试工作区",
  slug: "product-testing",
};

describe("sidebar user controls", () => {
  it("shows the active workspace below the user name in smaller text", () => {
    const html = renderToStaticMarkup(
      <UserMenuDropdown
        activeWorkspace={ACTIVE_WORKSPACE}
        onSignOut={vi.fn()}
        onSwitchWorkspace={vi.fn()}
        switchingWorkspace={false}
        user={{ email: "tester@example.com", id: "user-1", name: "测试用户" }}
        workspaces={[ACTIVE_WORKSPACE]}
      />,
    );

    expect(html.indexOf("测试用户")).toBeLessThan(html.indexOf("产品测试工作区"));
    expect(html).toContain("text-[10px]");
  });

  it("moves workspace switching and settings out of the top chrome", () => {
    const sidebarSource = readFileSync(
      join(import.meta.dirname, "sidebar-user-section.tsx"),
      "utf-8",
    );
    const chromeSource = readFileSync(join(import.meta.dirname, "desktop-chrome-bar.tsx"), "utf-8");

    expect(sidebarSource).toContain("切换工作区");
    expect(sidebarSource).toContain('render={<Link to="/settings" />}');
    expect(chromeSource).not.toContain("WorkspaceSelect");
    expect(chromeSource).not.toContain('to="/settings"');
  });
});
