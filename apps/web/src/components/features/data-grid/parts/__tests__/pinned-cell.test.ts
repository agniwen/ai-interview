import { describe, expect, it } from "vitest";
import {
  getPinnedEdgeClassName,
  PINNED_EDGE_END_BORDER_CLASS,
  PINNED_EDGE_START_BORDER_CLASS,
  readHorizontalScrollOverflow,
} from "../pinned-cell";

describe("pinned edge separators", () => {
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
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 0,
        scrollWidth: 200,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: false, canScrollStart: false });

    expect(
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 40,
        scrollWidth: 500,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: true, canScrollStart: true });

    expect(
      // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
      readHorizontalScrollOverflow({
        clientWidth: 200,
        scrollLeft: 300,
        scrollWidth: 500,
      } as HTMLElement),
    ).toEqual({ canScrollEnd: false, canScrollStart: true });
  });
});
