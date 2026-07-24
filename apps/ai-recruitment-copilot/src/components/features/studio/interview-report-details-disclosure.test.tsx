// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("InterviewReportDetailsDisclosure", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("reveals and hides the latest report details", () => {
    act(() => {
      root.render(
        <InterviewReportDetailsDisclosure>
          <div>最新报告详情</div>
        </InterviewReportDetailsDisclosure>,
      );
    });

    const expandButton = container.querySelector("button");
    expect(expandButton?.textContent).toContain("展示更多信息");
    expect(expandButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("最新报告详情");

    act(() => {
      expandButton?.click();
    });

    const collapseButton = container.querySelector("button");
    expect(collapseButton?.textContent).toContain("收起更多信息");
    expect(collapseButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("最新报告详情");

    act(() => {
      collapseButton?.click();
    });

    expect(container.textContent).not.toContain("最新报告详情");
  });
});
