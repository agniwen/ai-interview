// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalDateTimeText } from "../local-date-time-text";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LocalDateTimeText", () => {
  it("renders a stable fallback during server rendering", () => {
    expect(
      renderToString(
        <LocalDateTimeText
          fallback="待客户端格式化"
          format="long-zh"
          value="2026-06-02T09:30:00.000Z"
        />,
      ),
    ).toContain("待客户端格式化");
  });

  it("formats the timestamp after hydration", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => {
      root.render(<LocalDateTimeText format="compact-zh" value="2026-06-02T09:30:00.000Z" />);
    });

    expect(container.textContent).toMatch(/\d{2}\/\d{2}.*\d{2}:\d{2}/u);
    await act(() => root.unmount());
  });

  it("keeps the fallback for invalid timestamps", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(() => {
      root.render(<LocalDateTimeText fallback="无时间" value="invalid" />);
    });

    expect(container.textContent).toBe("无时间");
    await act(() => root.unmount());
  });
});
