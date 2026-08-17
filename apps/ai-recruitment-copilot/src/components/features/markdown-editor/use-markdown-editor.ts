// 中文：Markdown 字符串是唯一真相源，Tiptap 实例是它的所见即所得视图。
// English: the markdown string is the source of truth; Tiptap is its WYSIWYG view.
"use client";

import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createMarkdownExtensions } from "./extensions";

function readMarkdown(editor: Editor): string {
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

interface Options {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}

export function useMarkdownEditor({ value, onChange, maxLength, placeholder, disabled }: Options) {
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
    if (value === lastEmittedRef.current) {
      return;
    }
    lastEmittedRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  return { editor };
}
