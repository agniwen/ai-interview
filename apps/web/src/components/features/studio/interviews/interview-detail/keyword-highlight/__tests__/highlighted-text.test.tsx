import type { KeywordCategory } from "@app/shared/answer-keywords";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeywordHighlightProvider } from "../context";
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

  it("highlights JD skills provided via the provider's extraSkills", () => {
    // ReScript 不在内置词典里，只有经 extraSkills 才会命中
    const plain = renderToStaticMarkup(<HighlightedText text="我用 ReScript 写业务" />);
    expect(plain).not.toContain("<mark");

    const withSkills = renderToStaticMarkup(
      <KeywordHighlightProvider extraSkills={["ReScript"]}>
        <HighlightedText text="我用 ReScript 写业务" />
      </KeywordHighlightProvider>,
    );
    expect(withSkills).toContain('data-category="skill"');
    expect(withSkills).toContain(">ReScript<");
  });
});
