// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDatePickerValue } from "@/lib/client/date-picker-value";
import { DatePicker, DateTimePicker } from "../date-time-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function getButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

describe("date and time pickers", () => {
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

  it("renders a local date in Chinese without a native date input", () => {
    act(() => {
      root.render(<DatePicker onValueChange={vi.fn()} value="2026-07-24" />);
    });

    const trigger = container.querySelector("button");
    expect(trigger?.textContent).toContain("2026年7月24日");
    expect(trigger?.getAttribute("type")).toBe("button");
    expect(container.querySelector('input[type="date"]')).toBeNull();
  });

  it("renders local hours and minutes without a native datetime input", () => {
    act(() => {
      root.render(<DateTimePicker onValueChange={vi.fn()} value="2026-07-24T09:05" />);
    });

    expect(container.textContent).toContain("2026年7月24日 09:05");
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
  });

  it("opens the calendar when the trigger is clicked", async () => {
    act(() => {
      root.render(<DateTimePicker onValueChange={vi.fn()} value="" />);
    });

    const trigger = container.querySelector("button");
    expect(trigger).not.toBeNull();

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(document.querySelector('[data-slot="calendar"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="popover-content"]')?.className).toContain(
      "bg-background",
    );
  });

  it("applies a date only after confirmation", async () => {
    const onValueChange = vi.fn();
    const today = new Date();

    act(() => {
      root.render(<DatePicker onValueChange={onValueChange} value="" />);
    });

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const todayButton = document.querySelector<HTMLButtonElement>(
      `button[data-day="${today.toLocaleDateString()}"]`,
    );
    expect(todayButton).not.toBeNull();

    act(() => {
      todayButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      getButton("确定")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith(formatDatePickerValue(today));
  });

  it("defaults newly selected dates to midnight and applies them after confirmation", async () => {
    const onValueChange = vi.fn();
    const today = new Date();

    act(() => {
      root.render(<DateTimePicker onValueChange={onValueChange} value="" />);
    });

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    const todayButton = document.querySelector<HTMLButtonElement>(
      `button[data-day="${today.toLocaleDateString()}"]`,
    );
    expect(todayButton).not.toBeNull();

    act(() => {
      todayButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      getButton("确定")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith(`${formatDatePickerValue(today)}T00:00`);
  });

  it("discards date-time edits when cancelled", async () => {
    const onValueChange = vi.fn();

    act(() => {
      root.render(<DateTimePicker onValueChange={onValueChange} value="2026-07-24T09:05" />);
    });

    await act(async () => {
      container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    act(() => {
      getButton("清除")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      getButton("取消")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onValueChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain("2026年7月24日 09:05");
  });

  it("forwards disabled and invalid states to the trigger", () => {
    act(() => {
      root.render(
        <DateTimePicker aria-invalid disabled onValueChange={vi.fn()} value="2026-07-24T09:05" />,
      );
    });

    const trigger = container.querySelector("button");
    expect(trigger?.disabled).toBe(true);
    expect(trigger?.getAttribute("aria-invalid")).toBe("true");
  });
});
