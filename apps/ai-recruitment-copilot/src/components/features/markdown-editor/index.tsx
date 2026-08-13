// 中文：对外暴露的 MarkdownEditor 受控组件，替换 <Textarea> 时只需替换标签。
// English: the public controlled MarkdownEditor component — drop-in replacement
// for <Textarea> for markdown prompt fields.
"use client";

import { EditorContent } from "@tiptap/react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";
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
  height?: number;
  id?: string;
  showPreview?: boolean;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
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
  height,
  id,
  showPreview = true,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const { changeMode, editor, mode } = useMarkdownEditor({
    defaultMode,
    disabled,
    maxLength,
    onChange,
    placeholder,
    value,
  });
  const visibleMode = showPreview ? mode : "edit";

  const over = typeof maxLength === "number" && value.length > maxLength;

  return (
    <div
      aria-invalid={ariaInvalid}
      aria-label={ariaLabel}
      className={cn(
        cossFieldSurfaceClass,
        "flex flex-col overflow-hidden",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-destructive/20 aria-[invalid=true]:shadow-none aria-[invalid=true]:before:shadow-none dark:aria-[invalid=true]:ring-destructive/40",
        disabled && "opacity-60",
        className,
      )}
      id={id}
    >
      <div className="relative z-10">
        <MarkdownEditorToolbar
          disabled={disabled}
          editor={editor}
          mode={visibleMode}
          onModeChange={changeMode}
          showModeSwitcher={showPreview}
        />
      </div>

      <div
        className={cn(
          "relative z-10 bg-transparent",
          typeof height === "number" && "overflow-y-auto",
        )}
        style={typeof height === "number" ? { height } : { minHeight }}
      >
        {visibleMode === "edit" && (
          <>
            <EditorContent className={editorContentClassName} editor={editor} onBlur={onBlur} />
            <MarkdownEditorBubbleMenu editor={editor} />
          </>
        )}

        {visibleMode === "preview" && (
          <div className="px-3 py-2 text-sm">
            <MarkdownView content={value} />
          </div>
        )}
      </div>

      {typeof maxLength === "number" && (
        <div
          className={cn(
            "relative z-10 flex justify-end border-t bg-transparent px-3 py-1.5 text-xs",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  );
}
