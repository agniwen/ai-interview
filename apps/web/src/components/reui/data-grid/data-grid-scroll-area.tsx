"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { useDataGrid } from "@/components/reui/data-grid/data-grid";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@app/shared/utils";

const MIN_THUMB_SIZE = 24;
const FALLBACK_SCROLLBAR_SIZE = 12;

const INITIAL_METRICS = {
  hasVerticalOverflow: false,
  headerHeight: 0,
  horizontalScrollbarSize: 0,
  thumbHeight: 0,
  thumbTop: 0,
  trackHeight: 0,
} as const;

const INITIAL_HORIZONTAL_METRICS = {
  hasHorizontalOverflow: false,
  insetEnd: 0,
  insetStart: 0,
  thumbLeft: 0,
  thumbWidth: 0,
  trackWidth: 0,
} as const;

// Keep both axes two pixels wider than the registry default: horizontal is
// 10px tall and vertical is 8px wide, while their transparent borders and
// padding preserve a compact thumb with a comfortable grab target.
const SCROLLBAR_CLASSNAME =
  "group/scrollbar flex touch-none p-px transition-colors select-none data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:border-t data-[orientation=horizontal]:border-t-transparent data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2 data-[orientation=vertical]:border-s data-[orientation=vertical]:border-s-transparent";

const SCROLLBAR_THUMB_CLASSNAME =
  "bg-border group-hover/scrollbar:bg-muted-foreground/40 relative flex-1 rounded-full transition-colors";

type DataGridScrollAreaOrientation = "horizontal" | "vertical" | "both";

type ScrollbarMetrics = {
  hasVerticalOverflow: boolean;
  headerHeight: number;
  horizontalScrollbarSize: number;
  thumbHeight: number;
  thumbTop: number;
  trackHeight: number;
};

type HorizontalScrollbarMetrics = {
  hasHorizontalOverflow: boolean;
  insetEnd: number;
  insetStart: number;
  thumbLeft: number;
  thumbWidth: number;
  trackWidth: number;
};

type ObservedElements = {
  header: HTMLElement | null;
  horizontalScrollbar: HTMLElement | null;
  table: HTMLElement | null;
  tableViewport: HTMLElement | null;
};

type DataGridScrollAreaProps = Omit<ScrollAreaPrimitive.Root.Props, "children"> & {
  children: ReactNode;
  orientation?: DataGridScrollAreaOrientation;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function areMetricsEqual(next: ScrollbarMetrics, prev: ScrollbarMetrics) {
  return (
    next.hasVerticalOverflow === prev.hasVerticalOverflow &&
    next.headerHeight === prev.headerHeight &&
    next.horizontalScrollbarSize === prev.horizontalScrollbarSize &&
    next.thumbHeight === prev.thumbHeight &&
    next.thumbTop === prev.thumbTop &&
    next.trackHeight === prev.trackHeight
  );
}

function areHorizontalMetricsEqual(
  next: HorizontalScrollbarMetrics,
  prev: HorizontalScrollbarMetrics,
) {
  return (
    next.hasHorizontalOverflow === prev.hasHorizontalOverflow &&
    next.insetEnd === prev.insetEnd &&
    next.insetStart === prev.insetStart &&
    next.thumbLeft === prev.thumbLeft &&
    next.thumbWidth === prev.thumbWidth &&
    next.trackWidth === prev.trackWidth
  );
}

function getHorizontalScrollbarMetrics({
  insetEnd,
  insetStart,
  scrollLeft,
  scrollWidth,
  viewportWidth,
}: {
  insetEnd: number;
  insetStart: number;
  scrollLeft: number;
  scrollWidth: number;
  viewportWidth: number;
}): HorizontalScrollbarMetrics {
  const trackWidth = Math.max(0, viewportWidth - insetStart - insetEnd);
  const centerContentWidth = Math.max(trackWidth, scrollWidth - insetStart - insetEnd);
  const maxScroll = Math.max(0, scrollWidth - viewportWidth);

  if (trackWidth === 0 || maxScroll === 0) {
    return {
      hasHorizontalOverflow: false,
      insetEnd,
      insetStart,
      thumbLeft: 0,
      thumbWidth: trackWidth,
      trackWidth,
    };
  }

  const thumbWidth = clamp(
    trackWidth * (trackWidth / centerContentWidth),
    MIN_THUMB_SIZE,
    trackWidth,
  );
  const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
  const thumbLeft = (clamp(scrollLeft, 0, maxScroll) / maxScroll) * maxThumbLeft;

  return {
    hasHorizontalOverflow: true,
    insetEnd,
    insetStart,
    thumbLeft,
    thumbWidth,
    trackWidth,
  };
}

function applyMetrics(element: HTMLElement, metrics: ScrollbarMetrics) {
  element.style.setProperty("--data-grid-scrollbar-header-height", `${metrics.headerHeight}px`);
  element.style.setProperty("--data-grid-scrollbar-thumb-height", `${metrics.thumbHeight}px`);
  element.style.setProperty("--data-grid-scrollbar-thumb-top", `${metrics.thumbTop}px`);
  element.style.setProperty("--data-grid-scrollbar-track-height", `${metrics.trackHeight}px`);
}

function applyHorizontalMetrics(
  element: HTMLElement,
  metrics: HorizontalScrollbarMetrics,
  previous?: HorizontalScrollbarMetrics,
) {
  if (!previous || metrics.insetEnd !== previous.insetEnd) {
    element.style.setProperty("--data-grid-scrollbar-inset-end", `${metrics.insetEnd}px`);
  }
  if (!previous || metrics.insetStart !== previous.insetStart) {
    element.style.setProperty("--data-grid-scrollbar-inset-start", `${metrics.insetStart}px`);
  }
  if (!previous || metrics.thumbLeft !== previous.thumbLeft) {
    element.style.setProperty("--data-grid-scrollbar-thumb-left", `${metrics.thumbLeft}px`);
  }
  if (!previous || metrics.thumbWidth !== previous.thumbWidth) {
    element.style.setProperty("--data-grid-scrollbar-thumb-width", `${metrics.thumbWidth}px`);
  }
}

function DataGridScrollArea({
  children,
  className,
  orientation = "both",
  ...props
}: DataGridScrollAreaProps) {
  const { props: dataGridProps } = useDataGrid();
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalOverlayRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const horizontalDragRef = useRef<{
    pointerId: number;
    startScrollLeft: number;
    startX: number;
  } | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startScrollTop: number;
    startY: number;
  } | null>(null);
  const metricsRef = useRef<ScrollbarMetrics>(INITIAL_METRICS);
  const horizontalMetricsRef = useRef<HorizontalScrollbarMetrics>(INITIAL_HORIZONTAL_METRICS);
  // Reading pinned cell rectangles forces layout. Cache those boundaries on
  // structural/size changes so a scroll frame only computes and writes thumb X.
  const horizontalInsetsRef = useRef({ insetEnd: 0, insetStart: 0 });
  const observedElementsRef = useRef<ObservedElements>({
    header: null,
    horizontalScrollbar: null,
    table: null,
    tableViewport: null,
  });

  const showHorizontal = orientation !== "vertical";
  const showVertical = orientation !== "horizontal";
  const usesCustomVerticalScrollbar = showVertical && !!dataGridProps.tableLayout?.headerSticky;
  const [hasCustomVerticalOverflow, setHasCustomVerticalOverflow] = useState(false);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  const clearHorizontalDragState = useCallback(() => {
    horizontalDragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  }, []);

  const clearDragState = useCallback(() => {
    dragRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  }, []);

  // The overlay is mounted one commit after the sync that detected overflow,
  // so it misses that sync's write. Seeding it from the ref callback lands the
  // geometry during commit, before the browser paints the track.
  const setOverlayRef = useCallback((node: HTMLDivElement | null) => {
    overlayRef.current = node;

    if (node) applyMetrics(node, metricsRef.current);
  }, []);

  const setHorizontalOverlayRef = useCallback((node: HTMLDivElement | null) => {
    horizontalOverlayRef.current = node;

    if (node) applyHorizontalMetrics(node, horizontalMetricsRef.current);
  }, []);

  const measureHorizontalInsets = useCallback(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;

    if (!container || !viewport) return;

    const viewportRect = viewport.getBoundingClientRect();
    const startCells = container.querySelectorAll<HTMLElement>(
      '[data-slot="data-grid-table"] thead [data-pinned="start"]',
    );
    const endCells = container.querySelectorAll<HTMLElement>(
      '[data-slot="data-grid-table"] thead [data-pinned="end"]',
    );
    let insetStart = 0;
    let insetEnd = 0;

    for (const cell of startCells) {
      insetStart = Math.max(insetStart, cell.getBoundingClientRect().right - viewportRect.left);
    }

    for (const cell of endCells) {
      insetEnd = Math.max(insetEnd, viewportRect.right - cell.getBoundingClientRect().left);
    }

    horizontalInsetsRef.current = {
      insetEnd: clamp(insetEnd, 0, viewport.clientWidth),
      insetStart: clamp(insetStart, 0, viewport.clientWidth),
    };
  }, []);

  const syncCustomHorizontalScrollbar = useCallback(() => {
    const viewport = viewportRef.current;

    if (!viewport || !showHorizontal) return;

    const { insetEnd, insetStart } = horizontalInsetsRef.current;

    const nextMetrics = getHorizontalScrollbarMetrics({
      insetEnd,
      insetStart,
      scrollLeft: viewport.scrollLeft,
      scrollWidth: viewport.scrollWidth,
      viewportWidth: viewport.clientWidth,
    });

    if (!areHorizontalMetricsEqual(nextMetrics, horizontalMetricsRef.current)) {
      const previousMetrics = horizontalMetricsRef.current;
      horizontalMetricsRef.current = nextMetrics;
      if (horizontalOverlayRef.current) {
        applyHorizontalMetrics(horizontalOverlayRef.current, nextMetrics, previousMetrics);
      }

      if (previousMetrics.hasHorizontalOverflow !== nextMetrics.hasHorizontalOverflow) {
        setHasHorizontalOverflow(nextMetrics.hasHorizontalOverflow);
      }
    }
  }, [showHorizontal]);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;

    if (!container || !viewport || !showHorizontal) return;

    let frame = 0;

    const scheduleSync = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncCustomHorizontalScrollbar);
    };

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            measureHorizontalInsets();
            scheduleSync();
          });
    const observed = new Set<HTMLElement>();

    const observeElement = (element: HTMLElement | null) => {
      if (element && observer && !observed.has(element)) {
        observer.observe(element);
        observed.add(element);
      }
    };

    const resolveTableElements = () => {
      const header = container.querySelector(
        '[data-slot="data-grid-table"] thead',
      ) as HTMLElement | null;
      const table = container.querySelector('[data-slot="data-grid-table"]') as HTMLElement | null;

      observeElement(header);
      observeElement(table);

      return !!(header && table);
    };

    observeElement(viewport);
    resolveTableElements();

    measureHorizontalInsets();
    scheduleSync();
    viewport.addEventListener("scroll", scheduleSync, { passive: true });

    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            resolveTableElements();
            measureHorizontalInsets();
            scheduleSync();
          });
    mutationObserver?.observe(container, {
      attributeFilter: ["data-pinned"],
      attributes: true,
      childList: true,
      subtree: true,
    });

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mutationObserver?.disconnect();
      viewport.removeEventListener("scroll", scheduleSync);
      clearHorizontalDragState();
    };
  }, [
    clearHorizontalDragState,
    measureHorizontalInsets,
    showHorizontal,
    syncCustomHorizontalScrollbar,
  ]);

  const resetMetrics = useCallback(() => {
    if (!areMetricsEqual(INITIAL_METRICS, metricsRef.current)) {
      metricsRef.current = INITIAL_METRICS;
      if (overlayRef.current) applyMetrics(overlayRef.current, INITIAL_METRICS);
    }

    setHasCustomVerticalOverflow((prev) => (prev ? false : prev));
  }, []);

  const syncCustomVerticalScrollbar = useCallback(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;

    if (!container || !viewport || !usesCustomVerticalScrollbar) {
      resetMetrics();
      return;
    }

    const { header, horizontalScrollbar } = observedElementsRef.current;
    const headerHeight = header?.getBoundingClientRect().height ?? 0;
    const viewportHeight = viewport.clientHeight;
    const viewportWidth = viewport.clientWidth;
    const scrollHeight = viewport.scrollHeight;
    const scrollWidth = viewport.scrollWidth;
    const hasHorizontalOverflow = showHorizontal && scrollWidth > viewportWidth + 0.5;
    const horizontalScrollbarSize = hasHorizontalOverflow
      ? horizontalScrollbar?.offsetHeight || FALLBACK_SCROLLBAR_SIZE
      : 0;
    const trackHeight = Math.max(0, viewportHeight - headerHeight - horizontalScrollbarSize);
    const maxScroll = Math.max(0, scrollHeight - viewportHeight);

    let nextMetrics: ScrollbarMetrics;

    if (trackHeight === 0 || maxScroll === 0) {
      nextMetrics = {
        hasVerticalOverflow: false,
        headerHeight,
        horizontalScrollbarSize,
        thumbHeight: trackHeight,
        thumbTop: 0,
        trackHeight,
      };
    } else {
      const bodyContentHeight = Math.max(trackHeight, scrollHeight - headerHeight);
      const thumbHeight = clamp(
        trackHeight * (trackHeight / bodyContentHeight),
        MIN_THUMB_SIZE,
        trackHeight,
      );
      const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
      const thumbTop = maxThumbTop > 0 ? (viewport.scrollTop / maxScroll) * maxThumbTop : 0;

      nextMetrics = {
        hasVerticalOverflow: true,
        headerHeight,
        horizontalScrollbarSize,
        thumbHeight,
        thumbTop,
        trackHeight,
      };
    }

    if (!areMetricsEqual(nextMetrics, metricsRef.current)) {
      metricsRef.current = nextMetrics;
      // Scoped to the overlay, never to the container. These four properties
      // inherit, and thumbTop changes on essentially every scroll frame, so
      // writing them on the element that wraps the whole grid invalidates
      // computed style for every row and cell each frame. The overlay subtree
      // is their only reader.
      if (overlayRef.current) applyMetrics(overlayRef.current, nextMetrics);
    }

    setHasCustomVerticalOverflow((prev) =>
      prev === nextMetrics.hasVerticalOverflow ? prev : nextMetrics.hasVerticalOverflow,
    );
  }, [resetMetrics, showHorizontal, usesCustomVerticalScrollbar]);

  useEffect(() => {
    const container = containerRef.current;
    const viewport = viewportRef.current;

    if (!container || !viewport) return;

    if (!usesCustomVerticalScrollbar) {
      resetMetrics();
      return;
    }

    let frame = 0;

    const scheduleSync = () => {
      cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncCustomVerticalScrollbar);
    };

    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleSync);
    const observed = new Set<HTMLElement>();

    const observeElement = (element: HTMLElement | null) => {
      if (element && observer && !observed.has(element)) {
        observer.observe(element);
        observed.add(element);
      }
    };

    const resolveObservedElements = () => {
      observedElementsRef.current = {
        header: container.querySelector(
          '[data-slot="data-grid-table"] thead',
        ) as HTMLElement | null,
        horizontalScrollbar: container.querySelector(
          '[data-slot="data-grid-scrollbar"][data-orientation="horizontal"]',
        ) as HTMLElement | null,
        table: container.querySelector('[data-slot="data-grid-table"]') as HTMLElement | null,
        tableViewport: container.querySelector(
          '[data-slot="data-grid-table-viewport"]',
        ) as HTMLElement | null,
      };

      observeElement(observedElementsRef.current.header);
      observeElement(observedElementsRef.current.table);
      observeElement(observedElementsRef.current.tableViewport);

      return !!(observedElementsRef.current.header && observedElementsRef.current.table);
    };

    observeElement(viewport);
    const resolvedOnMount = resolveObservedElements();

    scheduleSync();
    viewport.addEventListener("scroll", scheduleSync, { passive: true });

    // A table that mounts after this effect (empty state swapped for data)
    // would otherwise never be observed and the custom scrollbar would
    // overlap the sticky header. One-shot: disconnects once resolved.
    let mutationObserver: MutationObserver | null = null;
    if (!resolvedOnMount && typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        if (resolveObservedElements()) {
          mutationObserver?.disconnect();
          mutationObserver = null;
          scheduleSync();
        }
      });
      mutationObserver.observe(container, { childList: true, subtree: true });
    }

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mutationObserver?.disconnect();
      viewport.removeEventListener("scroll", scheduleSync);
      clearDragState();
    };
  }, [clearDragState, resetMetrics, syncCustomVerticalScrollbar, usesCustomVerticalScrollbar]);

  const scrollToThumbOffset = (nextThumbTop: number) => {
    const viewport = viewportRef.current;
    const { thumbHeight, trackHeight } = metricsRef.current;

    if (!viewport) return;

    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);

    if (maxScroll === 0 || maxThumbTop === 0) {
      viewport.scrollTop = 0;
      return;
    }

    const ratio = clamp(nextThumbTop, 0, maxThumbTop) / maxThumbTop;
    viewport.scrollTop = ratio * maxScroll;
  };

  const scrollToHorizontalThumbOffset = (nextThumbLeft: number) => {
    const viewport = viewportRef.current;
    const { thumbWidth, trackWidth } = horizontalMetricsRef.current;

    if (!viewport) return;

    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);

    if (maxScroll === 0 || maxThumbLeft === 0) {
      viewport.scrollLeft = 0;
      return;
    }

    const ratio = clamp(nextThumbLeft, 0, maxThumbLeft) / maxThumbLeft;
    viewport.scrollLeft = ratio * maxScroll;
  };

  const handleHorizontalThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    horizontalDragRef.current = {
      pointerId: event.pointerId,
      startScrollLeft: viewport.scrollLeft,
      startX: event.clientX,
    };

    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  };

  const handleHorizontalThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const dragState = horizontalDragRef.current;
    const { thumbWidth, trackWidth } = horizontalMetricsRef.current;

    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) return;

    const maxThumbLeft = Math.max(0, trackWidth - thumbWidth);
    const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);

    if (maxThumbLeft === 0 || maxScroll === 0) return;

    const deltaX = event.clientX - dragState.startX;
    const nextScrollLeft = dragState.startScrollLeft + (deltaX / maxThumbLeft) * maxScroll;

    viewport.scrollLeft = clamp(nextScrollLeft, 0, maxScroll);
  };

  const handleHorizontalThumbPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (horizontalDragRef.current?.pointerId !== event.pointerId) return;
    clearHorizontalDragState();
  };

  const handleHorizontalTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { thumbWidth } = horizontalMetricsRef.current;

    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - thumbWidth / 2;

    scrollToHorizontalThumbOffset(offsetX);
  };

  const handleThumbPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;

    if (!viewport) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    dragRef.current = {
      pointerId: event.pointerId,
      startScrollTop: viewport.scrollTop,
      startY: event.clientY,
    };

    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  };

  const handleThumbPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const dragState = dragRef.current;
    const { thumbHeight, trackHeight } = metricsRef.current;

    if (!viewport || !dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const maxScroll = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

    if (maxThumbTop === 0 || maxScroll === 0) return;

    const deltaY = event.clientY - dragState.startY;
    const nextScrollTop = dragState.startScrollTop + (deltaY / maxThumbTop) * maxScroll;

    viewport.scrollTop = clamp(nextScrollTop, 0, maxScroll);
  };

  const handleThumbPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    clearDragState();
  };

  const handleTrackPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { thumbHeight } = metricsRef.current;

    if (event.target !== event.currentTarget) return;

    event.preventDefault();
    event.stopPropagation();

    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top - thumbHeight / 2;

    scrollToThumbOffset(offsetY);
  };

  return (
    <div ref={containerRef} className="relative">
      <ScrollAreaPrimitive.Root
        data-slot="data-grid-scroll-area"
        // Styling hook: present while the sticky-header scroll mode detects
        // vertical overflow, so consumers can style scrollable vs short
        // grids with a plain ancestor attribute selector.
        data-overflow-vertical={hasCustomVerticalOverflow ? "true" : undefined}
        className={cn("relative", className)}
        {...props}
      >
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          data-slot="scroll-area-viewport"
          className="size-full outline-none"
        >
          <ScrollAreaPrimitive.Content data-slot="scroll-area-content">
            {children}
          </ScrollAreaPrimitive.Content>
        </ScrollAreaPrimitive.Viewport>

        {showHorizontal && (
          <div
            ref={setHorizontalOverlayRef}
            aria-hidden="true"
            data-slot="data-grid-scrollbar"
            data-orientation="horizontal"
            data-has-overflow-x={hasHorizontalOverflow ? "" : undefined}
            className={cn(
              "group/scrollbar absolute bottom-0 z-20 h-2.5 touch-none border-t border-t-transparent select-none",
              !hasHorizontalOverflow && "hidden",
            )}
            style={{
              insetInlineEnd: "var(--data-grid-scrollbar-inset-end)",
              insetInlineStart: "var(--data-grid-scrollbar-inset-start)",
            }}
            onPointerDown={handleHorizontalTrackPointerDown}
          >
            <div
              data-slot="data-grid-thumb"
              className="bg-border group-hover/scrollbar:bg-muted-foreground/40 absolute top-0.5 bottom-px touch-none rounded-full transition-colors"
              style={{
                insetInlineStart: "var(--data-grid-scrollbar-thumb-left)",
                width: "var(--data-grid-scrollbar-thumb-width)",
              }}
              onLostPointerCapture={clearHorizontalDragState}
              onPointerCancel={handleHorizontalThumbPointerUp}
              onPointerDown={handleHorizontalThumbPointerDown}
              onPointerMove={handleHorizontalThumbPointerMove}
              onPointerUp={handleHorizontalThumbPointerUp}
            />
          </div>
        )}

        {showVertical && !usesCustomVerticalScrollbar && (
          <ScrollAreaPrimitive.Scrollbar
            data-slot="data-grid-scrollbar"
            data-orientation="vertical"
            orientation="vertical"
            className={SCROLLBAR_CLASSNAME}
          >
            <ScrollAreaPrimitive.Thumb
              data-slot="data-grid-thumb"
              className={SCROLLBAR_THUMB_CLASSNAME}
            />
          </ScrollAreaPrimitive.Scrollbar>
        )}
      </ScrollAreaPrimitive.Root>

      {usesCustomVerticalScrollbar && hasCustomVerticalOverflow && (
        <div
          ref={setOverlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-e-0 top-(--data-grid-scrollbar-header-height) z-20 h-(--data-grid-scrollbar-track-height)"
        >
          <div
            className="group/scrollbar pointer-events-auto relative h-full w-2 touch-none p-px"
            onPointerDown={handleTrackPointerDown}
          >
            <div
              className={cn(
                "bg-border group-hover/scrollbar:bg-muted-foreground/40 absolute end-px w-2 transition-colors",
                "top-(--data-grid-scrollbar-thumb-top) h-(--data-grid-scrollbar-thumb-height)",
                "rounded-full",
              )}
              onLostPointerCapture={clearDragState}
              onPointerCancel={handleThumbPointerUp}
              onPointerDown={handleThumbPointerDown}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export { DataGridScrollArea, getHorizontalScrollbarMetrics };
export type { DataGridScrollAreaOrientation, DataGridScrollAreaProps };
