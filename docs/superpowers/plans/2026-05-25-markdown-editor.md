# Markdown Editor (Tiptap) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<Textarea>` in 5 prompt-editing forms with a Tiptap-based WYSIWYG editor that supports three modes (edit / preview / raw) and stores standard markdown directly into existing `text` columns.

**Architecture:** A single controlled React component `<MarkdownEditor value onChange ... />` whose value is a markdown string. Internal Tiptap instance is just one of three "views" over that string; preview reuses `MarkdownView`; raw is a plain textarea. Mode switching re-feeds the Tiptap instance via `setContent(md)`. No DB / API / Zod schema changes.

**Tech Stack:** Tiptap v3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`), `tiptap-markdown` (markdown serializer/parser), `react-markdown` (already installed, for preview).

**Spec:** `docs/superpowers/specs/2026-05-25-markdown-editor-design.md`

---

## File Structure

**New files:**

- `apps/ai-recruitment-copilot/src/components/markdown-editor/index.tsx` — exported `MarkdownEditor` (the controlled component)
- `apps/ai-recruitment-copilot/src/components/markdown-editor/extensions.ts` — Tiptap extensions array factory
- `apps/ai-recruitment-copilot/src/components/markdown-editor/markdown-io.ts` — headless `serializeToMarkdown(doc)` / `parseFromMarkdown(md)` helpers used by both the component and tests
- `apps/ai-recruitment-copilot/src/components/markdown-editor/use-markdown-editor.ts` — hook wrapping `useEditor` + the mode/sync state machine
- `apps/ai-recruitment-copilot/src/components/markdown-editor/toolbar.tsx` — fixed top toolbar + 3-mode tab
- `apps/ai-recruitment-copilot/src/components/markdown-editor/bubble-menu.tsx` — selection-triggered floating menu
- `apps/ai-recruitment-copilot/src/components/markdown-editor/__tests__/markdown-io.test.ts` — round-trip tests (runs in node)

**Modified files:**

- `apps/ai-recruitment-copilot/package.json` — add 6 deps
- `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviewers/_components/interviewer-form-dialog.tsx` — lines 247–260
- `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/job-descriptions/_components/job-description-form-dialog.tsx` — lines 360–376
- `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/global-config/_components/global-config-form.tsx` — lines 103–157 (3 fields)

---

## Task 1: Install dependencies

**Files:**

- Modify: `apps/ai-recruitment-copilot/package.json`

- [ ] **Step 1: Add deps**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot add \
  @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-link @tiptap/extension-placeholder \
  tiptap-markdown
```

- [ ] **Step 2: Verify lockfile + types resolve**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: passes (no changes yet to source, just installs the deps).

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot/package.json pnpm-lock.yaml
git commit -m "chore(web): add tiptap + tiptap-markdown deps"
```

---

## Task 2: Headless markdown I/O utility (with tests)

This is the core round-trip layer used by both the editor and the tests. It lives outside React so we can unit-test it in vitest's node env.

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/extensions.ts`
- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/markdown-io.ts`
- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/__tests__/markdown-io.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/__tests__/markdown-io.test.ts`:

````ts
// 中文：markdown 序列化 / 反序列化的 round-trip 单元测试。
// English: round-trip unit tests for the markdown I/O helpers.
import { describe, expect, it } from "vitest";
import { parseFromMarkdown, serializeToMarkdown } from "../markdown-io";

describe("markdown-io", () => {
  it("parses heading and bold then serializes back", () => {
    const md = "# 标题\n\n**粗体** 文本";
    const doc = parseFromMarkdown(md);
    const out = serializeToMarkdown(doc);
    expect(out).toContain("# 标题");
    expect(out).toContain("**粗体**");
  });

  it("round-trips a bullet list without losing items", () => {
    const md = "- a\n- b\n- c\n";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("- a");
    expect(out).toContain("- b");
    expect(out).toContain("- c");
  });

  it("preserves plain text with line breaks (legacy data)", () => {
    const md = "第一行\n第二行\n第三行";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out.trim()).toBe(md.trim());
  });

  it("round-trips a fenced code block", () => {
    const md = "```\nconst x = 1;\n```\n";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("```");
    expect(out).toContain("const x = 1;");
  });

  it("round-trips a link", () => {
    const md = "see [here](https://example.com)";
    const out = serializeToMarkdown(parseFromMarkdown(md));
    expect(out).toContain("[here](https://example.com)");
  });

  it("handles empty input", () => {
    expect(serializeToMarkdown(parseFromMarkdown(""))).toBe("");
  });
});
````

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test src/components/markdown-editor
```

Expected: FAIL — `parseFromMarkdown` / `serializeToMarkdown` not found.

- [ ] **Step 3: Write `extensions.ts`**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/extensions.ts`:

```ts
// 中文：Tiptap 扩展集合，仅启用标准 markdown 支持的节点 / 标记。
// English: Tiptap extensions limited to nodes/marks that map to standard markdown.
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { Extensions } from "@tiptap/core";
import { Markdown } from "tiptap-markdown";

export function createMarkdownExtensions(opts?: { placeholder?: string }): Extensions {
  return [
    StarterKit.configure({
      // 中文：StarterKit 默认开启的节点已覆盖标准 markdown。这里保留默认即可。
      // English: StarterKit defaults already cover standard markdown nodes.
    }),
    Link.configure({
      autolink: true,
      openOnClick: false,
      HTMLAttributes: {
        rel: "noopener noreferrer",
        target: "_blank",
      },
    }),
    Placeholder.configure({
      placeholder: opts?.placeholder ?? "",
    }),
    Markdown.configure({
      html: false,
      tightLists: true,
      linkify: true,
      breaks: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ];
}
```

- [ ] **Step 4: Write `markdown-io.ts`**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/markdown-io.ts`:

```ts
// 中文：用一个临时 Editor 实例完成 markdown <-> ProseMirror 的双向转换，
// 与 React 解耦，方便在 node 环境下单测。
// English: use a throwaway headless Editor for markdown <-> ProseMirror
// conversion. Decoupled from React so it can be unit-tested in node.
import { Editor } from "@tiptap/core";
import { createMarkdownExtensions } from "./extensions";

// 中文：返回 markdown 反序列化后的 ProseMirror JSON 文档。
// English: returns the ProseMirror JSON doc parsed from markdown.
export function parseFromMarkdown(markdown: string) {
  const editor = new Editor({
    extensions: createMarkdownExtensions(),
    content: markdown,
  });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

// 中文：把 ProseMirror JSON 文档序列化回 markdown 字符串。
// English: serializes a ProseMirror JSON doc back to markdown.
export function serializeToMarkdown(doc: unknown): string {
  const editor = new Editor({
    extensions: createMarkdownExtensions(),
    content: doc as Parameters<Editor["commands"]["setContent"]>[0],
  });
  // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown 注入的 storage 类型未导出
  const md = (editor.storage as any).markdown.getMarkdown() as string;
  editor.destroy();
  return md;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test src/components/markdown-editor
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/markdown-editor/
git commit -m "feat(markdown-editor): add headless markdown I/O helpers + tests"
```

---

## Task 3: `useMarkdownEditor` hook

State machine that owns: current mode, Tiptap editor instance, and the rule "only `setContent(md)` when re-entering edit mode or when external value changes while NOT in edit mode".

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/use-markdown-editor.ts`

- [ ] **Step 1: Implement the hook**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/use-markdown-editor.ts`:

```ts
// 中文：MarkdownEditor 的核心同步逻辑。Markdown 字符串是唯一真相源，
// Tiptap 实例只是它的一个"视图"；切回 edit 模式时才 setContent 重建。
// English: the sync logic for MarkdownEditor. The markdown string is the single
// source of truth; the Tiptap instance is just one view over it. We only
// setContent when re-entering edit mode or syncing an external value.
"use client";

import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMarkdownExtensions } from "./extensions";

export type EditorMode = "edit" | "preview" | "raw";

type Options = {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  defaultMode?: EditorMode;
};

export function useMarkdownEditor({
  value,
  onChange,
  maxLength,
  placeholder,
  disabled,
  defaultMode = "edit",
}: Options) {
  const [mode, setMode] = useState<EditorMode>(defaultMode);

  // 中文：标记最近一次 onChange 是否由编辑器自己触发，避免回灌时光标跳动。
  // English: tracks whether the most recent onChange came from the editor
  // itself, so we don't re-feed it via setContent.
  const lastEmittedRef = useRef<string>(value);

  const editor = useEditor({
    extensions: createMarkdownExtensions({ placeholder }),
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      const md = readMarkdown(e);
      if (typeof maxLength === "number" && md.length > maxLength) {
        // 中文：超长时回滚为上一次合法值（强制阻断输入）。
        // English: roll back to the last valid value when exceeding maxLength.
        e.commands.setContent(lastEmittedRef.current, { emitUpdate: false });
        return;
      }
      lastEmittedRef.current = md;
      onChange(md);
    },
  });

  // 中文：外部 value 与编辑器内部不同步时（如表单 reset、模式切换回 edit），
  // 用 setContent 重建一次。
  // English: when external value diverges from the editor's, rebuild via
  // setContent (e.g. form reset, switching back to edit mode).
  useEffect(() => {
    if (!editor) return;
    if (mode !== "edit") return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, mode, value]);

  // 中文：切回 edit 模式时也要确保内容是最新的 value（raw 模式可能改过）。
  // English: when re-entering edit mode, make sure the editor reflects the
  // latest value (raw mode may have changed it).
  const changeMode = useCallback(
    (next: EditorMode) => {
      if (next === "edit" && editor && value !== lastEmittedRef.current) {
        lastEmittedRef.current = value;
        editor.commands.setContent(value, { emitUpdate: false });
      }
      setMode(next);
    },
    [editor, value],
  );

  return { editor, mode, changeMode };
}

function readMarkdown(editor: Editor): string {
  // biome-ignore lint/suspicious/noExplicitAny: tiptap-markdown 注入的 storage 类型未导出
  return (editor.storage as any).markdown.getMarkdown() as string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/markdown-editor/use-markdown-editor.ts
git commit -m "feat(markdown-editor): add useMarkdownEditor sync hook"
```

---

## Task 4: Toolbar (fixed top bar + mode tabs)

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/toolbar.tsx`

- [ ] **Step 1: Implement the toolbar**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/toolbar.tsx`:

```tsx
// 中文：固定顶部工具栏 + 右侧的 编辑 / 预览 / Raw 模式切换。
// English: fixed top toolbar plus edit / preview / raw mode tabs on the right.
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

type Props = {
  editor: Editor | null;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  disabled?: boolean;
};

export function MarkdownEditorToolbar({ editor, mode, onModeChange, disabled }: Props) {
  const editDisabled = mode !== "edit" || !editor || disabled;

  return (
    <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-2 py-1">
      <div className="flex flex-wrap items-center gap-0.5">
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
            const url = window.prompt("链接地址", previous ?? "https://");
            if (url === null) return;
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
            {m === "edit" ? "编辑" : m === "preview" ? "预览" : "Raw"}
          </button>
        ))}
      </div>
    </div>
  );
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
```

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: passes. If any lucide icon name doesn't exist in this version, replace with the closest available icon (`StrikethroughIcon` → `Strikethrough`, etc., based on actual exports).

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/markdown-editor/toolbar.tsx
git commit -m "feat(markdown-editor): add toolbar with mode tabs"
```

---

## Task 5: Bubble menu (selection-triggered)

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/bubble-menu.tsx`

- [ ] **Step 1: Implement**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/bubble-menu.tsx`:

```tsx
// 中文：选中文本时浮现的快捷格式工具栏。
// English: floating formatting menu that appears when text is selected.
"use client";

import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, StrikethroughIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

export function MarkdownEditorBubbleMenu({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

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
          const url = window.prompt("链接地址", previous ?? "https://");
          if (url === null) return;
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
```

- [ ] **Step 2: Verify**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

If `@tiptap/react/menus` is not the correct subpath in the installed v3, fall back to `@tiptap/react` direct import (check the actual package exports via `node -e "console.log(Object.keys(require('@tiptap/react')))"`).

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/markdown-editor/bubble-menu.tsx
git commit -m "feat(markdown-editor): add selection bubble menu"
```

---

## Task 6: Public `<MarkdownEditor>` component

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/markdown-editor/index.tsx`

- [ ] **Step 1: Implement**

Create `apps/ai-recruitment-copilot/src/components/markdown-editor/index.tsx`:

```tsx
// 中文：对外暴露的 MarkdownEditor 受控组件，替换 <Textarea> 时只需替换标签。
// English: the public controlled MarkdownEditor component — drop-in replacement
// for <Textarea> for markdown prompt fields.
"use client";

import { EditorContent } from "@tiptap/react";
import { useCallback } from "react";
import { MarkdownView } from "@/components/markdown-view";
import { cn } from "@/lib/shared/utils";
import { MarkdownEditorBubbleMenu } from "./bubble-menu";
import { MarkdownEditorToolbar } from "./toolbar";
import { type EditorMode, useMarkdownEditor } from "./use-markdown-editor";

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  defaultMode?: EditorMode;
  className?: string;
  minHeight?: number;
  id?: string;
  "aria-invalid"?: boolean;
};

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
  const { editor, mode, changeMode } = useMarkdownEditor({
    value,
    onChange,
    maxLength,
    placeholder,
    disabled,
    defaultMode,
  });

  const handleRawChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      if (typeof maxLength === "number" && next.length > maxLength) return;
      onChange(next);
    },
    [maxLength, onChange],
  );

  const over = typeof maxLength === "number" && value.length > maxLength;

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
      <MarkdownEditorToolbar
        disabled={disabled}
        editor={editor}
        mode={mode}
        onModeChange={changeMode}
      />

      <div className="relative" style={{ minHeight }}>
        {mode === "edit" && (
          <>
            <EditorContent
              className={cn(
                "prose-sm h-full min-h-[inherit] px-3 py-2 text-sm outline-none",
                "[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground",
                "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
              )}
              editor={editor}
              onBlur={onBlur}
            />
            <MarkdownEditorBubbleMenu editor={editor} />
          </>
        )}

        {mode === "preview" && (
          <div className="px-3 py-2 text-sm">
            <MarkdownView content={value} />
          </div>
        )}

        {mode === "raw" && (
          <textarea
            className="block h-full w-full resize-none border-0 bg-transparent px-3 py-2 font-mono text-sm outline-none"
            disabled={disabled}
            onBlur={onBlur}
            onChange={handleRawChange}
            placeholder={placeholder}
            style={{ minHeight }}
            value={value}
          />
        )}
      </div>

      {typeof maxLength === "number" && (
        <div
          className={cn(
            "flex justify-end border-t px-3 py-1 text-xs",
            over ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {value.length.toLocaleString()} / {maxLength.toLocaleString()}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: passes.

- [ ] **Step 3: Build smoke check**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot build
```

Expected: passes (no SSR / "document is not defined" errors thanks to `immediatelyRender: false` + `"use client"`).

- [ ] **Step 4: Commit**

```bash
git add apps/ai-recruitment-copilot/src/components/markdown-editor/index.tsx
git commit -m "feat(markdown-editor): add public MarkdownEditor component"
```

---

## Task 7: Replace interviewer prompt textarea

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviewers/_components/interviewer-form-dialog.tsx` (lines 247–260)

- [ ] **Step 1: Replace the field block**

In `interviewer-form-dialog.tsx`, replace the block at lines 246–260 (the `<div className="relative">` containing `<Textarea>` and `<TextareaCounter>`) with:

```tsx
<FieldContent className="gap-2">
  <MarkdownEditor
    aria-invalid={!!errors?.length}
    id={field.name}
    maxLength={PROMPT_MAX_LENGTH}
    onBlur={field.handleBlur}
    onChange={field.handleChange}
    placeholder="你是一位资深的后端技术面试官……（描述面试官人设、风格、关注点）"
    value={field.state.value}
  />
  <FieldError errors={errors} />
</FieldContent>
```

Add the import at the top of the file:

```tsx
import { MarkdownEditor } from "@/components/markdown-editor";
```

Remove the now-unused `Textarea` and `TextareaCounter` imports IF they're not used elsewhere in this file. (Search the file for other occurrences first.)

- [ ] **Step 2: Verify typecheck + build**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/interviewers/_components/interviewer-form-dialog.tsx
git commit -m "feat(interviewers): use MarkdownEditor for prompt field"
```

---

## Task 8: Replace job-description prompt textarea

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/job-descriptions/_components/job-description-form-dialog.tsx` (lines 360–376)

- [ ] **Step 1: Replace the field block**

In `job-description-form-dialog.tsx`, replace the inner block at lines 359–376 with:

```tsx
<FieldContent className="gap-2">
  <MarkdownEditor
    aria-invalid={!!errors?.length}
    id={field.name}
    maxLength={PROMPT_MAX_LENGTH}
    onBlur={field.handleBlur}
    onChange={field.handleChange}
    placeholder="岗位关键职责、技术栈要求、期望的考察维度……"
    value={field.state.value}
  />
  <FieldError errors={errors} />
</FieldContent>
```

Add import:

```tsx
import { MarkdownEditor } from "@/components/markdown-editor";
```

Remove `Textarea` / `TextareaCounter` imports only if unused elsewhere in this file (the file has another field above using `Textarea` for `description` — keep those imports).

- [ ] **Step 2: Verify typecheck**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/job-descriptions/_components/job-description-form-dialog.tsx
git commit -m "feat(job-descriptions): use MarkdownEditor for prompt field"
```

---

## Task 9: Replace global-config three textareas

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/global-config/_components/global-config-form.tsx` (lines 103–157)

- [ ] **Step 1: Replace `opening` field (lines 103–119)**

Replace the `<Field>` block for `opening` with:

```tsx
<Field>
  <FieldLabel htmlFor="opening">开场白 prompt</FieldLabel>
  <MarkdownEditor
    disabled={pending}
    id="opening"
    maxLength={PROMPT_MAX_LENGTH}
    onChange={setOpening}
    placeholder='例如：用候选人的名字"{候选人姓名}"打招呼，介绍你是 XX 公司"{岗位}"的面试官…'
    value={opening}
  />
  <PlaceholderDescription />
</Field>
```

- [ ] **Step 2: Replace `closing` field (lines 121–137)**

Replace the `<Field>` block for `closing` with:

```tsx
<Field>
  <FieldLabel htmlFor="closing">结束语 prompt</FieldLabel>
  <MarkdownEditor
    disabled={pending}
    id="closing"
    maxLength={PROMPT_MAX_LENGTH}
    onChange={setClosing}
    placeholder="例如：感谢候选人参加本次面试，祝你一切顺利。"
    value={closing}
  />
  <PlaceholderDescription />
</Field>
```

- [ ] **Step 3: Replace `company` field (lines 139–157)**

Replace the `<Field>` block for `company` with:

```tsx
<Field>
  <FieldLabel htmlFor="company">公司资料</FieldLabel>
  <MarkdownEditor
    disabled={pending}
    id="company"
    maxLength={COMPANY_CONTEXT_MAX_LENGTH}
    onChange={setCompany}
    placeholder="公司业务、规模、文化等，候选人若问及可由此回答。"
    value={company}
  />
  <FieldDescription>候选人主动问到公司相关信息时，agent 会优先参考这里。</FieldDescription>
</Field>
```

- [ ] **Step 4: Add import + remove unused**

Add at top:

```tsx
import { MarkdownEditor } from "@/components/markdown-editor";
```

Remove `InputGroup`, `InputGroupTextarea`, and `TextareaCounter` imports IF they're no longer used anywhere else in the file (this file used them only in the three blocks we just replaced; check first with a grep).

- [ ] **Step 5: Verify typecheck + build**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot typecheck && pnpm --filter @arc/ai-recruitment-copilot build
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/global-config/_components/global-config-form.tsx
git commit -m "feat(global-config): use MarkdownEditor for opening/closing/company fields"
```

---

## Task 10: Full verification

**Files:** _(none modified)_

- [ ] **Step 1: Run all checks**

Run:

```bash
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm check
```

Expected: all green. Fix any lint/format issues with `pnpm fix`.

- [ ] **Step 2: Manual smoke test**

Start the dev server:

```bash
pnpm --filter @arc/ai-recruitment-copilot dev
```

Walk through each form in the browser and verify:

- Interviewer dialog → prompt field shows the editor; existing prompt renders as rich text; can toggle 编辑 / 预览 / Raw; save then reopen shows same content
- Job description dialog → same checks
- Global config page → opening / closing / company三个字段都用 editor，无报错，模式切换正常
- 已存的纯文本 prompt 旧数据在编辑模式下显示正常（不丢换行）
- 字符计数到上限时无法继续输入，颜色变红
- 在面试态 `/interview/:id` 里 `agent-instructions-panel` 仍能正确显示 prompt（只读侧未改）
- 窄屏 (≤ 768px) 工具栏不溢出（必要时允许换行）

- [ ] **Step 3: Final commit (if `pnpm fix` produced changes)**

```bash
git add -u
git commit -m "chore: ultracite fix after markdown editor rollout" || echo "nothing to commit"
```

---

## Self-Review Notes

- **Spec coverage:** All 11 spec sections map to tasks 1–10. §6 deps → Task 1. §4 component design → Tasks 2–6. §5 接入方案 → Tasks 7–9. §9 测试 → Task 2 (unit) + Task 10 (manual). §11 实施切片 → Tasks 1, 6, 4, 7, 8, 9, 10 in order.
- **No placeholders.** Every code step shows the exact code. Line ranges for modifications reference the spec's `Read` output.
- **Type consistency:** `MarkdownEditorProps` uses `value/onChange/onBlur/maxLength/disabled/defaultMode/className/minHeight/id/aria-invalid` — consistent across Tasks 6, 7, 8, 9. `EditorMode = "edit"|"preview"|"raw"` consistent across Tasks 3, 4, 6.
- **Known unknowns the executor may need to resolve in-line:**
  1. Exact import path for BubbleMenu in `@tiptap/react` v3 (Task 5 notes a fallback).
  2. Whether `lucide-react` exports `SquareCodeIcon` under that exact name in the installed version (Task 4 notes fallback).
  3. Whether unused imports in Tasks 7/8/9 actually become unused (depends on rest of file — instructions tell executor to grep first).
