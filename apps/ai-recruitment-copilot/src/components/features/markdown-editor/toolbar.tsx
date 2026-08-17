"use client";

import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconList,
  IconListNumbers,
} from "@tabler/icons-react";
// 中文：面向 prompt 写作场景的精简格式工具栏。
// English: compact formatting toolbar for prompt authoring.
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";
interface Props {
  editor: Editor | null;
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

export function MarkdownEditorToolbar({ editor, disabled }: Props) {
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
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-background px-3 py-1.5">
      <IconBtn
        aria-label="撤销"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <IconArrowBackUp className="size-4" />
      </IconBtn>
      <IconBtn
        aria-label="重做"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <IconArrowForwardUp className="size-4" />
      </IconBtn>
      <Divider />
      <IconBtn
        active={activeState?.bold}
        aria-label="粗体"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <IconBold className="size-4" />
      </IconBtn>
      <IconBtn
        active={activeState?.italic}
        aria-label="斜体"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <IconItalic className="size-4" />
      </IconBtn>
      <IconBtn
        active={activeState?.code}
        aria-label="行内代码"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      >
        <IconCode className="size-4" />
      </IconBtn>
      <Divider />
      <IconBtn
        active={activeState?.h1}
        aria-label="H1"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <IconH1 className="size-4" />
      </IconBtn>
      <IconBtn
        active={activeState?.h2}
        aria-label="H2"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <IconH2 className="size-4" />
      </IconBtn>
      <IconBtn
        active={activeState?.h3}
        aria-label="H3"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <IconH3 className="size-4" />
      </IconBtn>
      <Divider />
      <IconBtn
        active={activeState?.bulletList}
        aria-label="无序列表"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <IconList className="size-4" />
      </IconBtn>
      <IconBtn
        active={activeState?.orderedList}
        aria-label="有序列表"
        disabled={editDisabled}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <IconListNumbers className="size-4" />
      </IconBtn>
    </div>
  );
}
