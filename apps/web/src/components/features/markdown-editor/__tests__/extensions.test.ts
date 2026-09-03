// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createMarkdownExtensions } from "../extensions";

describe("markdown editor extensions", () => {
  it("renders rich text without visible markdown syntax markers", () => {
    const element = document.createElement("div");
    const editor = new Editor({
      content: "# 标题\n\n**粗体**与普通文本",
      element,
      extensions: createMarkdownExtensions(),
    });

    expect(element.querySelector("[data-md-marker]")).toBeNull();
    expect(element.querySelector("h1")?.textContent).toBe("标题");
    expect(element.querySelector("strong")?.textContent).toBe("粗体");
    editor.destroy();
  });
});
