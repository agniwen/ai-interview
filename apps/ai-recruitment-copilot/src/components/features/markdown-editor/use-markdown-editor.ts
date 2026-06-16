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

  const lastEmittedRef = useRef<string>(value);

  const onChangeRef = useRef(onChange);
  const maxLengthRef = useRef(maxLength);
  useEffect(() => {
    onChangeRef.current = onChange;
    maxLengthRef.current = maxLength;
  });

  const editor = useEditor({
    content: value,
    editable: !disabled,
    extensions: createMarkdownExtensions({ placeholder }),
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      const md = readMarkdown(e);
      const max = maxLengthRef.current;
      if (typeof max === "number" && md.length > max) {
        e.commands.setContent(lastEmittedRef.current, { emitUpdate: false });
        return;
      }
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

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
