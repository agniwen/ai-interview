// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebouncedSearchInput, DEFAULT_SEARCH_DEBOUNCE_MS } from "../debounced-search-input";

// SAFETY: The test fixture is constructed with the asserted shape before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function getInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector("input");
  if (!input) {
    throw new Error("Expected search input");
  }
  return input;
}

describe("DebouncedSearchInput", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
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

  it("keeps local draft while typing and commits after debounce", () => {
    const onValueChange = vi.fn();
    act(() => {
      root.render(<DebouncedSearchInput onValueChange={onValueChange} value="" />);
    });

    const input = getInput(container);
    act(() => {
      input.value = "张";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    // React 19 Input uses onChange; simulate like React testing with native setter + input event
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "张三");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS - 1);
    });
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith("张三");
  });

  it("does not commit while IME is composing", () => {
    const onValueChange = vi.fn();
    act(() => {
      root.render(<DebouncedSearchInput onValueChange={onValueChange} value="" />);
    });

    const input = getInput(container);

    act(() => {
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "ni");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS + 50);
    });
    expect(onValueChange).not.toHaveBeenCalled();

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "你");
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "你" }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() => {
      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS);
    });
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith("你");
  });

  it("flushes immediately on blur when not composing", () => {
    const onValueChange = vi.fn();
    act(() => {
      root.render(<DebouncedSearchInput onValueChange={onValueChange} value="" />);
    });

    const input = getInput(container);
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      nativeInputValueSetter?.call(input, "abc");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // React listens for focusout (bubbles) for onBlur, not the non-bubbling blur event.
    act(() => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith("abc");
  });

  it("syncs draft when external value changes (e.g. reset filters)", () => {
    const onValueChange = vi.fn();
    act(() => {
      root.render(<DebouncedSearchInput onValueChange={onValueChange} value="旧值" />);
    });
    expect(getInput(container).value).toBe("旧值");

    act(() => {
      root.render(<DebouncedSearchInput onValueChange={onValueChange} value="" />);
    });
    expect(getInput(container).value).toBe("");
    expect(onValueChange).not.toHaveBeenCalled();
  });
  it("uses the latest callback without restarting a pending debounce", () => {
    const original = vi.fn();
    const latest = vi.fn();
    act(() => root.render(<DebouncedSearchInput onValueChange={original} value="" />));
    const input = getInput(container);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "候选人",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => vi.advanceTimersByTime(200));
    act(() => root.render(<DebouncedSearchInput onValueChange={latest} value="" />));
    act(() => vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS - 200));
    expect(original).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledExactlyOnceWith("候选人");
  });

  it("cancels an uncommitted draft when an external value replaces it", () => {
    const onValueChange = vi.fn();
    act(() => root.render(<DebouncedSearchInput onValueChange={onValueChange} value="原筛选" />));
    const input = getInput(container);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "待提交",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => root.render(<DebouncedSearchInput onValueChange={onValueChange} value="" />));
    act(() => vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS));
    expect(input.value).toBe("");
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
