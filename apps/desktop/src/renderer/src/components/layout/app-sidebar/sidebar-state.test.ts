import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("desktopSidebarOpenAtom", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("reads the persisted sidebar state on initialization", async () => {
    const values = new Map([["arc:desktop-sidebar-open:v1", "false"]]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const { desktopSidebarOpenAtom } = await import("./sidebar-state");

    expect(createStore().get(desktopSidebarOpenAtom)).toBe(false);
  });
});
