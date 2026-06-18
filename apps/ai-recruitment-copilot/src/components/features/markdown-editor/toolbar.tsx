// 中文：顶部工具栏。第一行是 编辑/预览/Raw 的 segmented 切换（三等分占满宽度）；
// 第二行仅在编辑模式渲染精简后的格式化按钮，针对 prompt 写作场景保留必需项。
// English: top toolbar. Row 1 is the edit/preview/raw segmented switcher
// (full-width, 3 equal cells). Row 2 (formatting) renders only in edit mode
// and is trimmed to what's actually useful for prompt authoring.
"use client";

import { useEditorState } from "@tiptap/react";
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
} from "@/components/icons/hugeicons";
import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
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
      className={cn(
        "size-7",
        active && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
      )}
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

const MODE_LABELS: Record<EditorMode, string> = { edit: "编辑", preview: "预览", raw: "Raw" };
const MODES: readonly EditorMode[] = ["edit", "preview", "raw"];

export function MarkdownEditorToolbar({ editor, mode, onModeChange, disabled }: Props) {
  const editDisabled = !editor || disabled;

  const activeState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      bulletList: e?.isActive("bulletList") ?? false,
      code: e?.isActive("code") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      italic: e?.isActive("italic") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
    }),
  });

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
        <div className="flex flex-wrap items-center gap-0.5 border-t px-3 py-1.5">
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
            active={activeState?.bold}
            aria-label="粗体"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <BoldIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={activeState?.italic}
            aria-label="斜体"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <ItalicIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={activeState?.code}
            aria-label="行内代码"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <CodeIcon className="size-4" />
          </IconBtn>
          <Divider />
          <IconBtn
            active={activeState?.h1}
            aria-label="H1"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1Icon className="size-4" />
          </IconBtn>
          <IconBtn
            active={activeState?.h2}
            aria-label="H2"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2Icon className="size-4" />
          </IconBtn>
          <IconBtn
            active={activeState?.h3}
            aria-label="H3"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3Icon className="size-4" />
          </IconBtn>
          <Divider />
          <IconBtn
            active={activeState?.bulletList}
            aria-label="无序列表"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <ListIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={activeState?.orderedList}
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
