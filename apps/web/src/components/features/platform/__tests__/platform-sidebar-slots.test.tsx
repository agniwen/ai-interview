import { describe, expect, it } from "vitest";
import { resolvePlatformSidebarNavItem } from "../platform-sidebar-navigation";

describe("PlatformSidebarSlots", () => {
  it("resolves active menu items from nested paths", () => {
    expect(resolvePlatformSidebarNavItem("/platform/users/member-1")?.title).toBe("所有用户");
  });
});
