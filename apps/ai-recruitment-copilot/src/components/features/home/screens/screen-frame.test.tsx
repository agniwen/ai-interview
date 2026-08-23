import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScreenFrame } from "./screen-frame";

describe("ScreenFrame", () => {
  it("renders the macOS glass-style frame and traffic lights without an outer shadow", () => {
    const markup = renderToStaticMarkup(
      <ScreenFrame>
        <div>Preview</div>
      </ScreenFrame>,
    );

    expect(markup).toContain('data-window-control="close"');
    expect(markup).toContain('data-window-control="minimize"');
    expect(markup).toContain('data-window-control="zoom"');
    expect(markup).toContain("linear-gradient(145deg");
    expect(markup).toContain("#df3e47_0%");
    expect(markup).not.toContain("before:bg");
    expect(markup).toContain("inset_0_1px_1px");
    expect(markup).toContain("size-3.5");
    const closeControl = markup.match(/<span[^>]+data-window-control="close"[^>]*>/)?.[0];
    const frame = markup.match(/<div[^>]+data-slot="screen-frame"[^>]*>/)?.[0];
    const content = markup.match(/<div[^>]+data-slot="screen-frame-content"[^>]*>/)?.[0];
    expect(closeControl).not.toContain("ring-");
    expect(markup).not.toContain("dark:shadow-");
    expect(markup).not.toContain("inset_0_-1px");
    expect(markup).not.toContain(",0_1px_1px_rgb(0_0_0_/_0.16)");
    expect(frame).not.toContain("shadow-xl");
    expect(frame).not.toContain("ring-");
    expect(frame).toContain("bg-background/75");
    expect(frame).toContain("p-1");
    expect(frame).toContain("backdrop-blur-sm");
    expect(frame).not.toContain("backdrop-blur-xl");
    expect(content).toContain("rounded-lg");
    expect(content).not.toContain("border");
  });
});
