// 中文：选中文本时浮现的快捷格式工具栏。
// English: floating formatting menu that appears when text is selected.
"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, StrikethroughIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

function BubbleBtn({
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
        active={editor.isActive("strike")}
        aria-label="删除线"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <StrikethroughIcon className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive("code")}
        aria-label="行内代码"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <CodeIcon className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={editor.isActive("link")}
        aria-label="链接"
        onClick={() => {
          const previous = editor.getAttributes("link").href as string | undefined;
          // eslint-disable-next-line no-alert
          const url = window.prompt("链接地址", previous ?? "https://");
          if (url === null) {
            return;
          }
          if (url === "") {
            editor.chain().focus().unsetLink().run();
            return;
          }
          editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        <LinkIcon className="size-4" />
      </BubbleBtn>
    </BubbleMenu>
  );
}
