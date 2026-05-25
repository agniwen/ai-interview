// 中文：Tiptap 扩展集合，仅启用标准 markdown 支持的节点 / 标记。
// English: Tiptap extensions limited to nodes/marks that map to standard markdown.
import { Placeholder } from "@tiptap/extension-placeholder";
import type { Extensions } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";

export function createMarkdownExtensions(opts?: { placeholder?: string }): Extensions {
  return [
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
