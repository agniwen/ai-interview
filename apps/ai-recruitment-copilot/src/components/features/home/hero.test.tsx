// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Hero } from "./hero";

class TestIntersectionObserver {
  private readonly active = true;
  disconnect(): void {
    void this.active;
  }
  observe(_target: Element): void {
    void this.active;
  }
  unobserve(_target: Element): void {
    void this.active;
  }
}

vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Hero", () => {
  it("uses the existing copy and controls for dark-mode contrast", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Hero onResumeFiltering={vi.fn()} onWorkbench={vi.fn()} />);
    });

    const heading = container.querySelector("h1");
    const brand = heading?.querySelector("span");
    const description = container.querySelector("p.font-serif");
    const buttons = container.querySelectorAll("button");

    expect(heading?.className).toContain("dark:text-white");
    expect(brand?.className).toContain("dark:text-violet-100");
    expect(description?.className).toContain("dark:text-white/80");
    expect(heading?.className).not.toContain("text-shadow");
    expect(description?.className).not.toContain("text-shadow");
    expect(buttons[0]?.className).toContain("dark:text-white");
    expect(buttons[1]?.className).toContain("dark:text-slate-950");

    act(() => root.unmount());
    container.remove();
  });
});
