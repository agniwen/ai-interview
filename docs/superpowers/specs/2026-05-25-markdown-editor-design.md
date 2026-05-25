# Markdown 富文本编辑器（替换 prompt 输入）— 设计文档

- **日期**：2026-05-25
- **作者**：allen（与 Claude 共同设计）
- **状态**：待审阅

## 1. 背景与目标

当前所有 prompt 类字段（面试官指令、JD 指令、全局开/结场指令、公司背景）在前台都用纯 `<Textarea>` 编辑，体验差：

- 用户无法所见即所得地写标题 / 列表 / 强调 / 代码块
- 已有 markdown 内容在编辑态看到的是源码，认知负担高
- 只读侧（`agent-instructions-panel.tsx`）已经在用 `MarkdownView` 渲染 markdown 了，编辑侧没跟上

目标：用 Tiptap 提供一个**所见即所得 + 预览 + Raw markdown** 三模式的富文本编辑器，替换上述 5 处 `<Textarea>`，**只支持标准 markdown 语法**，**存储仍然是 markdown 字符串**（落到现有 `text` 列）。

## 2. 范围

### In-scope（一次性替换 5 处）

| 文件                                                                  | 字段                  | 表单库              | maxLength |
| --------------------------------------------------------------------- | --------------------- | ------------------- | --------- |
| `studio/interviewers/_components/interviewer-form-dialog.tsx`         | `prompt`              | TanStack React Form | 10,000    |
| `studio/job-descriptions/_components/job-description-form-dialog.tsx` | `prompt`              | TanStack React Form | 10,000    |
| `studio/global-config/_components/global-config-form.tsx`             | `openingInstructions` | useState            | 10,000    |
| `studio/global-config/_components/global-config-form.tsx`             | `closingInstructions` | useState            | 10,000    |
| `studio/global-config/_components/global-config-form.tsx`             | `companyContext`      | useState            | 8,000     |

### Out-of-scope

- DB schema 改动（继续用现有 `text` 列）
- API / Zod 校验改动（继续按 markdown 字符串走）
- 历史数据迁移（旧的纯文本在 markdown parser 下天然兼容）
- 只读侧组件改动（`MarkdownView` 已就绪）
- 非标准 markdown 扩展（table / task list / image / mention / underline / highlight 等不启用）

## 3. 技术选型

| 选型                     | 决定                                     | 理由                                                                                                        |
| ------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 编辑器内核               | **Tiptap v3**                            | 用户指定；React 19 兼容；headless 利于定制 UI                                                               |
| Markdown 序列化/反序列化 | **`tiptap-markdown@latest`**             | 官方推荐的社区扩展，已支持 v3；提供 `getMarkdown()` + `setContent(md)` 双向能力                             |
| 工具栏                   | **固定顶部条 + 选区 BubbleMenu 双重**    | 顶部条对新用户友好（HR 场景），BubbleMenu 是 Notion 风格 power-user 加速                                    |
| 真相源                   | **`markdown: string` 单一真相源**        | 表单字段值就是 md 字符串；edit 模式只是它的一个视图；preview / raw 直接渲染 md；避免 HTML↔MD 频繁来回掉格式 |
| 模式切换策略             | **切回 edit 时才 `setContent(md)` 重建** | Raw 模式编辑时不实时回灌进编辑器，避免抖动 / 光标跳跃 / 多次 round-trip 丢格式                              |

## 4. 组件设计

### 4.1 文件结构

```
apps/ai-recruitment-copilot/src/components/markdown-editor/
  ├── index.tsx              ← MarkdownEditor 受控组件（外部 API）
  ├── toolbar.tsx            ← 固定顶部工具栏 + 模式 tab
  ├── bubble-menu.tsx        ← 选区浮动菜单
  ├── extensions.ts          ← StarterKit + Link + Placeholder + Markdown 配置
  └── use-markdown-editor.ts ← 封装 useEditor + 同步逻辑的 hook
```

### 4.2 外部 API

```ts
type MarkdownEditorProps = {
  value: string; // markdown 字符串（受控）
  onChange: (value: string) => void;
  onBlur?: () => void; // TanStack Form 需要
  placeholder?: string;
  maxLength?: number; // 使用方传 10000 / 8000
  disabled?: boolean;
  defaultMode?: "edit" | "preview" | "raw"; // 默认 "edit"
  className?: string;
  minHeight?: number; // 默认 240
  "aria-invalid"?: boolean;
};
```

### 4.3 Tiptap 扩展集（标准 markdown 最小集合）

- `StarterKit` — 默认含 bold / italic / strike / code / heading / paragraph / bulletList / orderedList / blockquote / codeBlock / horizontalRule / hardBreak / history
- `Link`（`@tiptap/extension-link`）— `autolink: true`、`openOnClick: false`、`HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }`
- `Placeholder`（`@tiptap/extension-placeholder`）
- `Markdown.configure({ html: false, tightLists: true, linkify: true, breaks: false, transformPastedText: true, transformCopiedText: true })`

**显式不启用**：Table / TaskList / Image / Mention / Underline / Highlight / Color（不在标准 markdown 内）。

### 4.4 模式切换数据流

```
                        ┌──────────────────────┐
                        │  markdown: string    │
                        │   （受控值）          │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼─────────────────────┐
              ▼                    ▼                     ▼
       mode=edit            mode=preview              mode=raw
   <EditorContent />     <MarkdownView />          <Textarea />
   + BubbleMenu          (react-markdown)         （绑 value/onChange）
        │                                                │
        │ onUpdate                                       │ onChange
        ▼                                                ▼
   getMarkdown() ─────► onChange(md) ◄────────────  setValue(text)

  切换到 edit：editor.commands.setContent(value)（重建一次）
  切换到 preview / raw：纯渲染，不动 editor
```

**幂等保证**：编辑模式下 onUpdate → onChange 回流到 value 后，避免触发又一次 setContent。实现里用 ref 标记"当前 markdown 来自编辑器自身"，只在 mode 切回编辑、或外部强制更新（如 form reset）时才 setContent。

### 4.5 工具栏按钮集

固定顶部条（一行），左到右：

- 撤销 / 重做
- **B** 粗 / _I_ 斜 / ~~S~~ 删除 / `</>` 行内代码
- H1 / H2 / H3
- 无序列表 / 有序列表 / 引用 / 代码块
- 🔗 链接（点击弹小输入框）
- ― 水平分隔

右侧：模式 tab `编辑 ｜ 预览 ｜ Raw`

BubbleMenu（选区出现）：B / I / S / 行内代码 / 🔗

### 4.6 字符计数与 maxLength

- 计数对象：当前 markdown 字符串长度（`value.length`）
- 显示：`9,213 / 10,000`，超阈值变红
- 强制阻断：onChange 包装层判断 `md.length > maxLength` 时不调用外部 onChange（"打不进去"）。与现有 Zod `.max()` 校验一致

## 5. 接入方案（5 处）

**TanStack Form（2 处）**：

```tsx
<MarkdownEditor
  value={field.state.value}
  onChange={field.handleChange}
  onBlur={field.handleBlur}
  maxLength={10000}
  placeholder="..."
  aria-invalid={!field.state.meta.isValid}
/>
```

**useState（3 处）**：

```tsx
<MarkdownEditor
  value={openingInstructions}
  onChange={setOpeningInstructions}
  maxLength={10000} // companyContext 用 8000
  placeholder="..."
/>
```

**只读侧不动**：`agent-instructions-panel.tsx` 继续用 `MarkdownView`。

## 6. 依赖

新增到 `apps/ai-recruitment-copilot/package.json`：

```
@tiptap/react @tiptap/pm @tiptap/starter-kit
@tiptap/extension-link @tiptap/extension-placeholder
tiptap-markdown
```

## 7. 字体与样式

- 内容区字号、行高、颜色遵循 `MarkdownView` 同一套 Tailwind typography 配置，保证编辑态与只读态视觉一致
- 全局字体 **MiSans**（项目约定），不引入 serif
- 编辑器外框、工具栏样式与 shadcn `<Textarea>` / `<Card>` 保持一致

## 8. 风险与兜底

| 风险                                  | 兜底                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------- |
| 老 prompt 是纯文本带换行              | markdown parser 兼容纯文本；显式 round-trip 测试覆盖                      |
| SSR hydration                         | 组件加 `"use client"`；useEditor 用 `immediatelyRender: false`（v3 选项） |
| 解析极端边界抛错                      | try/catch 兜底，失败时自动回到 Raw 模式并提示                             |
| HTML↔MD round-trip 在罕见结构上掉格式 | 真相源始终是 md 字符串；不启用 html、不启用非标准扩展，减小风险面         |
| `tiptap-markdown` 与 v3 行为差异      | 装上后通过测试用例锁定关键 round-trip 行为                                |

## 9. 测试

**单元测试**（Vitest，`markdown-editor/__tests__/`）：

1. `value="# 标题\n\n**粗体**"` 进编辑模式 → DOM 出现 `<h1>` 和 `<strong>`
2. 编辑模式敲入 "abc" → onChange 收到的 md 含 `abc`
3. 模式切换 edit→raw→edit，文本字节级一致（round-trip 幂等）
4. `maxLength=10`，输入超 10 字符时 onChange 不再触发
5. 粘贴含 markdown 语法的文本被解析为富文本
6. 老纯文本（含换行无 md 语法）进编辑模式后再切回 raw，内容不丢

**手工验证**：

- 5 个 prompt 表单分别打开 → 老数据正常回显
- 编辑 → 保存 → 重新打开 → 内容一致
- 在面试态 `agent-instructions-panel` 里 preview / raw 两侧都能正确显示新存的 prompt
- TanStack Form 字段 `aria-invalid` 与长度限制仍然工作
- 移动端 / 窄屏下工具栏不溢出

## 10. 不做的事

- 不动 DB schema、不写迁移
- 不动 Hono 路由、不动 Zod schema
- 不写 markdown 之外的扩展（无 image / table / task list）
- 不替换只读展示侧（已经在用 `MarkdownView`）
- 不重构 `MarkdownView` 自身

## 11. 实施切片（高阶顺序，细化由 implementation plan 完成）

1. 装依赖；在 `next.config.ts` `transpilePackages` 如有需要追加
2. 实现 `markdown-editor/` 组件 + 顶部条 + BubbleMenu
3. 写测试覆盖 §9 的 6 个用例
4. 接入 `interviewer-form-dialog.tsx`
5. 接入 `job-description-form-dialog.tsx`
6. 接入 `global-config-form.tsx`（3 个字段）
7. 手工验证 → `pnpm check` / `pnpm typecheck` / `pnpm test`
