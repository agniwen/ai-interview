// @vitest-environment jsdom

import { act } from "react";
import type { Root } from "react-dom/client";
import { Provider, createStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersistedSidebarProvider } from "@/components/layout/persisted-sidebar-provider";
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
  it("restores the collapsed state and persists the next toggle", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");
    const store = createStore();
    const { root } = await renderInAct(
      <Provider store={store}>
        <PersistedSidebarProvider>
          <Sidebar collapsible="icon">
            <SidebarRail aria-label="测试侧边栏开关" />
          </Sidebar>
        </PersistedSidebarProvider>
      </Provider>,
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
