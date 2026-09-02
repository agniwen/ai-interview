// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DatePicker } from "./date-picker";

// SAFETY: This React-owned test flag is optional and intentionally set only for the jsdom process.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("DatePicker", () => {
  it("renders a calendar popover trigger instead of a native date input", () => {
    const html = renderToStaticMarkup(
      <DatePicker onValueChange={vi.fn()} placeholder="全部日期" value="2026-08-11" />,
    );

    expect(html).toContain("2026年8月11日");
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).not.toContain('type="date"');
  });

  it("commits an empty value and closes when clearing", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onValueChange = vi.fn();

    act(() => {
      root.render(<DatePicker onValueChange={onValueChange} value="2026-08-11" />);
    });

    const trigger = container.querySelector<HTMLButtonElement>("button");
    expect(trigger).not.toBeNull();
    act(() => trigger?.click());

    const clearButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "清除",
    );
    expect(clearButton).not.toBeUndefined();
    act(() => clearButton?.click());

    expect(onValueChange).toHaveBeenCalledOnce();
    expect(onValueChange).toHaveBeenCalledWith("");
    expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
