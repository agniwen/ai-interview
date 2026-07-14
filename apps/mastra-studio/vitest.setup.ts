import React from "react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { server } from "./src/test/msw-server";

vi.mock("@mastra/playground-ui/components/ScrollArea", () => {
  const ScrollArea = React.forwardRef<
    HTMLDivElement,
    {
      autoScroll?: boolean;
      children?: React.ReactNode;
      className?: string;
      mask?: unknown;
      maxHeight?: string | number;
      orientation?: "vertical" | "horizontal" | "both";
      scrollButtons?: unknown;
      showMask?: unknown;
      viewPortClassName?: string;
      viewportRef?: React.Ref<HTMLDivElement>;
    }
  >(
    (
      {
        autoScroll: _autoScroll,
        children,
        className,
        mask: _mask,
        maxHeight: _maxHeight,
        orientation: _orientation,
        scrollButtons: _scrollButtons,
        showMask: _showMask,
        viewPortClassName,
        viewportRef,
        ...props
      },
      ref,
    ) =>
      React.createElement(
        "div",
        { ...props, className, "data-testid": "scroll-area", ref },
        React.createElement("div", { className: viewPortClassName, ref: viewportRef }, children),
      ),
  );
  ScrollArea.displayName = "ScrollArea";
  return { ScrollArea };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof globalThis.window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }),
    writable: true,
  });
}

if (typeof globalThis.Element !== "undefined" && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => undefined;
}

if (typeof globalThis.Element !== "undefined" && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => [];
}

if (typeof globalThis.IntersectionObserver === "undefined") {
  class IntersectionObserverStub {
    root = null;
    rootMargin = "";
    thresholds = [];
    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  }
  globalThis.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (typeof globalThis.Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => {
    const rects = [] as unknown as DOMRectList;
    (rects as unknown as { item: (index: number) => DOMRect | null }).item = () => null;
    return rects;
  };
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    disconnect() {}
    observe() {}
    unobserve() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
