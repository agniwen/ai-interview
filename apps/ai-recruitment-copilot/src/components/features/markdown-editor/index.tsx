// 中文：对外暴露的 MarkdownEditor 受控所见即所得组件。界面编辑富文本，
// 对外仍读写 Markdown 字符串，因此现有表单和持久化格式无需迁移。
// English: controlled WYSIWYG editor backed by markdown strings so existing
// forms and persistence require no migration.
"use client";

import { EditorContent } from "@tiptap/react";
import { cossFieldSurfaceClass } from "@/components/ui/coss-style";
import { cn } from "@arc/shared/utils";
import { MarkdownEditorBubbleMenu } from "./bubble-menu";
import { MarkdownEditorToolbar } from "./toolbar";
import { useMarkdownEditor } from "./use-markdown-editor";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
  minHeight?: number;
  height?: number;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-label"?: string;
}

const editorContentClassName = cn(
  "h-full min-h-[inherit] px-3 py-2 text-sm outline-none",
  "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
  "[&_.ProseMirror_p]:my-2 [&_.ProseMirror_p]:leading-7",
  "[&_.ProseMirror_h1]:mt-5 [&_.ProseMirror_h1]:mb-2 [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:tracking-tight",
  "[&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:tracking-tight",
  "[&_.ProseMirror_h3]:mt-3 [&_.ProseMirror_h3]:mb-1 [&_.ProseMirror_h3]:font-semibold [&_.ProseMirror_h3]:text-lg",
  "[&_.ProseMirror_strong]:font-semibold",
  "[&_.ProseMirror_em]:italic",
  "[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:font-mono [&_.ProseMirror_code]:text-[0.85em]",
  "[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6",
  "[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6",
  "[&_.ProseMirror_li]:my-1 [&_.ProseMirror_li_p]:my-0",
  "[&_.ProseMirror_blockquote]:my-3 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground",
  "[&_.ProseMirror_hr]:my-5 [&_.ProseMirror_hr]:border-border",
  "[&_.ProseMirror_pre]:my-3 [&_.ProseMirror_pre]:overflow-x-auto [&_.ProseMirror_pre]:rounded-md [&_.ProseMirror_pre]:bg-muted [&_.ProseMirror_pre]:p-3 [&_.ProseMirror_pre]:font-mono [&_.ProseMirror_pre]:text-sm",
  "[&_.ProseMirror_pre_code]:bg-transparent [&_.ProseMirror_pre_code]:p-0 [&_.ProseMirror_pre_code]:text-[inherit]",
  "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:underline-offset-4",
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
  className,
  minHeight = 240,
  height,
  id,
  "aria-invalid": ariaInvalid,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const { editor } = useMarkdownEditor({
    disabled,
    maxLength,
    onChange,
    placeholder,
    value,
  });
  const over = maxLength !== undefined && value.length > maxLength;

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
        <MarkdownEditorToolbar disabled={disabled} editor={editor} />
      </div>

      <div
        className={cn("relative z-10 min-h-0 flex-1 bg-transparent overflow-y-auto")}
        style={{ minHeight: height ?? minHeight }}
      >
        <EditorContent className={editorContentClassName} editor={editor} onBlur={onBlur} />
        <MarkdownEditorBubbleMenu editor={editor} />
      </div>

      {maxLength !== undefined && (
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
