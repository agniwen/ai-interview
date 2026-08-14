import { describe, expect, it } from "vitest";
import {
  getPinnedEdgeClassName,
  PINNED_EDGE_END_BORDER_CLASS,
  PINNED_EDGE_LEFT_BORDER_CLASS,
  PINNED_EDGE_RIGHT_BORDER_CLASS,
  PINNED_EDGE_START_BORDER_CLASS,
  PINNED_HEADER_CLASS,
  readHorizontalScrollOverflow,
  STICKY_HEADER_CLASS,
} from "../pinned-cell";

describe("pinned table headers", () => {
  it("uses sidebar fill in light mode and muted in dark for sticky/pinned headers", () => {
    expect(PINNED_HEADER_CLASS).toBe("bg-sidebar dark:bg-muted");
    expect(STICKY_HEADER_CLASS).toContain("bg-sidebar");
    expect(STICKY_HEADER_CLASS).toContain("dark:bg-muted");
    expect(PINNED_HEADER_CLASS.includes("/")).toBe(false);
  });
});

describe("pinned edge separators", () => {
  it("uses a single absolute 1px divider and clears the native edge border", () => {
    expect(PINNED_EDGE_START_BORDER_CLASS).toContain("before:w-px");
    expect(PINNED_EDGE_START_BORDER_CLASS).toContain("before:bg-border");
    expect(PINNED_EDGE_START_BORDER_CLASS).toContain("border-e-0");
    expect(PINNED_EDGE_END_BORDER_CLASS).toContain("before:w-px");
    expect(PINNED_EDGE_END_BORDER_CLASS).toContain("before:bg-border");
    expect(PINNED_EDGE_START_BORDER_CLASS).not.toMatch(/shadow/);
    expect(PINNED_EDGE_END_BORDER_CLASS).not.toMatch(/shadow/);
    // Legacy aliases kept for compatibility.
    expect(PINNED_EDGE_LEFT_BORDER_CLASS).toBe(PINNED_EDGE_START_BORDER_CLASS);
    expect(PINNED_EDGE_RIGHT_BORDER_CLASS).toBe(PINNED_EDGE_END_BORDER_CLASS);
  });

  it("only paints the pin-edge divider while scroll has content under that side", () => {
    expect(
      getPinnedEdgeClassName({
        isEndEdge: false,
        isStartEdge: true,
        showStartEdge: false,
      }),
    ).toBe("");

    expect(
      getPinnedEdgeClassName({
        isEndEdge: false,
        isStartEdge: true,
        showStartEdge: true,
      }),
    ).toBe(PINNED_EDGE_START_BORDER_CLASS);

    expect(
      getPinnedEdgeClassName({
        isEndEdge: true,
        isStartEdge: false,
        showEndEdge: false,
      }),
    ).toBe("");

    expect(
      getPinnedEdgeClassName({
        isEndEdge: true,
        isStartEdge: false,
        showEndEdge: true,
      }),
    ).toBe(PINNED_EDGE_END_BORDER_CLASS);
  });

  it("reads horizontal scroll overflow with a sub-pixel tolerance", () => {
    expect(
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 0,
        scrollWidth: 200,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: false, canScrollStart: false });

    expect(
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 40,
        scrollWidth: 500,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: true, canScrollStart: true });

    expect(
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 300,
        scrollWidth: 500,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: false, canScrollStart: true });
  });
});
