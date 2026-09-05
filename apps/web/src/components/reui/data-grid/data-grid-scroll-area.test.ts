import { describe, expect, it } from "vitest";

import { getHorizontalScrollbarMetrics } from "./data-grid-scroll-area";

describe("getHorizontalScrollbarMetrics", () => {
  const pinnedGrid = {
    insetEnd: 166,
    insetStart: 255.5,
    scrollWidth: 1543,
    viewportWidth: 932,
  };

  it("starts the track and thumb after the pinned start columns", () => {
    const metrics = getHorizontalScrollbarMetrics({
      ...pinnedGrid,
      scrollLeft: 0,
    });

    expect(metrics).toMatchObject({
      hasHorizontalOverflow: true,
      insetEnd: 166,
      insetStart: 255.5,
      thumbLeft: 0,
      trackWidth: 510.5,
    });
    expect(metrics.thumbWidth).toBeCloseTo(232.3765, 4);
  });

  it("ends the thumb at the pinned end columns at maximum scroll", () => {
    const metrics = getHorizontalScrollbarMetrics({
      ...pinnedGrid,
      scrollLeft: 611,
    });

    expect(metrics.thumbLeft + metrics.thumbWidth).toBeCloseTo(metrics.trackWidth, 8);
  });

  it("hides the scrollbar when the center content does not overflow", () => {
    const metrics = getHorizontalScrollbarMetrics({
      insetEnd: 100,
      insetStart: 200,
      scrollLeft: 0,
      scrollWidth: 900,
      viewportWidth: 900,
    });

    expect(metrics).toMatchObject({
      hasHorizontalOverflow: false,
      thumbLeft: 0,
      thumbWidth: 600,
      trackWidth: 600,
    });
  });
});
