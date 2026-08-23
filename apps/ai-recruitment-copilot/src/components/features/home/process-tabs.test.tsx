// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessTabs } from "./process-tabs";

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

function renderProcessTabs() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => root.render(<ProcessTabs />));
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

describe("ProcessTabs", () => {
  it("uses one light/dark illustration pair and focused UI instead of a window frame", () => {
    const container = renderProcessTabs();

    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(container.querySelector('[data-process-artwork="light"]')?.getAttribute("src")).toBe(
      "/landing/process-scenes/recruitment-workflow-v2-light.jpg",
    );
    expect(container.querySelector('[data-process-artwork="dark"]')?.getAttribute("src")).toBe(
      "/landing/process-scenes/recruitment-workflow-v2-dark.jpg",
    );
    expect(container.querySelector("[data-process-ui-block]")?.textContent).toContain("岗位标尺");
    expect(container.querySelectorAll("[data-process-progress]")).toHaveLength(1);
    expect(container.querySelector('[data-slot="screen-frame"]')).toBeNull();
    expect(container.querySelector("h2")?.className).toContain("text-balance");
    expect(container.querySelector("h3")?.className).toContain("text-balance");
    expect(container.querySelector("#process-demo-panel")?.className).toContain("lg:self-stretch");
    expect(container.querySelector("#process-demo-panel")?.className).not.toContain(
      "lg:aspect-[4/3]",
    );
    expect(container.querySelector('[data-process-step="role"]')?.className).toContain("lg:py-2.5");
  });

  it("automatically advances through every step and loops to the beginning", () => {
    vi.useFakeTimers();
    const container = renderProcessTabs();
    const tablist = container.querySelector<HTMLElement>('[role="tablist"]');
    const cycleDuration = Number(tablist?.dataset.cycleDuration);

    expect(cycleDuration).toBe(5000);
    for (const expectedStep of ["screening", "interview", "decision", "role"]) {
      act(() => vi.advanceTimersByTime(cycleDuration));
      expect(
        container.querySelector<HTMLElement>('[data-process-step][aria-selected="true"]')?.dataset
          .processStep,
      ).toBe(expectedStep);
    }
  });

  it("switches the focused UI block with the selected workflow step", () => {
    vi.useFakeTimers();
    const container = renderProcessTabs();
    const screeningTab = container.querySelector<HTMLButtonElement>(
      '[data-process-step="screening"]',
    );

    act(() => {
      screeningTab?.click();
      vi.advanceTimersByTime(400);
    });

    expect(screeningTab?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector("[data-process-ui-block]")?.textContent).toContain("待确认风险");
  });

  it("does not add decorative icons to the focused card headers", () => {
    vi.useFakeTimers();
    const container = renderProcessTabs();

    for (const step of ["role", "screening", "interview", "decision"]) {
      act(() =>
        container.querySelector<HTMLButtonElement>(`[data-process-step="${step}"]`)?.click(),
      );
      act(() => vi.advanceTimersByTime(400));
      expect(container.querySelector("[data-process-ui-block] svg")).toBeNull();
    }
  });

  it("keeps the final decision in the same surface instead of using an inverted block", () => {
    vi.useFakeTimers();
    const container = renderProcessTabs();

    act(() =>
      container.querySelector<HTMLButtonElement>('[data-process-step="decision"]')?.click(),
    );
    act(() => vi.advanceTimersByTime(700));

    const summary = container.querySelector<HTMLElement>("[data-process-decision-summary]");
    expect(summary).not.toBeNull();
    expect(summary?.className).not.toContain("bg-foreground");
    expect(summary?.textContent).toContain("进入下一轮复面");
  });

  it("restarts the full countdown after a manual switch", () => {
    vi.useFakeTimers();
    const container = renderProcessTabs();
    const screeningTab = container.querySelector<HTMLButtonElement>(
      '[data-process-step="screening"]',
    );

    act(() => vi.advanceTimersByTime(4900));
    act(() => screeningTab?.click());
    act(() => vi.advanceTimersByTime(4900));

    expect(screeningTab?.getAttribute("aria-selected")).toBe("true");

    act(() => vi.advanceTimersByTime(100));
    expect(
      container.querySelector<HTMLElement>('[data-process-step][aria-selected="true"]')?.dataset
        .processStep,
    ).toBe("interview");
  });
});
