import { describe, expect, it } from "vitest";
import { getVisibleSelectedItemCount } from "./searchable-multi-select-overflow";

describe("getVisibleSelectedItemCount", () => {
  it("shows all items when they fit without an overflow badge", () => {
    expect(
      getVisibleSelectedItemCount({
        containerWidth: 200,
        gap: 6,
        itemWidths: [48, 52, 60],
        overflowBadgeWidth: 32,
      }),
    ).toBe(3);
  });

  it("reserves space for the overflow badge when some items are hidden", () => {
    expect(
      getVisibleSelectedItemCount({
        containerWidth: 150,
        gap: 6,
        itemWidths: [48, 52, 60],
        overflowBadgeWidth: 32,
      }),
    ).toBe(2);
  });

  it("falls back to the overflow badge only when no item fits", () => {
    expect(
      getVisibleSelectedItemCount({
        containerWidth: 60,
        gap: 6,
        itemWidths: [80, 90],
        overflowBadgeWidth: 32,
      }),
    ).toBe(0);
  });

  it("returns zero before the trigger width is measured", () => {
    expect(
      getVisibleSelectedItemCount({
        containerWidth: 0,
        gap: 6,
        itemWidths: [48],
        overflowBadgeWidth: 32,
      }),
    ).toBe(0);
  });
});
