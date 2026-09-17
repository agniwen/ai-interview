// @vitest-environment jsdom

import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AudioScrubber } from "./waveform";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("commits playback progress immediately and isolates drag previews until release", () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const seek = vi.fn();
  const committed: string[] = [];
  function Harness({ time, duration = 100 }: { time: number; duration?: number }) {
    useLayoutEffect(() => {
      committed.push(
        container.querySelector<HTMLElement>("[style*='clip-path']")?.style.clipPath ?? "",
      );
    });
    return <AudioScrubber currentTime={time} duration={duration} onSeek={seek} />;
  }
  try {
    act(() => root.render(<Harness time={20} />));
    expect(committed.at(-1)).toBe("inset(0 80% 0 0)");
    act(() => root.render(<Harness time={40} />));
    expect(committed.at(-1)).toBe("inset(0 60% 0 0)");
    const slider = container.querySelector<HTMLElement>("[role=slider]");
    if (!slider) throw new Error("Missing audio scrubber");
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 40));
    act(() => slider.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 75 })));
    expect(seek).toHaveBeenLastCalledWith(75);
    act(() => root.render(<Harness time={50} />));
    expect(committed.at(-1)).toBe("inset(0 25% 0 0)");
    act(() => document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })));
    expect(container.querySelector<HTMLElement>("[style*='clip-path']")?.style.clipPath).toBe(
      "inset(0 50% 0 0)",
    );
    act(() => root.render(<Harness time={0} duration={0} />));
    expect(committed.at(-1)).toBe("inset(0 100% 0 0)");
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
