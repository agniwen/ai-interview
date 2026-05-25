// 中文：MarkdownEditor 的核心同步逻辑。Markdown 字符串是唯一真相源，
// Tiptap 实例只是它的一个"视图"；切回 edit 模式时才 setContent 重建。
// English: the sync logic for MarkdownEditor. The markdown string is the single
// source of truth; the Tiptap instance is just one view over it. We only
// setContent when re-entering edit mode or syncing an external value.
"use client";

import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMarkdownExtensions } from "./extensions";

function readMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

export type EditorMode = "edit" | "preview" | "raw";

interface Options {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  defaultMode?: EditorMode;
}

export function useMarkdownEditor({
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  defaultMode = "edit",
}: Options) {
  const [mode, setMode] = useState<EditorMode>(defaultMode);

  // 中文：标记最近一次 onChange 是否由编辑器自己触发，避免回灌时光标跳动。
  // English: tracks the latest md string the editor emitted so external value
  // changes that equal it don't trigger a setContent (which would jump cursor).
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    content: value,
    editable: !disabled,
    extensions: createMarkdownExtensions({ placeholder }),
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      const md = readMarkdown(e);
      if (typeof maxLength === "number" && md.length > maxLength) {
        // 中文：超长时回滚为上一次合法值（强制阻断输入）。
        // English: roll back to the last valid value when exceeding maxLength.
        e.commands.setContent(lastEmittedRef.current, { emitUpdate: false });
        return;
      }
      lastEmittedRef.current = md;
      onChange(md);
    },
  });

  // 中文：外部 value 与编辑器内部不同步时（如表单 reset、模式切换回 edit），
  // 用 setContent 重建一次。
  // English: when external value diverges from the editor's, rebuild via
  // setContent (e.g. form reset, switching back to edit mode).
  useEffect(() => {
    if (!editor) {
      return;
    }
    if (mode !== "edit") {
      return;
    }
    if (value === lastEmittedRef.current) {
      return;
    }
    lastEmittedRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, mode, value]);

  // 中文：切回 edit 模式时也要确保内容是最新的 value（raw 模式可能改过）。
  // English: when re-entering edit mode, make sure the editor reflects the
  // latest value (raw mode may have changed it).
  const changeMode = useCallback(
    (next: EditorMode) => {
      if (next === "edit" && editor && value !== lastEmittedRef.current) {
        lastEmittedRef.current = value;
        editor.commands.setContent(value, { emitUpdate: false });
      }
      setMode(next);
    },
    [editor, value],
  );

  return { changeMode, editor, mode };
}
