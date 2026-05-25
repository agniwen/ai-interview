// 中文：用一个临时 Editor 实例完成 markdown <-> ProseMirror 的双向转换，
// 与 React 解耦，方便在 node 环境下单测。
// English: use a throwaway headless Editor for markdown <-> ProseMirror
// conversion. Decoupled from React so it can be unit-tested in node.
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createMarkdownExtensions } from "./extensions";

// 中文：返回 markdown 反序列化后的 ProseMirror JSON 文档。
// English: returns the ProseMirror JSON doc parsed from markdown.
export function parseFromMarkdown(markdown: string) {
  const editor = new Editor({
    content: markdown,
    extensions: createMarkdownExtensions(),
  });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

// 中文：把 ProseMirror JSON 文档序列化回 markdown 字符串。
// English: serializes a ProseMirror JSON doc back to markdown.
export function serializeToMarkdown(doc: unknown): string {
  const editor = new Editor({
    content: doc as JSONContent,
    extensions: createMarkdownExtensions(),
  });
  const md = (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
  editor.destroy();
  return md;
}
