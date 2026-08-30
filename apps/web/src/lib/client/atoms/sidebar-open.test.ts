// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

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
  window.localStorage.clear();
  vi.resetModules();
});

describe("sidebarOpenAtom", () => {
  it("restores storage after mount so the hydration snapshot stays stable", async () => {
    window.localStorage.setItem(STORAGE_KEY, "false");

    const [{ createStore }, { sidebarOpenAtom }] = await Promise.all([
      import("jotai"),
      import("./sidebar-open"),
    ]);
    const store = createStore();

    expect(store.get(sidebarOpenAtom)).toBe(true);

    const unsubscribe = store.sub(sidebarOpenAtom, () => {});
    expect(store.get(sidebarOpenAtom)).toBe(false);

    store.set(sidebarOpenAtom, true);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("true");
    unsubscribe();
  });
});
