// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createMarkdownExtensions } from "../extensions";
import { buildTemplatePlaceholderDecorations } from "../template-placeholders";

function createDoc(markdown: string) {
  const editor = new Editor({
    content: markdown,
    extensions: createMarkdownExtensions(),
  });
  const { doc } = editor.state;
  return { destroy: () => editor.destroy(), doc };
}

describe("buildTemplatePlaceholderDecorations", () => {
  it("highlights known runtime placeholders", () => {
    const { destroy, doc } = createDoc("你好{候选人姓名}，欢迎面试{岗位}。");
    const decorations = buildTemplatePlaceholderDecorations(doc);
    const texts = decorations
      .find()
      .map((decoration) => doc.textBetween(decoration.from, decoration.to));
    destroy();

    expect(texts).toEqual(["{候选人姓名}", "{岗位}"]);
  });

  it("ignores unknown brace tokens", () => {
    const { destroy, doc } = createDoc("保留{未知占位符}与普通文本");
    const decorations = buildTemplatePlaceholderDecorations(doc);
    const count = decorations.find().length;
    destroy();

    expect(count).toBe(0);
  });
});
