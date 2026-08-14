import type { EventListeners, OverlayScrollbars } from "overlayscrollbars";

/**
 * When the pointer is over a horizontally overflowing OverlayScrollbars viewport,
 * map mouse-wheel / trackpad vertical scroll to horizontal panning (GitHub contrib
 * calendar style). At the scroll edges, the event is left alone so the page can
 * keep scrolling.
 */

const cleanups = new WeakMap<HTMLElement, () => void>();

function wheelDeltaPixels(event: WheelEvent, lineHeight: number, pageSize: number): number {
  // Dominant axis: pure vertical mouse wheels → Y; shift-wheel / trackpad swipe → X.
  const useX = Math.abs(event.deltaX) > Math.abs(event.deltaY);
  let delta = useX ? event.deltaX : event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= lineHeight;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= pageSize;
  }
  return delta;
}

function attachHorizontalWheelScroll(viewport: HTMLElement) {
  cleanups.get(viewport)?.();

  const onWheel = (event: WheelEvent) => {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    if (maxScroll <= 1) {
      return;
    }

    const delta = wheelDeltaPixels(event, 16, viewport.clientWidth);
    if (delta === 0) {
      return;
    }

    const next = Math.min(maxScroll, Math.max(0, viewport.scrollLeft + delta));
    // Already at the edge in this direction — don't trap the page scroll.
    if (next === viewport.scrollLeft) {
      return;
    }

    event.preventDefault();
    viewport.scrollLeft = next;
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  cleanups.set(viewport, () => {
    viewport.removeEventListener("wheel", onWheel);
  });
}

function detachHorizontalWheelScroll(instance: OverlayScrollbars) {
  const { viewport } = instance.elements();
  cleanups.get(viewport)?.();
  cleanups.delete(viewport);
}

/** Merge OverlayScrollbars event listeners with horizontal wheel panning. */
export function withHorizontalWheelScroll(events?: EventListeners): EventListeners {
  return {
    ...events,
    destroyed: (instance, canceled) => {
      detachHorizontalWheelScroll(instance);
      if (typeof events?.destroyed === "function") {
        events.destroyed(instance, canceled);
      } else if (Array.isArray(events?.destroyed)) {
        for (const listener of events.destroyed) {
          listener(instance, canceled);
        }
      }
    },
    initialized: (instance) => {
      attachHorizontalWheelScroll(instance.elements().viewport);
      if (typeof events?.initialized === "function") {
        events.initialized(instance);
      } else if (Array.isArray(events?.initialized)) {
        for (const listener of events.initialized) {
          listener(instance);
        }
      }
    },
  };
}
