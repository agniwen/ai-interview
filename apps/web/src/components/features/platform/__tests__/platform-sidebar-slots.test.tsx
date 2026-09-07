import { describe, expect, it } from "vitest";
import {
  platformSidebarNavSections,
  resolvePlatformSidebarNavItem,
} from "../platform-sidebar-navigation";
import { PLATFORM_SIDEBAR_MENU_BUTTON_CLASS } from "../platform-sidebar-styles";

describe("PlatformSidebarSlots", () => {
  it("resolves active menu items from nested paths", () => {
    expect(resolvePlatformSidebarNavItem("/platform/users/member-1")?.title).toBe("所有用户");
  });

  it("keeps the platform navigation contract", () => {
    const titles = platformSidebarNavSections.flatMap((section) =>
      section.items.map((item) => item.title),
    );

    expect(titles).toEqual([
      "所有工作区",
      "所有用户",
      "邮箱监听",
      "飞书通知",
      "队列任务",
      "解析缓存",
      "服务概览",
      "实时房间",
      "运行指标",
    ]);
  });

  it("keeps an active menu background stable while the hover highlight moves", () => {
    expect(PLATFORM_SIDEBAR_MENU_BUTTON_CLASS).toContain(
      "data-[active=false]:hover:bg-transparent!",
    );
    expect(PLATFORM_SIDEBAR_MENU_BUTTON_CLASS).not.toMatch(/(?:^|\s)hover:bg-transparent!/);
  });
});
