import { describe, expect, it } from "vitest";
import { CONTENT_TITLE_BAR_REVEAL_SCROLL_PX, shouldShowContentTitleBar } from "./content-title-bar";

describe("ContentTitleBar", () => {
  it("appears only after the main viewport crosses the reveal threshold", () => {
    expect(shouldShowContentTitleBar(CONTENT_TITLE_BAR_REVEAL_SCROLL_PX)).toBe(false);
    expect(shouldShowContentTitleBar(CONTENT_TITLE_BAR_REVEAL_SCROLL_PX + 1)).toBe(true);
  });
});
