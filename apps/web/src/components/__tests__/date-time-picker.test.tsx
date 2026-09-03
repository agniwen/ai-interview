// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDatePickerValue } from "@/lib/client/date-picker-value";
import { DatePicker, DateTimePicker } from "../date-time-picker";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function getButton(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

async function clickButton(button: HTMLButtonElement | undefined | null) {
  expect(button).toBeTruthy();
  await act(async () => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

function getWheel(label: string) {
  const wheel = document.querySelector<HTMLElement>(`[role="spinbutton"][aria-label="${label}"]`);
  expect(wheel).not.toBeNull();
  return wheel;
}

async function pressWheel(label: string, key: string) {
  await act(async () => {
    getWheel(label)?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await vi.advanceTimersByTimeAsync(600);
  });
}

describe("date and time pickers", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["Date", "performance", "requestAnimationFrame", "cancelAnimationFrame"],
    });
    vi.setSystemTime(new Date(2026, 7, 26, 14, 37));
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
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
    const columnLabels = [...document.querySelectorAll('[data-slot="popover-content"] span')].map(
      (element) => element.textContent,
    );
    expect(columnLabels).toContain("时");
    expect(columnLabels).toContain("分");
    expect(columnLabels).not.toContain("小时");
    expect(columnLabels).not.toContain("分钟");
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

  it("defaults to the current local date and time on opening, without committing", async () => {
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

    expect(todayButton?.dataset.selectedSingle).toBe("true");
    expect(getWheel("小时")?.getAttribute("aria-valuetext")).toBe("14");
    expect(getWheel("分钟")?.getAttribute("aria-valuetext")).toBe("37");
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      getButton("确定")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onValueChange).toHaveBeenCalledWith(`${formatDatePickerValue(today)}T14:37`);
  });

  it("reads a fresh current time on every empty opening", async () => {
    const onValueChange = vi.fn();
    act(() => root.render(<DateTimePicker onValueChange={onValueChange} value="" />));
    await clickButton(container.querySelector("button"));
    await clickButton(getButton("取消"));
    vi.setSystemTime(new Date(2026, 7, 27, 0, 2));
    await clickButton(container.querySelector("button"));
    expect(getWheel("小时")?.getAttribute("aria-valuetext")).toBe("00");
    expect(getWheel("分钟")?.getAttribute("aria-valuetext")).toBe("02");
    await clickButton(getButton("确定"));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("2026-08-27T00:02");
  });

  it("keeps an existing date and time, including minutes outside the configured step", async () => {
    const onValueChange = vi.fn();
    act(() =>
      root.render(
        <DateTimePicker minuteStep={15} onValueChange={onValueChange} value="2026-07-24T09:07" />,
      ),
    );
    await clickButton(container.querySelector("button"));
    expect(document.querySelector('[data-slot="calendar"]')?.textContent).toContain("2026年7月");
    expect(getWheel("小时")?.getAttribute("aria-valuetext")).toBe("09");
    expect(getWheel("分钟")?.getAttribute("aria-valuetext")).toBe("07");
    await pressWheel("分钟", "ArrowDown");
    expect(getWheel("分钟")?.getAttribute("aria-valuetext")).toBe("15");
    await clickButton(getButton("确定"));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("2026-07-24T09:15");
  });

  it("edits both wheels with the keyboard and preserves the time when changing dates", async () => {
    const onValueChange = vi.fn();
    act(() =>
      root.render(<DateTimePicker onValueChange={onValueChange} value="2026-07-24T23:59" />),
    );
    await clickButton(container.querySelector("button"));
    await pressWheel("小时", "ArrowDown");
    await pressWheel("分钟", "ArrowDown");
    expect(getWheel("小时")?.getAttribute("aria-valuetext")).toBe("00");
    expect(getWheel("分钟")?.getAttribute("aria-valuetext")).toBe("00");
    const nextDay = new Date(2026, 6, 25);
    await clickButton(document.querySelector(`button[data-day="${nextDay.toLocaleDateString()}"]`));
    expect(onValueChange).not.toHaveBeenCalled();
    await clickButton(getButton("确定"));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("2026-07-25T00:00");
  });

  it("only clears after confirmation and disables the wheels while cleared", async () => {
    const onValueChange = vi.fn();
    act(() =>
      root.render(<DateTimePicker onValueChange={onValueChange} value="2026-07-24T09:05" />),
    );
    await clickButton(container.querySelector("button"));
    await clickButton(getButton("清除"));
    expect(getWheel("小时")?.closest("[inert]")).not.toBeNull();
    expect(onValueChange).not.toHaveBeenCalled();
    await clickButton(getButton("确定"));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("");
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
