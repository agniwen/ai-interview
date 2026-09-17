// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersistedSidebarProvider } from "@/components/layout/persisted-sidebar-provider";
import {
  SidebarPersistenceProvider,
  useSidebarPersistence,
} from "@/components/layout/sidebar-persistence-context";
import { Sidebar, SidebarRail } from "@/components/ui/sidebar";
import { enableReactActEnvironment, renderInAct, unmountInAct } from "@/test-utils/react-act";

enableReactActEnvironment();
const roots: Root[] = [];
const STORAGE_KEY = "arc:sidebar-open";
const storedValues = new Map<string, string>();
const storage = {
  clear: () => storedValues.clear(),
  getItem: (key: string) => storedValues.get(key) ?? null,
  removeItem: (key: string) => storedValues.delete(key),
  setItem: (key: string, value: string) => storedValues.set(key, value),
};

function MenuStateProbe() {
  const { menuOpen } = useSidebarPersistence();
  return <output data-menu-open={String(menuOpen["/studio/resumes"])} />;
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }),
  });
  window.localStorage.clear();
});

afterEach(async () => {
  for (const root of roots) {
    await unmountInAct(root);
  }
  roots.length = 0;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("AppSidebarShell persisted state", () => {
  it("uses the server-provided state on the first render", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    window.localStorage.setItem(
      "arc:sidebar-menu-open",
      JSON.stringify({ "/studio/resumes": false }),
    );

    const { root } = await renderInAct(
      <SidebarPersistenceProvider value={{ menuOpen: { "/studio/resumes": false }, open: false }}>
        <PersistedSidebarProvider>
          <Sidebar collapsible="icon">
            <MenuStateProbe />
          </Sidebar>
        </PersistedSidebarProvider>
      </SidebarPersistenceProvider>,
    );
    roots.push(root);

    expect(document.querySelector<HTMLElement>('[data-slot="sidebar"]')?.dataset.state).toBe(
      "collapsed",
    );
    expect(document.querySelector("output")?.dataset.menuOpen).toBe("false");
  });

  it("persists the next toggle from the server-provided state", async () => {
    const { root } = await renderInAct(
      <SidebarPersistenceProvider value={{ menuOpen: {}, open: false }}>
        <PersistedSidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarRail aria-label="测试侧边栏开关" />
          </Sidebar>
        </PersistedSidebarProvider>
      </SidebarPersistenceProvider>,
    );
    roots.push(root);

    expect(document.querySelector<HTMLElement>('[data-slot="sidebar"]')?.dataset.state).toBe(
      "collapsed",
    );

    const toggle = document.querySelector<HTMLButtonElement>('[aria-label="测试侧边栏开关"]');
    act(() => toggle?.click());

    expect(document.querySelector<HTMLElement>('[data-slot="sidebar"]')?.dataset.state).toBe(
      "expanded",
    );
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
  });
});
