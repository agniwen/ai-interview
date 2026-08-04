// @vitest-environment jsdom

import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomeSmoothScroll } from "./smooth-scroll";

const animationCalls = vi.hoisted(() => [] as string[]);
const killSmoother = vi.hoisted(() => vi.fn());

vi.mock("@gsap/react", () => ({ useGSAP: useLayoutEffect }));

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin: () => {},
  },
}));

vi.mock("gsap/ScrollSmoother", () => ({
  ScrollSmoother: {
    create: () => {
      animationCalls.push("create-smoother");
      return { kill: killSmoother };
    },
  },
}));

vi.mock("gsap/ScrollTrigger", () => ({
  ScrollTrigger: {
    refresh: () => {
      animationCalls.push("refresh-triggers");
    },
  },
}));

afterEach(() => {
  animationCalls.length = 0;
  killSmoother.mockClear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("HomeSmoothScroll", () => {
  it("resets a restored homepage position before creating ScrollSmoother", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {
      animationCalls.push("reset-scroll");
    });
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <HomeSmoothScroll>
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
