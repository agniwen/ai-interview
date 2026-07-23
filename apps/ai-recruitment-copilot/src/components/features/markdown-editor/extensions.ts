// 中文：Tiptap 扩展集合，仅启用标准 markdown 支持的节点 / 标记。
// English: Tiptap extensions limited to nodes/marks that map to standard markdown.
import { Extension } from "@tiptap/core";
import type { Extensions } from "@tiptap/core";
import { Placeholder } from "@tiptap/extension-placeholder";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { MarkdownMarkers } from "./markdown-markers";
import { TemplatePlaceholders } from "./template-placeholders";

// 中文：覆盖 Enter 键，沿用列表 / 代码块的原有处理顺序，最后用
// `splitBlock({ keepMarks: false })` 让新段落不再继承 bold/italic/code 等
// stored marks —— 更符合 markdown 用户对 \n\n 起新段落的直觉。
// English: override Enter so list / code-block handlers keep working, then
// fall through to `splitBlock({ keepMarks: false })` so the new paragraph
// drops stored marks (bold / italic / code). Matches markdown intuition where
// a blank line starts a fresh block.
const EnterClearStoredMarks = Extension.create({
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) =>
        editor.commands.first(({ commands }) => [
          () => commands.newlineInCode(),
          () => commands.splitListItem("listItem"),
          () => commands.createParagraphNear(),
          () => commands.liftEmptyBlock(),
          () => commands.splitBlock({ keepMarks: false }),
        ]),
    };
  },
  name: "enterClearStoredMarks",
});

export function createMarkdownExtensions(opts?: { placeholder?: string }): Extensions {
  return [
    EnterClearStoredMarks,
    MarkdownMarkers,
    TemplatePlaceholders,
    StarterKit.configure({
      // 中文：Link 通过 StarterKit 配置，避免重复注册扩展。
      // English: Link is configured via StarterKit to avoid duplicate extension registration.
      link: {
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
        autolink: true,
        openOnClick: false,
      },
    }),
    Placeholder.configure({
      placeholder: opts?.placeholder ?? "",
    }),
    Markdown.configure({
      breaks: false,
      html: false,
      linkify: true,
      tightLists: true,
      transformCopiedText: true,
      transformPastedText: true,
    }),
  ];
}
