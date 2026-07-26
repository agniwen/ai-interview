// 中文：在编辑模式下用 ProseMirror widget decoration 渲染 markdown 标记
// (** * ` # - 1.)，标记本身不进入文档、不影响序列化、光标穿越自动跳过。
// 方案 A：始终可见。
// English: ProseMirror plugin that overlays markdown markers (** * ` # - 1.)
// as widget decorations while editing. Markers live outside the doc, never
// affect serialization, and cursor navigation skips over them. Plan A:
// always visible.
import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// 中文：inline mark 到 markdown 符号的映射。
// English: inline mark name → markdown delimiter.
const INLINE_MARKERS: Record<string, string> = {
  bold: "**",
  code: "`",
  italic: "*",
};

const MARKER_CLASS = "font-mono text-muted-foreground/60 select-none pointer-events-none";

function createMarkerEl(text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = MARKER_CLASS;
  el.textContent = text;
  el.setAttribute("contenteditable", "false");
  el.dataset.mdMarker = "true";
  return el;
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  // 中文：第一遍 —— 块级标记（标题前的 # / 列表项前的 - 或 1.）。
  // English: pass 1 — block-level markers.
  doc.descendants((node, pos, parent, index) => {
    if (node.type.name === "heading") {
      const level = (node.attrs.level as number | undefined) ?? 1;
      const marker = `${"#".repeat(level)} `;
      // 中文：pos+1 是 heading 节点内部的第一个位置。side:-1 让 marker 渲染在
      // 内容前面、与后续字符同处一行。
      // English: pos+1 is the first inline position inside the heading.
      decorations.push(Decoration.widget(pos + 1, () => createMarkerEl(marker), { side: -1 }));
      return false;
    }
    if (node.type.name === "listItem" && parent) {
      if (parent.type.name === "bulletList") {
        // 中文：listItem 内部 +1 跳过 listItem 边界，+1 再跳过其首个 paragraph
        // 节点边界，得到第一个 inline 位置。
        // English: pos+2 is the first inline position inside the listItem's
        // paragraph.
        decorations.push(Decoration.widget(pos + 2, () => createMarkerEl("- "), { side: -1 }));
      } else if (parent.type.name === "orderedList") {
        const start = (parent.attrs.start as number | undefined) ?? 1;
        const num = start + index;
        decorations.push(
          Decoration.widget(pos + 2, () => createMarkerEl(`${num}. `), {
            side: -1,
          }),
        );
      }
    }
    return true;
  });

  // 中文：第二遍 —— inline mark（bold / italic / code）的开闭符号。
  // 在每个 textblock 内部扫描其 inline children，发现某个 mark 的"开始边界"
  // 时记录位置，发现"结束边界"时输出一对 widget 包住范围。
  // English: pass 2 — inline mark boundaries. Within each textblock, scan
  // children and emit a pair of widgets at the start/end of every contiguous
  // mark span.
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    const openings = new Map<string, number>();
    let prevMarks = new Set<string>();
    let cursor = pos + 1;

    const emit = (markName: string, from: number, to: number) => {
      const sym = INLINE_MARKERS[markName];
      if (!sym) {
        return;
      }
      decorations.push(
        Decoration.widget(from, () => createMarkerEl(sym), { side: -1 }),
        Decoration.widget(to, () => createMarkerEl(sym), { side: 1 }),
      );
    };

    for (let i = 0; i < node.childCount; i += 1) {
      const child = node.child(i);
      const currentMarks = new Set(
        child.marks.flatMap((mark) => (mark.type.name in INLINE_MARKERS ? [mark.type.name] : [])),
      );
      // 中文：刚打开的 mark —— 记录起始位置。
      // English: newly opened marks — remember start position.
      for (const m of currentMarks) {
        if (!prevMarks.has(m)) {
          openings.set(m, cursor);
        }
      }
      // 中文：刚关闭的 mark —— 输出 [from, cursor] 这对 widget。
      // English: marks that just closed — emit the [from, cursor] pair.
      for (const m of prevMarks) {
        const from = openings.get(m);
        if (!currentMarks.has(m) && from !== undefined) {
          emit(m, from, cursor);
          openings.delete(m);
        }
      }
      prevMarks = currentMarks;
      cursor += child.nodeSize;
    }

    // 中文：block 末尾还没关的 mark 也要闭合。
    // English: close any marks still open at the end of the block.
    for (const [m, from] of openings) {
      emit(m, from, cursor);
    }

    return false;
  });

  return DecorationSet.create(doc, decorations);
}

export const MarkdownMarkers = Extension.create({
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>("markdownMarkers");
    return [
      new Plugin<DecorationSet>({
        key,
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
        state: {
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
          init: (_, { doc }) => buildDecorations(doc),
        },
      }),
    ];
  },
  name: "markdownMarkers",
});
