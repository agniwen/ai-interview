// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkeletonReveal } from "./skeleton-reveal";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SkeletonReveal", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("keeps both layers mounted while revealing content", () => {
    act(() => {
      root.render(
        <SkeletonReveal loading skeleton={<div data-testid="skeleton">Loading</div>}>
          <button type="button">Ready</button>
        </SkeletonReveal>,
      );
    });

    const reveal = container.querySelector<HTMLElement>('[data-slot="skeleton-reveal"]');
    const content = container.querySelector<HTMLElement>(".t-skel-content");
    expect(reveal?.dataset.state).toBe("loading");

    expect(container.textContent).toContain("Loading");
    expect(container.textContent).toContain("Ready");
    expect(content?.hasAttribute("inert")).toBe(true);

    act(() => {
      root.render(
        <SkeletonReveal loading={false} skeleton={<div data-testid="skeleton">Loading</div>}>
          <button type="button">Ready</button>
        </SkeletonReveal>,
      );
    });

    expect(reveal?.dataset.state).toBe("revealed");

    expect(content?.hasAttribute("inert")).toBe(false);
  });
});
