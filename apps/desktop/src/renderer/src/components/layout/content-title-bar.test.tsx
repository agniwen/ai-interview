import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CONTENT_TITLE_BAR_REVEAL_SCROLL_PX,
  ContentTitleBar,
  shouldShowContentTitleBar,
} from "./content-title-bar";

describe("ContentTitleBar", () => {
  it("floats above content without reserving layout space", () => {
    const html = renderToStaticMarkup(<ContentTitleBar visible={false} />);

    expect(html).toContain('data-slot="content-title-bar"');
    expect(html).toContain("absolute inset-x-0 top-0");
    expect(html).not.toContain("sticky");
    expect(html).not.toContain("shrink-0");
    expect(html).toContain("opacity-0");
    expect(html).toContain("transition-opacity");
    expect(html).toContain("duration-[var(--duration-fast)]");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("appears only after the main viewport crosses the reveal threshold", () => {
    expect(shouldShowContentTitleBar(CONTENT_TITLE_BAR_REVEAL_SCROLL_PX)).toBe(false);
    expect(shouldShowContentTitleBar(CONTENT_TITLE_BAR_REVEAL_SCROLL_PX + 1)).toBe(true);

    const visible = renderToStaticMarkup(<ContentTitleBar visible />);
    expect(visible).toContain("opacity-100");
  });
});
