// 中文：对外暴露的 MarkdownEditor 受控组件，替换 <Textarea> 时只需替换标签。
// English: the public controlled MarkdownEditor component — drop-in replacement
// for <Textarea> for markdown prompt fields.
"use client";

import { EditorContent } from "@tiptap/react";
import { useCallback } from "react";
import { MarkdownView } from "@/components/markdown-view";
import { cn } from "@/lib/shared/utils";
import { MarkdownEditorBubbleMenu } from "./bubble-menu";
import { MarkdownEditorToolbar } from "./toolbar";
import { useMarkdownEditor } from "./use-markdown-editor";
import type { EditorMode } from "./use-markdown-editor";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  defaultMode?: EditorMode;
  className?: string;
  minHeight?: number;
  id?: string;
  "aria-invalid"?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  maxLength,
  disabled,
  defaultMode = "edit",
  className,
  minHeight = 240,
  id,
  "aria-invalid": ariaInvalid,
}: MarkdownEditorProps) {
  const { editor, mode, changeMode } = useMarkdownEditor({
    defaultMode,
    disabled,
    maxLength,
    onChange,
    placeholder,
    value,
  });

  const handleRawChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (typeof maxLength === "number" && next.length > maxLength) {
        return;
      }
      onChange(next);
    },
    [maxLength, onChange],
  );

  const over = typeof maxLength === "number" && value.length > maxLength;

  return (
    <div
      aria-invalid={ariaInvalid}
      className={cn(
        "flex flex-col overflow-hidden rounded-md border bg-background",
        "aria-[invalid=true]:border-destructive",
        disabled && "opacity-60",
        className,
      )}
      id={id}
    >
      <MarkdownEditorToolbar
        disabled={disabled}
        editor={editor}
        mode={mode}
        onModeChange={changeMode}
      />

      <div className="relative" style={{ minHeight }}>
        {mode === "edit" && (
          <>
            <EditorContent
              className={cn(
                "prose-sm h-full min-h-[inherit] px-3 py-2 text-sm outline-none",
                "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
              )}
              editor={editor}
              onBlur={onBlur}
            />
            <MarkdownEditorBubbleMenu editor={editor} />
          </>
        )}

        {mode === "preview" && (
          <div className="px-3 py-2 text-sm">
            <MarkdownView content={value} />
          </div>
        )}

        {mode === "raw" && (
          <textarea
            className="block h-full w-full resize-none border-0 bg-transparent px-3 py-2 font-mono text-sm outline-none"
            disabled={disabled}
            onBlur={onBlur}
            onChange={handleRawChange}
            placeholder={placeholder}
            style={{ minHeight }}
            value={value}
          />
        )}
      </div>

      {typeof maxLength === "number" && (
        <div
          className={cn(
            "flex justify-end border-t px-3 py-1 text-xs",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  );
}
