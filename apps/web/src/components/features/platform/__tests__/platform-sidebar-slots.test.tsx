import { describe, expect, it } from "vitest";
import {
  resolvePlatformPageMeta,
  resolvePlatformSidebarNavItem,
} from "../platform-sidebar-navigation";

describe("PlatformSidebarSlots", () => {
  it("resolves active menu items from nested paths", () => {
    expect(resolvePlatformSidebarNavItem("/platform/users/member-1")?.title).toBe("用户管理");
  });

  it("derives the breadcrumb and page heading from the same nav item", () => {
    expect(resolvePlatformPageMeta("/platform/organizations")).toMatchObject({
      breadcrumbTitle: "工作区管理",
      pageTitle: "工作区管理",
    });
    expect(resolvePlatformPageMeta("/platform/livekit/rooms")).toMatchObject({
      breadcrumbTitle: "LiveKit · 实时房间",
      pageTitle: "实时房间",
    });
  });

  it("falls back to the platform breadcrumb without a page heading for unknown paths", () => {
    expect(resolvePlatformPageMeta("/platform/unknown")).toEqual({
      breadcrumbTitle: "平台管理",
      pageTitle: null,
    });
  });
});
