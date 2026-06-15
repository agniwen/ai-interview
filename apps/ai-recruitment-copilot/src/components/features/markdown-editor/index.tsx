// 中文：对外暴露的 MarkdownEditor 受控组件，上编辑/代码、下实时预览。
// English: controlled MarkdownEditor — top edit/code pane, bottom live preview.
"use client";

import { EditorContent } from "@tiptap/react";
import { useCallback } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Button } from "@/components/ui/button";
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
  defaultMode?: EditorMode | "preview";
  className?: string;
  minHeight?: number;
  id?: string;
  "aria-invalid"?: boolean;
}

const editorContentClassName = cn(
  "h-full min-h-[inherit] px-3 py-2 text-sm outline-none",
  "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
  "[&_.ProseMirror_p]:my-2 [&_.ProseMirror_p]:leading-relaxed",
  "[&_.ProseMirror_h1]:mt-3 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:text-lg",
  "[&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:text-base",
  "[&_.ProseMirror_h3]:mt-2 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-[15px]",
  "[&_.ProseMirror_strong]:font-semibold",
  "[&_.ProseMirror_em]:italic",
  "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.85em]",
  "[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-none [&_.ProseMirror_ul]:pl-5",
  "[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-none [&_.ProseMirror_ol]:pl-5",
  "[&_.ProseMirror_li]:my-0.5",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
  "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
);

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
  const { editor, mode, toggleCodeMode } = useMarkdownEditor({
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
  const isCodeMode = mode === "raw";

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
      {mode === "edit" ? <MarkdownEditorToolbar disabled={disabled} editor={editor} /> : null}

      <div className="flex min-h-0 flex-col divide-y">
        <div className="flex flex-col bg-background dark:bg-input/30">
          <div className="flex shrink-0 items-center justify-between border-b bg-muted/20 px-3 py-1.5">
            <span className="font-medium text-muted-foreground text-xs">
              {isCodeMode ? "代码" : "内容"}
            </span>
            <Button
              aria-pressed={isCodeMode}
              className={cn("h-7 px-2 text-xs", isCodeMode && "bg-primary/10 text-primary")}
              disabled={disabled}
              onClick={toggleCodeMode}
              type="button"
              variant="ghost"
            >
              {isCodeMode ? "切换为可视化" : "切换为代码"}
            </Button>
          </div>

          <div
            className="relative overflow-y-auto"
            style={{ minHeight: Math.round(minHeight * 0.6) }}
          >
            {mode === "edit" ? (
              <>
                <EditorContent className={editorContentClassName} editor={editor} onBlur={onBlur} />
                <MarkdownEditorBubbleMenu editor={editor} />
              </>
            ) : (
              <textarea
                aria-label="Markdown 原始内容"
                className="block h-full min-h-[inherit] w-full resize-none border-0 bg-transparent px-3 py-2 font-mono text-sm outline-none"
                disabled={disabled}
                onBlur={onBlur}
                onChange={handleRawChange}
                placeholder={placeholder}
                style={{ minHeight: Math.round(minHeight * 0.6) }}
                value={value}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col bg-muted/15">
          <div className="shrink-0 border-b bg-muted/20 px-3 py-1.5">
            <span className="font-medium text-muted-foreground text-xs">预览</span>
          </div>
          <div
            className="overflow-y-auto px-3 py-2 text-sm"
            style={{ minHeight: Math.round(minHeight * 0.4) }}
          >
            {value.trim() ? (
              <MarkdownView content={value} />
            ) : (
              <p className="text-muted-foreground text-xs">输入内容后将在此实时预览。</p>
            )}
          </div>
        </div>
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
