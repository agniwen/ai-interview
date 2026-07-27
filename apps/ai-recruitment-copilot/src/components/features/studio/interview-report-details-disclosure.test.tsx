// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANIMATED_HEIGHT_COMPLETE_EVENT } from "@/components/features/motion/animated-height";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InterviewReportDetailsDisclosure", () => {
  let container: HTMLDivElement;
  let originalScrollIntoView: PropertyDescriptor | undefined;
  let root: ReturnType<typeof createRoot>;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    originalScrollIntoView = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("reveals and hides the latest report details", () => {
    act(() => {
      root.render(
        <div data-slot="animated-height">
          <InterviewReportDetailsDisclosure>
            <div>最新报告详情</div>
          </InterviewReportDetailsDisclosure>
        </div>,
      );
    });

    const expandButton = container.querySelector("button");
    expect(expandButton?.textContent).toContain("展示详细分析结果");
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("最新报告详情");

    act(() => {
      expandButton?.click();
    });

    const collapseButton = container.querySelector("button");
    expect(collapseButton?.textContent).toContain("收起更多信息");
    expect(collapseButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("最新报告详情");
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector('[data-slot="animated-height"]')
        ?.dispatchEvent(new Event(ANIMATED_HEIGHT_COMPLETE_EVENT));
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });

    act(() => {
      collapseButton?.click();
    });

    expect(container.textContent).not.toContain("最新报告详情");
  });

  it("scrolls immediately when height animation is disabled", () => {
    act(() => {
      root.render(
        <InterviewReportDetailsDisclosure>
          <div>最新报告详情</div>
        </InterviewReportDetailsDisclosure>,
      );
    });

    act(() => {
      container.querySelector("button")?.click();
    });

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "nearest",
    });
  });
});
