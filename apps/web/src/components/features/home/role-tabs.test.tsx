// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/paraglide/runtime";
import { RoleTabs } from "./role-tabs";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    addEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {},
    removeListener: () => {},
  }),
});

const mountedRoots: { container: HTMLDivElement; root: ReturnType<typeof createRoot> }[] = [];

beforeEach(() => {
  setLocale("zh-CN", { reload: false });
});

function renderRoleTabs() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => root.render(<RoleTabs />));
  mountedRoots.push({ container, root });

  return container;
}

afterEach(() => {
  vi.useRealTimers();
  for (const { container, root } of mountedRoots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

describe("RoleTabs", () => {
  it("automatically advances through every step and loops to the beginning", () => {
    vi.useFakeTimers();
    const container = renderRoleTabs();
    const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
    const cycleDuration = Number(tablist?.dataset.cycleDuration);

    expect(cycleDuration).toBe(5000);
    for (const expectedStep of ["manager", "candidate", "hr"]) {
      act(() => vi.advanceTimersByTime(cycleDuration));
      expect(
        container.querySelector<HTMLElement>('[data-role-step][aria-selected="true"]')?.dataset
          .roleStep,
      ).toBe(expectedStep);
    }
  });

  it("restarts the full countdown after a manual switch", () => {
    vi.useFakeTimers();
    const container = renderRoleTabs();
    const managerTab = container.querySelector<HTMLButtonElement>('[data-role-step="manager"]');

    act(() => vi.advanceTimersByTime(4900));
    act(() => managerTab?.click());
    act(() => vi.advanceTimersByTime(4900));

    expect(managerTab?.getAttribute("aria-selected")).toBe("true");

    act(() => vi.advanceTimersByTime(100));
    expect(
      container.querySelector<HTMLElement>('[data-role-step][aria-selected="true"]')?.dataset
        .roleStep,
    ).toBe("candidate");
  });
});
