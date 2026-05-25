// 中文：顶部工具栏。第一行始终展示 编辑/预览/Raw 模式切换；
// 第二行仅在编辑模式渲染格式化按钮（预览与 Raw 不需要）。
// English: top toolbar. Row 1 always shows the edit/preview/raw mode tabs;
// row 2 (formatting buttons) renders only in edit mode.
"use client";

import type { Editor } from "@tiptap/react";
import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  RedoIcon,
  SquareCodeIcon,
  StrikethroughIcon,
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

export function MarkdownEditorToolbar({ editor, mode, onModeChange, disabled }: Props) {
  // 中文：格式化按钮在没有 editor 或外部禁用时不可用；mode 已经由外层条件渲染保证。
  // English: formatting buttons disabled when editor unmounted or externally disabled.
  const editDisabled = !editor || disabled;

  return (
    <div className="flex flex-col border-b bg-muted/30">
      <div className="flex justify-end px-2 py-1">
        <div className="flex items-center gap-0 rounded-md border bg-background p-0.5">
          {(["edit", "preview", "raw"] as const).map((m) => (
            <button
              aria-pressed={mode === m}
              className={cn(
                "rounded px-2 py-0.5 text-xs",
                mode === m ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50",
              )}
              key={m}
              onClick={() => onModeChange(m)}
              type="button"
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
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
            active={editor?.isActive("strike")}
            aria-label="删除线"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <StrikethroughIcon className="size-4" />
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
          <IconBtn
            active={editor?.isActive("blockquote")}
            aria-label="引用"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          >
            <QuoteIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("codeBlock")}
            aria-label="代码块"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
          >
            <SquareCodeIcon className="size-4" />
          </IconBtn>
          <IconBtn
            active={editor?.isActive("link")}
            aria-label="链接"
            disabled={editDisabled}
            onClick={() => {
              const previous = editor?.getAttributes("link").href as string | undefined;
              // eslint-disable-next-line no-alert
              const url = window.prompt("链接地址", previous ?? "https://");
              if (url === null) {
                return;
              }
              if (url === "") {
                editor?.chain().focus().unsetLink().run();
                return;
              }
              editor?.chain().focus().setLink({ href: url }).run();
            }}
          >
            <LinkIcon className="size-4" />
          </IconBtn>
          <IconBtn
            aria-label="分隔线"
            disabled={editDisabled}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          >
            <MinusIcon className="size-4" />
          </IconBtn>
        </div>
      )}
    </div>
  );
}
