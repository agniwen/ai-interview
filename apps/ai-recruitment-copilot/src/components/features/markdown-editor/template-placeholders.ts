// 中文：用 ProseMirror inline decoration 高亮运行时占位符（如 {候选人姓名}），
// 不改动文档内容、不影响 markdown 序列化。
// English: ProseMirror inline decorations for runtime placeholders such as
// {候选人姓名}. Presentation-only — does not alter the doc or markdown output.
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/** 与 `@arc/shared` / agent 端 `_apply_placeholders` 保持一致的可替换占位符。 */
const TEMPLATE_PLACEHOLDER_PATTERN = /\{(?:候选人姓名|岗位)\}/g;

const PLACEHOLDER_CLASS = "rounded bg-primary/15 px-0.5 text-primary";

export function buildTemplatePlaceholderDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return;
    }

    TEMPLATE_PLACEHOLDER_PATTERN.lastIndex = 0;
    let match = TEMPLATE_PLACEHOLDER_PATTERN.exec(node.text);
    while (match) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(
        Decoration.inline(from, to, {
          class: PLACEHOLDER_CLASS,
        }),
      );
      match = TEMPLATE_PLACEHOLDER_PATTERN.exec(node.text);
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const TemplatePlaceholders = Extension.create({
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("templatePlaceholders");
    return [
      new Plugin<DecorationSet>({
        key,
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        state: {
          apply: (tr, old) => (tr.docChanged ? buildTemplatePlaceholderDecorations(tr.doc) : old),
          init: (_, { doc }) => buildTemplatePlaceholderDecorations(doc),
        },
      }),
    ];
  },
  name: "templatePlaceholders",
});
