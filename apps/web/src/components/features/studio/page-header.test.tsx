// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";

// SAFETY: Vitest's jsdom global supports React's documented act environment flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PageHeader", () => {
  it("moves the description into an accessible information tooltip trigger", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PageHeader description="查看当前招聘日程。" title="日程管理" />);
      await Promise.resolve();
    });

    expect(container.querySelector("h1")?.textContent).toBe("日程管理");
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector('button[aria-label="查看页面说明"]')).toBeTruthy();

    act(() => root.unmount());
  });

  it("does not render an information trigger without a description", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<PageHeader title="招聘台" />);
      await Promise.resolve();
    });

    expect(container.querySelector('button[aria-label="查看页面说明"]')).toBeNull();

    act(() => root.unmount());
  });
});
