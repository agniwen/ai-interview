import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeatureBlocks } from "./feature-blocks";

describe("FeatureBlocks", () => {
  it("hides later desktop scenes in the static HTML before GSAP initializes", () => {
    const markup = renderToStaticMarkup(<FeatureBlocks />);

    expect(markup).toContain('data-home-scene="0"');
    expect(markup).toContain('data-home-scene="1" style="opacity:0;visibility:hidden"');
    expect(markup).toContain('data-home-scene="2" style="opacity:0;visibility:hidden"');
  });
});
