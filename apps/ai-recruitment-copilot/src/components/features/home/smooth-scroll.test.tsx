// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HomeSmoothScrollDependencies } from "./smooth-scroll";
import { HomeSmoothScroll } from "./smooth-scroll";

// SAFETY: React's test-only act flag is intentionally attached to the global test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const killSmoother = vi.fn();

function createDependencies(matches: boolean) {
  let mediaCleanup: (() => void) | undefined;
  const queries: string[] = [];
  const createSmoother = vi.fn(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return { kill: killSmoother };
  });
  const refreshTriggers = vi.fn();
  const dependencies: HomeSmoothScrollDependencies = {
    createMatchMedia: () => ({
      add: (query, setup) => {
        queries.push(query);
        if (matches) {
          mediaCleanup = setup();
        }
      },
      revert: () => mediaCleanup?.(),
    }),
    createSmoother,
    refreshTriggers,
  };

  return { createSmoother, dependencies, queries, refreshTriggers };
}

function renderSmoothScroll(dependencies: HomeSmoothScrollDependencies) {
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
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <HomeSmoothScroll dependencies={dependencies}>
        <div>Homepage</div>
      </HomeSmoothScroll>,
    );
  });

  return { container, root };
}

afterEach(() => {
  document.documentElement.style.overflow = "";
  document.body.style.overflow = "";
  killSmoother.mockClear();
  vi.restoreAllMocks();
});

describe("HomeSmoothScroll", () => {
  it("enables ScrollSmoother only for desktop fine-pointer users", () => {
    const { createSmoother, dependencies, queries, refreshTriggers } = createDependencies(true);
    const { container, root } = renderSmoothScroll(dependencies);

    expect(queries).toEqual([
      "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    ]);
    expect(createSmoother).toHaveBeenCalledWith(
      expect.objectContaining({
        content: document.querySelector("#smooth-content"),
        smooth: 0.8,
        smoothTouch: 0,
        wrapper: document.querySelector("#smooth-wrapper"),
      }),
    );
    expect(refreshTriggers).toHaveBeenCalledOnce();

    act(() => root.unmount());
    expect(killSmoother).toHaveBeenCalledOnce();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
    container.remove();
  });

  it("keeps native scrolling when the desktop media query does not match", () => {
    const { createSmoother, dependencies, refreshTriggers } = createDependencies(false);
    const { container, root } = renderSmoothScroll(dependencies);

    expect(createSmoother).not.toHaveBeenCalled();
    expect(refreshTriggers).not.toHaveBeenCalled();

    act(() => root.unmount());
    expect(killSmoother).not.toHaveBeenCalled();
    container.remove();
  });
});
