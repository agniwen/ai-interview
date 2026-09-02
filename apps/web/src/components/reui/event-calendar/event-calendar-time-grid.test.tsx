// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { installNoopResizeObserver } from "@/test-utils/react-act";
import { EventCalendarContent } from "./event-calendar-content";
import { EventCalendar } from "./event-calendar";

const scrollTo = vi.fn();
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollTo");
const overlayMockState = vi.hoisted(() => ({ initialized: false }));

vi.mock("overlayscrollbars-react", async () => {
  const { createElement, useEffect, useRef, useState } = await import("react");
  function OverlayScrollbarsComponent({
    children,
    className,
    ...props
  }: {
    children?: ReactNode;
    className?: string;
    [key: string]: unknown;
  }) {
    const [initialized, setInitialized] = useState(false);
    const viewportRef = useRef<HTMLDivElement>(null);
    useEffect(() => setInitialized(true), []);
    useEffect(() => {
      const events = props.events as
        | { initialized?: (instance: { elements: () => { viewport: HTMLElement } }) => void }
        | undefined;
      const viewport = viewportRef.current;
      if (initialized && viewport && !overlayMockState.initialized) {
        overlayMockState.initialized = true;
        events?.initialized?.({ elements: () => ({ viewport }) });
      }
    }, [initialized, props.events]);
    return createElement(
      "div",
      { className, "data-slot": props["data-slot"] },
      initialized
        ? createElement(
            "div",
            { "data-overlayscrollbars-viewport": "", ref: viewportRef },
            children,
          )
        : children,
    );
  }
  return {
    OverlayScrollbarsComponent,
  };
});

// SAFETY: React 19 reads this documented test-environment flag from the global object.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installNoopResizeObserver();

afterEach(() => {
  document.body.innerHTML = "";
  overlayMockState.initialized = false;
  scrollTo.mockReset();
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", originalScrollTo);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  }
  vi.restoreAllMocks();
});

describe("EventCalendar time grid", () => {
  it("restores the configured start hour after initial loading completes", async () => {
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: scrollTo,
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    const renderCalendar = (loading: boolean) =>
      root.render(
        <EventCalendar
          defaultDate={new Date("2026-09-01T00:00:00.000Z")}
          defaultView="week"
          events={[]}
          loading={loading}
          scrollToHour={8}
        >
          <EventCalendarContent />
        </EventCalendar>,
      );

    await act(async () => {
      renderCalendar(true);
    });
    scrollTo.mockClear();
    animationFrames.length = 0;

    await act(async () => {
      renderCalendar(false);
    });

    expect(scrollTo).not.toHaveBeenCalled();
    act(() => animationFrames.shift()?.(0));
    expect(scrollTo).toHaveBeenCalledWith({ top: 500 });

    act(() => root.unmount());
  });
});
