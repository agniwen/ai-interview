// @vitest-environment jsdom

import { act, forwardRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";

const animationMocks = vi.hoisted(() => ({
  resize: null as ResizeObserverCallback | null,
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("motion/react", () => ({
  m: {
    div: forwardRef<
      HTMLDivElement,
      React.ComponentProps<"div"> & {
        animate?: { height?: number | "auto" };
        initial?: boolean;
        onAnimationComplete?: () => void;
        transition?: unknown;
      }
    >(function MotionDiv(
      {
        animate,
        children,
        initial: _initial,
        onAnimationComplete,
        transition: _transition,
        ...props
      },
      ref,
    ) {
      useEffect(() => {
        onAnimationComplete?.();
      }, [animate?.height, onAnimationComplete]);
      return (
        <div ref={ref} {...props}>
          {children}
        </div>
      );
    }),
  },
  useReducedMotion: () => false,
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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.stubGlobal("ResizeObserver", ResizeObserverMock);

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
        <AnimatedHeight>
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
        [{ contentRect: { height: 800 } } as ResizeObserverEntry],
        {} as ResizeObserver,
      );
      await Promise.resolve();
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
