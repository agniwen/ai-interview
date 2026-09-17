// 中文：Markdown 字符串是唯一真相源，Tiptap 实例是它的所见即所得视图。
// English: the markdown string is the source of truth; Tiptap is its WYSIWYG view.
"use client";

import { useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { createMarkdownExtensions } from "./extensions";
import { readMarkdown } from "./markdown-io";

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
      if (max !== undefined && md.length > max) {
        e.commands.setContent(lastEmittedRef.current, { emitUpdate: false });
        return;
      }
      lastEmittedRef.current = md;
      onChangeRef.current(md);
    },
    shouldRerenderOnTransaction: false,
  });

  useEffect(() => {
    // 切换只读状态不属于内容编辑，避免触发表单未保存提示。
    editor?.setEditable(!disabled, false);
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
