// 中文：顶部工具栏。第一行是 编辑/预览/Raw 的 segmented 切换（三等分占满宽度）；
// 第二行仅在编辑模式渲染精简后的格式化按钮，针对 prompt 写作场景保留必需项。
// English: top toolbar. Row 1 is the edit/preview/raw segmented switcher
// (full-width, 3 equal cells). Row 2 (formatting) renders only in edit mode
// and is trimmed to what's actually useful for prompt authoring.
"use client";

import type { Editor } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  RedoIcon,
  UndoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";
import type { EditorMode } from "./use-markdown-editor";

interface Props {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  disabled?: boolean;
}

function IconBtn({
  active,
  children,
  ...rest
}: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      className={cn("size-7", active && "bg-muted")}
      size="icon"
      type="button"
      variant="ghost"
      {...rest}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span className="mx-1 h-4 w-px bg-border" />;
}

// 中文：模式标签映射。English: mode label map.
const MODE_LABELS: Record<EditorMode, string> = { edit: "编辑", preview: "预览", raw: "Raw" };
const MODES: readonly EditorMode[] = ["edit", "preview", "raw"];

export function MarkdownEditorToolbar({ editor, mode, onModeChange, disabled }: Props) {
  // 中文：格式化按钮在没有 editor 或外部禁用时不可用；mode 已经由外层条件渲染保证。
  // English: formatting buttons disabled when editor unmounted or externally disabled.
  const editDisabled = !editor || disabled;

  return (
    <div className="flex flex-col border-b bg-muted/30">
      <div className="grid grid-cols-3">
        {MODES.map((m) => (
          <button
            aria-pressed={mode === m}
            className={cn(
              "border-b-2 px-3 py-1.5 text-sm transition-colors",
              mode === m
                ? "border-primary bg-background font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-muted/50",
            )}
            key={m}
            onClick={() => onModeChange(m)}
            type="button"
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {mode === "edit" && (
        <div className="flex flex-wrap items-center gap-0.5 border-t px-2 py-1">
          <IconBtn
            aria-label="撤销"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <UndoIcon className="size-4" />
          </IconBtn>
          <IconBtn
            aria-label="重做"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <RedoIcon className="size-4" />
          </IconBtn>
          <Divider />
          <IconBtn
            active={editor?.isActive("bold")}
            aria-label="粗体"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("italic")}
            aria-label="斜体"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("code")}
            aria-label="行内代码"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <CodeIcon className="size-4" />
          </IconBtn>
          <Divider />
          <IconBtn
            active={editor?.isActive("heading", { level: 1 })}
            aria-label="H1"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1Icon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("heading", { level: 2 })}
            aria-label="H2"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2Icon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("heading", { level: 3 })}
            aria-label="H3"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3Icon className="size-4" />
          </IconBtn>
          <Divider />
          <IconBtn
            active={editor?.isActive("bulletList")}
            aria-label="无序列表"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("orderedList")}
            aria-label="有序列表"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrderedIcon className="size-4" />
          </IconBtn>
        </div>
      )}
    </div>
  );
}
