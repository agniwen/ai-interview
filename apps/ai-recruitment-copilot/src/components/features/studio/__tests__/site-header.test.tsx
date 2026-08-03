import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "../site-header";

const { pathname } = vi.hoisted(() => ({
  pathname: { value: "/w/demo/studio/resumes" },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: pathname.value } }),
}));

vi.mock("@/components/layout/app-sidebar/sidebar-inset-header", () => ({
  SidebarInsetHeader: ({ breadcrumb }: { breadcrumb: ReactNode }) => <header>{breadcrumb}</header>,
}));

vi.mock("@/components/features/workspace/workspace-switcher", () => ({
  WorkspaceSwitcher: () => null,
}));

vi.mock("@/components/features/studio/upload-task-inbox", () => ({
  UploadTaskInbox: () => null,
}));

vi.mock("@/components/features/studio/studio-header-context", () => ({
  useStudioHeaderOverrideValue: () => null,
}));

vi.mock("@/components/features/studio/studio-sidebar-slots", () => ({
  resolveStudioSidebarNavItem: () => {},
}));

afterEach(() => {
  pathname.value = "/w/demo/studio/resumes";
});

describe("SiteHeader", () => {
  it.each([
    ["/w/demo/studio/calendar", "日程管理"],
    ["/w/demo/studio/dashboard", "数据看板"],
  ])("shows the matching title for %s", (routePath, expectedTitle) => {
    pathname.value = routePath;

    expect(renderToStaticMarkup(<SiteHeader />)).toContain(expectedTitle);
  });
});
