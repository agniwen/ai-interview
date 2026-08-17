// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeSmoothScroll } from "./smooth-scroll";

// SAFETY: This test constructs the value with the asserted contract before this boundary.
const animationCalls: string[] = [];
const killSmoother = vi.fn();

afterEach(() => {
  animationCalls.length = 0;
  killSmoother.mockClear();
  vi.restoreAllMocks();
});

describe("HomeSmoothScroll", () => {
  it("resets a restored homepage position before creating ScrollSmoother", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {
      animationCalls.push("reset-scroll");
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        addEventListener: () => {},
        addListener: () => {},
        dispatchEvent: () => false,
        matches: false,
        media: "",
        onchange: null,
        removeEventListener: () => {},
        removeListener: () => {},
      }),
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const dependencies = {
      createSmoother: () => {
        animationCalls.push("create-smoother");
        return { kill: killSmoother };
      },
      getWindow: () => window,
      refreshTriggers: () => {
        animationCalls.push("refresh-triggers");
      },
    };

    act(() => {
      root.render(
        <HomeSmoothScroll dependencies={dependencies}>
          <div>Homepage</div>
        </HomeSmoothScroll>,
      );
    });

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    expect(animationCalls.slice(0, 2)).toEqual(["reset-scroll", "create-smoother"]);

    act(() => root.unmount());
    expect(killSmoother).toHaveBeenCalledOnce();
    container.remove();
  });
});
