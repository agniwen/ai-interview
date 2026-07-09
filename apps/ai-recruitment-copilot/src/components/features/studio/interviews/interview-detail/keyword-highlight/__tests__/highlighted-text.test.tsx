import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "../highlighted-text";

describe("HighlightedText", () => {
  it("wraps known keywords in <mark> with category", () => {
    const html = renderToStaticMarkup(<HighlightedText text="绩效提升30%，负责项目管理" />);
    expect(html).toContain('data-category="metric"');
    expect(html).toContain('data-category="skill"');
    expect(html).toContain(">30%<");
  });

  it("respects enabledCategories filter", () => {
    const only = new Set<KeywordCategory>(["skill"]);
    const html = renderToStaticMarkup(
      <HighlightedText enabledCategories={only} text="绩效提升30%，负责项目管理" />,
    );
    expect(html).not.toContain('data-category="metric"');
    expect(html).toContain('data-category="skill"');
  });

  it("renders plain text when nothing matches", () => {
    const html = renderToStaticMarkup(<HighlightedText text="今天天气不错" />);
    expect(html).not.toContain("<mark");
  });
});
