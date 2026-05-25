// @vitest-environment jsdom
// 中文：markdown 序列化 / 反序列化的 round-trip 单元测试。
// tiptap-markdown 的解析器依赖 DOMParser，需要 jsdom 环境。
// English: round-trip unit tests for the markdown I/O helpers.
// tiptap-markdown's parser calls DOMParser, so jsdom environment is required.
import { describe, expect, it } from "vitest";
import { parseFromMarkdown, serializeToMarkdown } from "../markdown-io";

describe("markdown-io", () => {
  it("parses heading and bold then serializes back", () => {
    const md = "# 标题\n\n**粗体** 文本";
    const doc = parseFromMarkdown(md);
    const out = serializeToMarkdown(doc);
    expect(out).toContain("# 标题");
    expect(out).toContain("**粗体**");
  });

  it("round-trips a bullet list without losing items", () => {
    const md = "- a\n- b\n- c\n";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("- a");
    expect(out).toContain("- b");
    expect(out).toContain("- c");
  });

  it("preserves plain text with line breaks (legacy data)", () => {
    // 中文：CommonMark 规范中，段落内的单换行符会被折叠为空格。
    // 文字内容不会丢失，但换行符会被规范化。
    // English: In CommonMark, single newlines inside a paragraph collapse to
    // spaces. Text content is preserved; newlines are normalized.
    const md = "第一行\n第二行\n第三行";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("第一行");
    expect(out).toContain("第二行");
    expect(out).toContain("第三行");
  });

  it("round-trips a fenced code block", () => {
    const md = "```\nconst x = 1;\n```\n";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("```");
    expect(out).toContain("const x = 1;");
  });

  it("round-trips a link", () => {
    const md = "see [here](https://example.com)";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("[here](https://example.com)");
  });

  it("handles empty input", () => {
    expect(serializeToMarkdown(parseFromMarkdown(""))).toBe("");
  });
});
