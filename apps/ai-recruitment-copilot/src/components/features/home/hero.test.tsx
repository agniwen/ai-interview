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
  it("uses the evidence-led homepage copy and dark-mode contrast controls", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Hero onResumeFiltering={vi.fn()} onWorkbench={vi.fn()} />);
    });

    const heading = container.querySelector("h1");
    const brand = heading?.querySelector("span");
    const eyebrow = [...container.querySelectorAll("span")].find(
      (element) => element.textContent === "招聘 AI 协同工作台",
    );
    const description = container.querySelector("p.font-serif");
    const buttons = container.querySelectorAll("button");

    expect(heading?.className).toContain("dark:text-white");
    expect(brand?.className).toContain("dark:text-chart-4");
    expect(eyebrow?.className).toContain("dark:bg-primary/25!");
    expect(eyebrow?.className).toContain("dark:text-chart-4!");
    expect(description?.className).toContain("dark:text-white/80");
    expect(heading?.textContent).toContain("更快看清，谁更合适。");
    expect(description?.textContent).toContain("AI 帮你筛简历、问重点、整理证据");
    expect(description?.textContent).toContain("再交给团队判断");
    expect(buttons[0]?.textContent).toContain("开始筛选简历");
    expect(heading?.className).not.toContain("text-shadow");
    expect(description?.className).not.toContain("text-shadow");
    expect(buttons[0]?.className).toContain("dark:text-white");
    expect(buttons[1]?.className).toContain("dark:text-slate-950");

    act(() => root.unmount());
    container.remove();
  });
});
