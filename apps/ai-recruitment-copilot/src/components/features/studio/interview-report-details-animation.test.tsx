// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import type { AnimatedHeightRenderProps } from "@/components/features/motion/animated-height";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";

const animationMocks = vi.hoisted(() => ({
  // SAFETY: This test constructs the value with the asserted contract before this boundary.
  resize: null as ResizeObserverCallback | null,
}));

// oxlint-disable-next-line promise/prefer-await-to-callbacks -- ResizeObserver is callback-based.
function ResizeObserverMock(onResize: ResizeObserverCallback) {
  animationMocks.resize = onResize;
  return {
    disconnect: vi.fn(),
    observe: vi.fn(),
    unobserve: vi.fn(),
  };
}

// SAFETY: This test constructs the value with the asserted contract before this boundary.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  })),
});
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

function TestAnimationContainer({
  children,
  height,
  innerRef,
  onAnimationComplete,
  ...props
}: AnimatedHeightRenderProps) {
  useEffect(() => {
    if (height === 800) {
      onAnimationComplete();
    }
  }, [height, onAnimationComplete]);
  return (
    <div data-slot="animated-height" ref={innerRef} {...props}>
      {children}
    </div>
  );
}

describe("InterviewReportDetailsDisclosure with AnimatedHeight", () => {
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
    animationMocks.resize = null;
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("scrolls only after the real height animation completes", async () => {
    await act(async () => {
      root.render(
        <AnimatedHeight renderContainer={(props) => <TestAnimationContainer {...props} />}>
          <InterviewReportDetailsDisclosure>
            <div>最新报告详情</div>
          </InterviewReportDetailsDisclosure>
        </AnimatedHeight>,
      );
      await Promise.resolve();
    });

    act(() => {
      container.querySelector("button")?.click();
    });
    expect(scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      animationMocks.resize?.(
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        [{ contentRect: { height: 800 } } as ResizeObserverEntry],
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        {} as ResizeObserver,
      );
      await Promise.resolve();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
