// 中文：对外暴露的 MarkdownEditor 受控组件，替换 <Textarea> 时只需替换标签。
// English: the public controlled MarkdownEditor component — drop-in replacement
// for <Textarea> for markdown prompt fields.
"use client";

import { EditorContent } from "@tiptap/react";
import { useCallback } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { cn } from "@arc/shared/utils";
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

      <div className="relative bg-background dark:bg-input/30" style={{ minHeight }}>
        {mode === "edit" && (
          <>
            <EditorContent
              className={cn(
                "h-full min-h-[inherit] px-3 py-2 text-sm outline-none",
                "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
                // 中文：覆盖浏览器 UA 的标题大小，与 MarkdownView 预览侧保持一致。
                // English: override browser UA heading sizes; keep parity with
                // the preview-side MarkdownView typography.
                "[&_.ProseMirror_p]:my-2 [&_.ProseMirror_p]:leading-relaxed",
                "[&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:text-lg",
                "[&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:text-base",
                "[&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-[15px]",
                "[&_.ProseMirror_strong]:font-semibold",
                "[&_.ProseMirror_em]:italic",
                "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.85em]",
                // 中文：编辑模式下我们用 markdown-markers 自己渲染 "- " / "1. "，
                // 关掉浏览器自带的 bullet/number 避免双重显示；保留 pl-5 缩进。
                // English: in edit mode we render "- " / "1. " ourselves via
                // markdown-markers, so suppress the UA bullet/number to avoid
                // double markers; keep pl-5 for the indent.
                "[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-none [&_.ProseMirror_ul]:pl-5",
                "[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-none [&_.ProseMirror_ol]:pl-5",
                "[&_.ProseMirror_li]:my-0.5",
                // Placeholder pseudo-element styling.
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
            aria-label="Markdown 原始内容"
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
            "flex justify-end border-t bg-background px-3 py-1.5 text-xs dark:bg-input/30",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  );
}
