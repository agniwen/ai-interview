"use client";

import { IconBold, IconCode, IconItalic } from "@tabler/icons-react";
// 中文：选中文本时浮现的快捷格式工具栏，prompt 场景仅保留粗体/斜体/行内代码。
// English: floating formatting menu on selection — kept minimal (bold / italic
// / inline code) for the prompt-authoring use case.
import { useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";

import { Button } from "@/components/ui/button";
import { cn } from "@arc/shared/utils";

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
  // 中文：Tiptap v3 默认不重渲染，用 useEditorState 订阅 active 状态。
  // 注意 hook 必须在 early return 之前调用。
  // English: Tiptap v3 doesn't auto-rerender — subscribe via useEditorState.
  // Hook must run before any early return.
  const activeState = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      code: e?.isActive("code") ?? false,
      italic: e?.isActive("italic") ?? false,
    }),
  });

  if (!editor) {
    return null;
  }

  return (
    <BubbleMenu
      className="flex items-center gap-0.5 rounded-md border bg-popover p-1 shadow-md"
      editor={editor}
    >
      <BubbleBtn
        active={activeState?.bold}
        aria-label="粗体"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <IconBold className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={activeState?.italic}
        aria-label="斜体"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <IconItalic className="size-4" />
      </BubbleBtn>
      <BubbleBtn
        active={activeState?.code}
        aria-label="行内代码"
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <IconCode className="size-4" />
      </BubbleBtn>
    </BubbleMenu>
  );
}
