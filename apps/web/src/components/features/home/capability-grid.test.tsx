// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "@/paraglide/runtime";
import {
  CapabilityGrid,
  FOLLOWUP_LINE_INTERVAL_MS,
  FOLLOWUP_LOOP_PAUSE_MS,
} from "./capability-grid";
import { getHomeDemoCopy } from "./home-demo-copy";

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

// FadeContent 依赖 jsdom 没有的视口观察；这里让所有元素立即可见，入场动画与被测行为无关。
// FadeContent needs IntersectionObserver, which jsdom lacks; report every target as visible.
class AlwaysVisibleIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [0];
  private readonly callback: IntersectionObserverCallback;

  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- IntersectionObserver requires a synchronous callback constructor.
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  disconnect = vi.fn();

  observe = (target: Element) => {
    const bounds = new DOMRectReadOnly();
    this.callback(
      [
        {
          boundingClientRect: bounds,
          intersectionRatio: 1,
          intersectionRect: bounds,
          isIntersecting: true,
          rootBounds: null,
          target,
          time: 0,
        },
      ],
      this,
    );
  };

  takeRecords = () => {
    void this.callback;
    return [];
  };
  unobserve = vi.fn();
}

const mountedRoots: { container: HTMLDivElement; root: ReturnType<typeof createRoot> }[] = [];

beforeEach(() => {
  setLocale("zh-CN", { reload: false });
  vi.stubGlobal("IntersectionObserver", AlwaysVisibleIntersectionObserver);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  for (const { container, root } of mountedRoots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function renderGrid() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CapabilityGrid onResumeFiltering={() => {}} />));
  mountedRoots.push({ container, root });
  return container;
}

const countLines = (container: HTMLElement) =>
  container.querySelectorAll("[data-followup-line]").length;

describe("CapabilityGrid", () => {
  it("switches the role context shown in the showcase", () => {
    vi.useFakeTimers();
    const container = renderGrid();
    const [, second] = getHomeDemoCopy().capability.positions;

    act(() => container.querySelector<HTMLButtonElement>('[data-context-position="1"]')?.click());
    // 等待旧内容的退出动画结束。 Let the outgoing content finish its exit animation.
    act(() => vi.advanceTimersByTime(1000));

    expect(
      container.querySelector('[data-context-position="1"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(container.querySelector("[data-context-question]")?.textContent).toBe(second.question);
  });

  it("autoplays the follow-up sample line by line and loops back to the start", () => {
    vi.useFakeTimers();
    const container = renderGrid();
    const total = getHomeDemoCopy().capability.followup.length;

    expect(countLines(container)).toBe(1);

    act(() => vi.advanceTimersByTime(FOLLOWUP_LINE_INTERVAL_MS));
    expect(countLines(container)).toBe(2);

    for (let step = 2; step < total; step += 1) {
      act(() => vi.advanceTimersByTime(FOLLOWUP_LINE_INTERVAL_MS));
    }
    expect(countLines(container)).toBe(total);

    act(() => vi.advanceTimersByTime(FOLLOWUP_LOOP_PAUSE_MS));
    expect(countLines(container)).toBe(1);
  });
});
