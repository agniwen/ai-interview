// 中文：选中文本时浮现的快捷格式工具栏，prompt 场景仅保留粗体/斜体/行内代码。
// English: floating formatting menu on selection — kept minimal (bold / italic
// / inline code) for the prompt-authoring use case.
"use client";

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { BoldIcon, CodeIcon, ItalicIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

function BubbleBtn({
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

export function MarkdownEditorBubbleMenu({ editor }: { editor: Editor | null }) {
  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      editor={editor}
    >
      <BubbleBtn
        active={editor.isActive("bold")}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <BoldIcon className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive("italic")}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive("code")}
        aria-label="行内代码"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon className="size-4" />
      </BubbleBtn>
    </BubbleMenu>
  );
}
