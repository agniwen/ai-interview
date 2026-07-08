import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeywordHighlightProvider } from "./context";
import { KeywordHighlightLegend } from "./legend";

describe("KeywordHighlightLegend", () => {
  it("renders a toggle for each category, all active by default", () => {
    const html = renderToStaticMarkup(
      <KeywordHighlightProvider>
        <KeywordHighlightLegend />
      </KeywordHighlightProvider>,
    );
    expect(html).toContain("技能");
    expect(html).toContain("数字/绩效");
    expect(html).toContain("风险词");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(3);
  });
});
