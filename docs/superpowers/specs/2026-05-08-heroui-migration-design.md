# Hero UI v3 全面替换 shadcn/ui 迁移设计

**日期**: 2026-05-08
**作者**: @sakurawen + Claude
**状态**: Draft

## 背景

项目当前使用 shadcn/ui（new-york style，60+ 组件，200+ 调用点）作为 UI 层，配合 Tailwind v4 + oklch CSS 变量做主题。问题：

1. shadcn 风格在 vibe coding 生态中过度泛化，产品同质化严重，"AI 味"重。
2. 想引入 [Hero UI v3](https://heroui.com/docs/react/components)（基于 React Aria Components + Tailwind v4，75+ 组件）作为视觉/语义差异化来源。

## 目标

1. **替换原则**：Hero UI 有的组件全部用 Hero UI；Hero UI 没有的（sidebar、command、chart、resizable、carousel、context-menu、menubar、navigation-menu、hover-card 等）保留 shadcn/Radix 现有实现。
2. **统一主题源**：放弃现有 oklch CSS 变量做法，改用 Hero UI v3 的语义 token 系统作为单一真源；保留组件改写为消费 Hero UI tokens。
3. **保留 import 路径**：`@/components/ui/*` 路径不变（不改调用点 import），文件内部改成 Hero UI 的薄壳 / 直接 re-export。
4. **使用 Hero UI 原生 API**：调用点 props 全部改为 Hero UI v3 写法（`color="primary"`、`isOpen`、`isSelected` 等），不做 shadcn API 兼容层。
5. **一个 PR 完成全部迁移**。

## 非目标

- 不动 `src/components/agents-ui/`、`src/hooks/agents-ui/`（LiveKit upstream 代码）。
- 不动 `src/components/ui/alignui/*`（独立子设计系统）。
- 不动 LiveKit 专用组件（`bar-visualizer.tsx`、`live-waveform.tsx`、`mic-selector.tsx`）。
- 不重写表单状态/校验流。项目实际用 `@tanstack/react-form`（8 个调用文件），仅 1 处用 `react-hook-form`（旧 `form.tsx` 自身）。`field.tsx` 是布局原语家族（`<Field>` / `<FieldGroup>` / `<FieldLabel>` / `<FieldContent>` / `<FieldError>` / `<FieldDescription>` / `<FieldLegend>` / `<FieldSeparator>` / `<FieldSet>` / `<FieldTitle>`），不是 Controller 桥；保留其全部对外 API 和结构，仅替换内部消费的 Tailwind 类（指向 Hero UI tokens）和它内部的 `<Label>` / `<Separator>` 引用（已经走 `@/components/ui/*` 自动跟随迁移）。
- 不动 Hero UI 没有的 13 个保留组件的对外 API（仅改其内部 className 让色板对齐 Hero UI tokens）。
- 不动 `src/components/ui/sortable-list.tsx`（dnd-kit 自定义）的拖拽逻辑，仅替换其中按钮/视觉元素。

## 总体策略（已与用户确认）

| 决策点       | 选定方案                                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 主题系统     | 统一切到 Hero UI v3 的 CSS 变量语义 token；删除现有 `@theme inline` 中的全部颜色/圆角/字体声明，重新基于 Hero UI plugin 注入 |
| 调用层       | 保留 `@/components/ui/*` 路径，文件内部改成 Hero UI 薄壳 / 直接 re-export                                                    |
| Props API    | 调用点全改 Hero UI 原生写法；不引入 shadcn → Hero UI 的 props 兼容层                                                         |
| 节奏         | 一个 PR 大打包完成（接入 → 主题 → 全部组件改写 → 全部调用点修改 → 删除残留）                                                 |
| Hero UI 版本 | `@heroui/react` v3.x（v3.0.4 起稳定）+ Tailwind v4 + React Aria Components                                                   |

## 组件映射全表

### A. Hero UI 替换（41 个 shadcn 文件）

| 现有文件                    | Hero UI v3 对应                                              | 备注                                                                                      |
| --------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| button.tsx                  | Button                                                       | `variant="default"→"solid"`，`destructive→color="danger"` 等见 §6 prop 表                 |
| button-group.tsx            | ButtonGroup                                                  | API 接近                                                                                  |
| input.tsx                   | Input                                                        | 内置 label/errorMessage                                                                   |
| input-group.tsx             | InputGroup                                                   | Hero UI 原生有                                                                            |
| input-otp.tsx               | InputOTP                                                     | Hero UI 原生有；可弃用 `input-otp` 包（保留亦可，看 Hero UI 是否完全覆盖）                |
| textarea.tsx                | TextArea                                                     |                                                                                           |
| label.tsx                   | Label                                                        | Hero UI 原生                                                                              |
| field.tsx                   | （保留为布局原语家族）                                       | 见 §5；不引入 Hero UI Form 原语，仅替换内部 `text-muted-foreground` 等类为 Hero UI tokens |
| form.tsx                    | （删除或保留为最小壳）                                       | 仅 1 处旧 react-hook-form 用法，迁移期间评估：直接改用 tanstack/react-form 或保留兼容     |
| native-select.tsx           | Select                                                       |                                                                                           |
| select.tsx                  | Select                                                       |                                                                                           |
| searchable-select.tsx       | Autocomplete                                                 | API 是子组件式                                                                            |
| searchable-multi-select.tsx | TagGroup + Autocomplete                                      | 复合用法                                                                                  |
| combobox.tsx                | ComboBox                                                     |                                                                                           |
| checkbox.tsx                | Checkbox                                                     |                                                                                           |
| radio-group.tsx             | RadioGroup / Radio                                           |                                                                                           |
| switch.tsx                  | Switch                                                       |                                                                                           |
| toggle.tsx                  | ToggleButton                                                 |                                                                                           |
| toggle-group.tsx            | ToggleButtonGroup                                            |                                                                                           |
| slider.tsx                  | Slider                                                       |                                                                                           |
| badge.tsx                   | Chip（默认）                                                 | 数字角标语义保留 Badge 备用                                                               |
| avatar.tsx                  | Avatar                                                       | API 平铺（src/name/fallback 一个组件）                                                    |
| separator.tsx               | Separator                                                    |                                                                                           |
| skeleton.tsx                | Skeleton                                                     |                                                                                           |
| spinner.tsx                 | Spinner                                                      |                                                                                           |
| progress.tsx                | ProgressBar                                                  |                                                                                           |
| kbd.tsx                     | Kbd                                                          |                                                                                           |
| pagination.tsx              | Pagination                                                   |                                                                                           |
| breadcrumb.tsx              | Breadcrumbs                                                  |                                                                                           |
| accordion.tsx               | Accordion / Disclosure                                       |                                                                                           |
| collapsible.tsx             | Disclosure                                                   |                                                                                           |
| tabs.tsx                    | Tabs                                                         | API 改为 `<Tab key title>{children}</Tab>` 平铺                                           |
| card.tsx                    | Card                                                         |                                                                                           |
| modal.tsx                   | Modal / ModalContent / ModalHeader / ModalBody / ModalFooter | 已经叫 modal，正合适                                                                      |
| dialog.tsx                  | Modal                                                        | dialog 当 modal 用                                                                        |
| alert-dialog.tsx            | AlertDialog                                                  | Hero UI v3 原生有                                                                         |
| alert.tsx                   | Alert                                                        |                                                                                           |
| popover.tsx                 | Popover                                                      | 子结构一致                                                                                |
| tooltip.tsx                 | Tooltip                                                      | API 改为 `<Tooltip content>{trigger}</Tooltip>`                                           |
| dropdown-menu.tsx           | Dropdown / DropdownTrigger / DropdownMenu / DropdownItem     |                                                                                           |
| sheet.tsx                   | Drawer                                                       | `side` → `placement`                                                                      |
| drawer.tsx                  | Drawer                                                       |                                                                                           |
| scroll-area.tsx             | ScrollShadow                                                 | 外滚动条仍走 OverlayScrollbars                                                            |
| sonner.tsx                  | Toast                                                        | Hero UI Toast 替代 sonner，移除 `sonner` 依赖                                             |
| calendar.tsx                | Calendar / RangeCalendar                                     | 评估是否仍需 `react-day-picker`，能去则去                                                 |
| table.tsx                   | Table                                                        |                                                                                           |

### B. 保留 shadcn / Radix（13 个）

仅改内部 className 让色板对齐 Hero UI tokens（§3 token 对照），对外 API 不变。

| 文件                | 保留原因                      |
| ------------------- | ----------------------------- |
| sidebar.tsx         | Hero UI 无对应                |
| command.tsx         | cmdk 命令面板，Hero UI 无     |
| chart.tsx           | recharts 封装                 |
| resizable.tsx       | react-resizable-panels        |
| sortable-list.tsx   | dnd-kit 自定义                |
| carousel.tsx        | embla                         |
| context-menu.tsx    | Hero UI v3 无原生 ContextMenu |
| menubar.tsx         | Hero UI 无                    |
| navigation-menu.tsx | Hero UI 无对应模式            |
| hover-card.tsx      | Hero UI 无                    |
| empty.tsx           | 业务自定义                    |
| item.tsx            | 业务自定义                    |
| direction.tsx       | 自定义工具组件                |

### C. 不动（4 类）

- `bar-visualizer.tsx`、`live-waveform.tsx`、`mic-selector.tsx`（LiveKit 专用）
- `alignui/*`（独立子设计系统）
- `src/components/agents-ui/`（LiveKit upstream）
- `src/hooks/agents-ui/`（LiveKit upstream）

### D. 直接删除（1 个）

`aspect-ratio.tsx` —— 用 Tailwind v4 `aspect-*` utility 替换调用点。

## 主题系统接入（Tailwind v4 + Hero UI v3）

### `src/app/globals.css` 改动

```css
@import "tailwindcss";
@plugin "@heroui/react";
@import "tw-animate-css";
@source "../node_modules/streamdown/dist/*.js";

/* 删除整个 @theme inline 块（被 Hero UI plugin 接管） */

:root,
[data-theme="light"] {
  --background: oklch(1 0 0);
  --foreground: oklch(0.28 0.04 254);

  --surface: #fafafa;
  --surface-foreground: oklch(0.28 0.04 254);

  --primary: oklch(0.62 0.17 254); /* 品牌蓝 #3D8EEE */
  --primary-foreground: oklch(0.99 0.005 254);
  --secondary: #f5f5f5;
  --secondary-foreground: oklch(0.36 0.05 254);

  --danger: oklch(0.577 0.245 27.325);
  --success: oklch(0.7329 0.1935 150.81);
  --warning: oklch(0.82 0.16 80);

  --divider: #e5e5e5;
  --focus: oklch(0.644 0.164 254);

  /* default 语义梯度（替代旧 muted/accent） */
  --default-50: oklch(0.985 0 0);
  --default-100: #f5f5f5;
  --default-200: #ebebeb;
  --default-300: #d6d6d6;
  --default-400: oklch(0.74 0.025 254);
  --default-500: oklch(0.52 0.035 254);
  --default-600: oklch(0.42 0.045 254);
  --default-700: oklch(0.36 0.05 254);
  --default-800: oklch(0.28 0.04 254);
  --default-900: oklch(0.2 0.03 254);

  /* content 表面层级（替代旧 card/popover） */
  --content1: #fafafa;
  --content2: #f5f5f5;
  --content3: #ebebeb;
  --content4: #e0e0e0;

  --radius: 0.875rem;
  --default-font-family:
    "MiSans", "MiSans VL", var(--font-source-sans), "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  --default-mono-font-family: var(--font-ibm-plex-mono);
}

[data-theme="dark"] {
  --background: oklch(0.17 0.014 254);
  --foreground: oklch(0.97 0.006 254);
  --surface: oklch(0.23 0.02 254);
  --surface-foreground: oklch(0.97 0.006 254);
  --primary: oklch(0.72 0.095 254);
  --primary-foreground: oklch(0.22 0.025 254);
  --secondary: oklch(0.3 0.022 254);
  --secondary-foreground: oklch(0.97 0.006 254);
  --danger: oklch(0.704 0.191 22.216);
  --success: oklch(0.78 0.16 150);
  --warning: oklch(0.85 0.15 80);
  --divider: oklch(1 0 0 / 10%);
  --focus: oklch(0.65 0.09 254);
  --default-50: oklch(0.2 0.02 254);
  --default-100: oklch(0.24 0.02 254);
  --default-200: oklch(0.3 0.022 254);
  --default-300: oklch(0.4 0.025 254);
  --default-400: oklch(0.55 0.03 254);
  --default-500: oklch(0.74 0.03 254);
  --default-600: oklch(0.83 0.025 254);
  --default-700: oklch(0.9 0.02 254);
  --default-800: oklch(0.95 0.012 254);
  --default-900: oklch(0.97 0.006 254);
  --content1: oklch(0.23 0.02 254);
  --content2: oklch(0.27 0.022 254);
  --content3: oklch(0.3 0.022 254);
  --content4: oklch(0.34 0.024 254);
}

/* sidebar 专属 token 保留（保留组件用） */
:root {
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.28 0.04 254);
  --sidebar-primary: oklch(0.62 0.17 254);
  --sidebar-primary-foreground: oklch(0.99 0.005 254);
  --sidebar-accent: oklch(0.96 0.018 254);
  --sidebar-accent-foreground: oklch(0.36 0.05 254);
  --sidebar-border: oklch(0.92 0.012 254);
  --sidebar-ring: oklch(0.644 0.164 254);
}
[data-theme="dark"] {
  --sidebar: oklch(0.23 0.02 254);
  --sidebar-foreground: oklch(0.97 0.006 254);
  --sidebar-primary: oklch(0.62 0.1 254);
  --sidebar-primary-foreground: oklch(0.97 0.006 254);
  --sidebar-accent: oklch(0.3 0.022 254);
  --sidebar-accent-foreground: oklch(0.97 0.006 254);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.65 0.09 254);
}

/* @layer base 中现有的滚动条/选区/reduced-motion 规则保留 */
```

### Provider 树（`src/app/layout.tsx`）

```tsx
import { ToastProvider } from "@heroui/react";

// Hero UI v3 dropped HeroUIProvider; ToastProvider is the only provider needed
// (mount once near the root, outside ThemeProvider so toasts survive theme transitions).
<ToastProvider />
<ThemeProvider attribute="data-theme" defaultTheme="light">
  {children}
</ThemeProvider>
```

`next-themes` 的 `attribute` 切到 `data-theme`，对齐 Hero UI 的 `[data-theme="light|dark"]` 选择器。**注意：项目当前 `<html>` 的 dark 选择器是 `class="dark"`，需要同步切换。**

### 保留组件 className 对照（§B 那 13 个用）

| 旧 className                                       | 新 className                                        |
| -------------------------------------------------- | --------------------------------------------------- |
| `bg-background`                                    | `bg-background`（同名，token 改源）                 |
| `bg-card` / `bg-popover`                           | `bg-content1`                                       |
| `bg-muted`                                         | `bg-default-100`                                    |
| `bg-accent`                                        | `bg-default-100`（hover 态用 `bg-default-200`）     |
| `text-foreground`                                  | `text-foreground`                                   |
| `text-muted-foreground`                            | `text-default-500`                                  |
| `text-accent-foreground`                           | `text-default-700`                                  |
| `text-card-foreground` / `text-popover-foreground` | `text-foreground`                                   |
| `border-border` / `border-input`                   | `border-divider`                                    |
| `ring-ring`                                        | `ring-focus`                                        |
| `bg-destructive` / `text-destructive`              | `bg-danger` / `text-danger`                         |
| sidebar token 系列                                 | 保持原名（`bg-sidebar` 等）—— 仍由独立 CSS 变量驱动 |

## Wrapper 层形态

**默认就是裸 re-export。** 仅在有项目级默认值或业务复合需求时才包装。

```tsx
// src/components/ui/button.tsx
export { Button, type ButtonProps } from "@heroui/react";

// src/components/ui/modal.tsx
export {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  type ModalProps,
} from "@heroui/react";

// src/components/ui/input.tsx
export { Input, type InputProps } from "@heroui/react";

// src/components/ui/field.tsx —— 业务封装，见下一节
```

不再使用 `class-variance-authority` 与 shadcn `cn()` 风格的 `variant` 体系——Hero UI 的 `classNames` slot prop 与 `variant`/`color` 已覆盖。`@/lib/utils` 的 `cn` 函数本身留作业务代码用。

## 表单系统：tanstack/react-form + Field 布局原语

**项目实际状态：**

- 8 个表单文件用 `@tanstack/react-form`，1 个旧文件用 `react-hook-form`（即 `form.tsx` 自身）
- `field.tsx` 是**布局原语家族**（不是 Controller 桥）：`<FieldSet>` / `<FieldGroup>` / `<FieldLegend>` / `<Field>` / `<FieldContent>` / `<FieldLabel>` / `<FieldTitle>` / `<FieldDescription>` / `<FieldSeparator>` / `<FieldError>`
- 典型调用模式（来自 `department-form-dialog.tsx`）：

```tsx
<form.Field name="name">
  {(field) => (
    <Field data-invalid={hasFieldErrors(field.state.meta.errors) || undefined}>
      <FieldLabel htmlFor={field.name}>部门名称</FieldLabel>
      <FieldContent className="gap-2">
        <Input
          id={field.name}
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          onBlur={field.handleBlur}
        />
        <FieldError errors={toFieldErrors(field.state.meta.errors)} />
      </FieldContent>
    </Field>
  )}
</form.Field>
```

**迁移策略：**

1. **保留 `field.tsx` 全部对外 API 和结构** —— 这些都是纯布局原语（CSS 类组合），不绑定具体表单库，调用点完全不动。
2. **仅替换 `field.tsx` 内部消费的 Tailwind 类**：`text-muted-foreground` → `text-default-500`、`text-destructive` → `text-danger`、`bg-background` → 不变（同名 token），等等（详见 §3 的 className 对照表）。
3. **`field.tsx` 内部引用的 `<Label>` / `<Separator>` 自动跟随**：它们 import 自 `@/components/ui/`，wrapper 升级为 Hero UI 后自动迁移。
4. **`form.tsx`（react-hook-form 风格的 shadcn `<Form>`/`<FormField>`/...）** 按以下处理：
   - 先 grep 确认全仓库没有 `from "@/components/ui/form"` 调用点（如果只有 `form.tsx` 自己定义、没人 import，直接删除）；
   - 若仍有调用点，最小改造：让其内部消费的 Tailwind 类同样切到 Hero UI tokens，对外 API 不动。
5. **不引入 Hero UI 的 `<Form>` / `<Label>` / `<FieldError>` 原语**：项目的 `Field*` 家族已经覆盖布局需求，引入 Hero UI Form 原语会双重定义。
6. **Hero UI Input / Textarea / Select / Checkbox / Switch 内置的 `label` / `description` / `errorMessage` / `isInvalid` props 不在调用点使用**：调用点继续走 `<FieldLabel>` + `<FieldDescription>` + `<FieldError>` 外挂（保持现状），把 Hero UI 的内置 label 系统当作"备选能力"，不混用。

## PR 内执行顺序

按依赖倒推、自底向上做。

### Step 1 — 依赖与 Provider

- `pnpm add @heroui/react framer-motion`（Hero UI v3 peer dep）
- 不删 `cmdk`（命令面板保留）
- `src/app/layout.tsx` 加 `ToastProvider`（Hero UI v3 不需要 Provider 包装），旧 `<Toaster />` 暂留共存（最后一步删）

### Step 2 — 主题切换

- 改写 `globals.css`：删 `@theme inline` 全部颜色/圆角/字体；引入 `@plugin "@heroui/react"`；铺 §3 全部 Hero UI 语义变量；保留 sidebar 专属变量
- 切 next-themes：`attribute="class"` → `attribute="data-theme"`，旧 `.dark` 类选择器全替换为 `[data-theme="dark"]`（globals.css 内的 `.dark` 块也改）
- 实测亮/暗模式切换，验证 MiSans、品牌蓝 `#3D8EEE` 仍生效

### Step 3 — 保留组件改造（13 个）

按 §3 的 className 对照表批量替换。优先级按使用频次：sidebar(8) → command → empty(6) → 其余。

- 强制走查浅/深色 sidebar 视觉；强制走查 command 命令面板（高频键盘入口）

### Step 4 — `@/components/ui/*` 全部改写

按使用频次（高频先改，错误暴露快）：

- 第 1 批（>10 处）：button, badge, input, modal, field, textarea, select, alert-dialog
- 第 2 批（5–10 处）：tooltip, separator, label, tabs, switch, searchable-select, dropdown-menu, popover, command（保留）
- 第 3 批（<5 处）：其余

每改一个组件文件，**同一 commit 内立刻**做对应的调用点扫荡，避免类型错误堆积。

### Step 5 — 全量 prop 迁移对照

| shadcn 写法                                                                                 | Hero UI v3 写法                                                                          |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `<Button variant="default">`                                                                | `<Button color="primary">`                                                               |
| `<Button variant="destructive">`                                                            | `<Button color="danger">`                                                                |
| `<Button variant="outline">`                                                                | `<Button variant="bordered">`                                                            |
| `<Button variant="ghost">`                                                                  | `<Button variant="light">`                                                               |
| `<Button variant="secondary">`                                                              | `<Button variant="flat" color="default">`                                                |
| `<Button variant="link">`                                                                   | `<Link>` 或 `<Button variant="light" color="primary">`                                   |
| `<Dialog open onOpenChange>` `<DialogContent>`                                              | `<Modal isOpen onOpenChange>` `<ModalContent>`                                           |
| `<DialogTitle>` `<DialogDescription>`                                                       | `<ModalHeader>` 内自由排版                                                               |
| `<AlertDialog>`                                                                             | `<AlertDialog>`（API 接近 Modal）                                                        |
| `<Sheet side="right">`                                                                      | `<Drawer placement="right">`                                                             |
| `<Toaster />` + `toast(...)`                                                                | `<ToastProvider />` + `addToast(...)`                                                    |
| `<Avatar><AvatarImage src /><AvatarFallback>FB</AvatarFallback></Avatar>`                   | `<Avatar src={...} name="FB" />`                                                         |
| `<Tabs><TabsList><TabsTrigger value="x"/></TabsList><TabsContent value="x"/>...</Tabs>`     | `<Tabs><Tab key="x" title="...">{...}</Tab></Tabs>`                                      |
| `<Select><SelectTrigger/><SelectContent><SelectItem value/></SelectContent></Select>`       | `<Select><SelectItem key="...">...</SelectItem></Select>`                                |
| `<Popover><PopoverTrigger/><PopoverContent/></Popover>`                                     | `<Popover><PopoverTrigger/><PopoverContent/></Popover>`（结构一致）                      |
| `<Switch checked onCheckedChange>`                                                          | `<Switch isSelected onValueChange>`                                                      |
| `<Checkbox checked onCheckedChange>`                                                        | `<Checkbox isSelected onValueChange>`                                                    |
| `<RadioGroup value onValueChange>` `<RadioGroupItem value="x">`                             | `<RadioGroup value onValueChange>` `<Radio value="x">`                                   |
| `<Badge variant="...">`                                                                     | `<Chip color="..." variant="...">`                                                       |
| `<Skeleton className="h-x w-y">`                                                            | `<Skeleton className="h-x w-y rounded">`                                                 |
| `<ScrollArea>`                                                                              | `<ScrollShadow>`（外滚动条继续走 OverlayScrollbars）                                     |
| `<Tooltip><TooltipTrigger/><TooltipContent>...</TooltipContent></Tooltip>`                  | `<Tooltip content="...">{trigger}</Tooltip>`                                             |
| `<DropdownMenu><DropdownMenuTrigger/><DropdownMenuContent><DropdownMenuItem/>...</>`        | `<Dropdown><DropdownTrigger/><DropdownMenu><DropdownItem/>...</DropdownMenu></Dropdown>` |
| `<Calendar mode="..." />` (react-day-picker)                                                | `<Calendar />`（Hero UI 原生）；保留 react-day-picker 仅在仍有遗留用法时                 |
| shadcn `<Form>` `<FormField>` `<FormItem>` `<FormControl>` `<FormMessage>`（仅遗留 1 处）   | 保留或删除（见 §5）；不替换为 Hero UI Form 原语                                          |
| `bg-background/-foreground/-card/-popover/-muted/-accent/-border/-input/-ring/-destructive` | 见 §3 token 对照表                                                                       |

### Step 6 — 收尾

- `pnpm remove sonner vaul`（确认无引用后再删）
- 删 `src/components/ui/aspect-ratio.tsx`，调用点用 `aspect-[16/9]` utility 替换
- 跑 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- 视觉走查（§7 验证清单）

## 风险与验证

### 风险

| 风险                                                                           | 缓解                                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Hero UI v3 在 Tailwind v4 plugin 写法变动                                      | Step 1 末尾先把空白 `<Button>` 渲染出来确认管道通畅再继续                                     |
| Toast 风格与 sonner 不一致                                                     | 在 `<ToastProvider>` 上用 `placement` + `classNames` 配置；保留一份"Toast 视觉对照截图"做验收 |
| RHF Controller + Hero UI 受控组件回调签名差异（`onValueChange` vs `onChange`） | `field.tsx` 内 `cloneElement` 显式映射（§5 已写）                                             |
| 保留组件颜色与 Hero UI 主题脱钩                                                | Step 3 完成后强制浅/深色 sidebar 视觉走查                                                     |
| React Aria 焦点行为（Modal 自动 focus、Esc 关闭、滚动锁）与原行为差异          | 跑各页面键盘流：登录、面试创建、面试间、Studio 编辑                                           |
| Hero UI 内部 slot 让外层 `className` 失效                                      | 默认改用 `classNames={{ ... }}` slot prop                                                     |
| sortable-list / dnd-kit 的拖拽手柄按钮换 Hero UI Button                        | 测试拖拽是否还能触发；`isDisabled`/`isPressed` 不冲突                                         |
| Hero UI 默认 framer-motion 动画与 `prefers-reduced-motion`                     | 现有 reduced-motion media 规则保留                                                            |
| `next-themes` 切到 `data-theme` 后，全仓库 `.dark:` 选择器需要校对             | grep `\.dark` 与 `dark:` 双向校验，必要时改为 `[data-theme=dark]`                             |
| Hero UI Avatar API 平铺导致部分调用点 `<AvatarFallback>` 自定义 JSX 丢失       | 复杂 fallback 用 `<Avatar><div /></Avatar>` 自己塞 children；其余用 `name`                    |

### 验证清单（PR Done 标准）

- [ ] `pnpm typecheck` 0 error
- [ ] `pnpm lint` 0 error
- [ ] `pnpm test` 全绿
- [ ] `pnpm build` 成功（standalone 输出可启动）
- [ ] 手测：登录/注册、面试创建、面试间、简历上传、Studio 设置、深浅色切换、命令面板（cmd-k）
- [ ] 视觉：浅/深色截图对照，单页面内**没有两套圆角 / 两种 primary 蓝 / 两种深色对比度**
- [ ] `grep -r '"sonner"' src` 仅剩 lock-file 残留（或为空）；`grep -r '"vaul"' src` 同理
- [ ] `grep -r 'class="dark"\|className="dark"\|\.dark ' src` 仅剩 reduced-motion 等无关命中
- [ ] `package.json` 中 `sonner`、`vaul` 已移除；`@heroui/react`、`framer-motion` 已加入
- [ ] `components.json` 的 `style` 字段仍为 `new-york`，但实际 shadcn CLI 不再被依赖（仅保留 sidebar 等保留组件的拉取记录）

## 实施前置条件

- 创建独立分支 `feat/heroui-migration`
- 本地干净工作区，无未提交改动
- 已确认 Hero UI v3 当前最新版（`pnpm view @heroui/react version` 应 ≥ 3.0.4）
