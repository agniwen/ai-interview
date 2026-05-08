# Hero UI v3 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shadcn/ui with Hero UI v3 across the project (41 components migrated, 5 preserved & reskinned, 12 unused shadcn files deleted), unify theming on Hero UI semantic tokens, in a single PR.

**Architecture:** `@/components/ui/*` import path stays — files inside become Hero UI re-exports/wrappers. Theming switches to Hero UI v3 plugin + CSS variables. `next-themes` attribute moves from `class` to `data-theme`. Form layout primitives (`Field*` family) keep their API; only their internal Tailwind classes change to consume new tokens.

**Tech Stack:** Hero UI v3 (`@heroui/react` ≥ 3.0.4), Tailwind v4, React Aria Components, `framer-motion`, `next-themes`, `@tanstack/react-form` (kept), Next.js 16 App Router.

**Spec:** `docs/superpowers/specs/2026-05-08-heroui-migration-design.md`

---

## File Structure

### Files to delete (12 unused shadcn files — verified 0 import sites)

- `src/components/ui/form.tsx`
- `src/components/ui/calendar.tsx`
- `src/components/ui/input-otp.tsx`
- `src/components/ui/combobox.tsx`
- `src/components/ui/context-menu.tsx`
- `src/components/ui/menubar.tsx`
- `src/components/ui/navigation-menu.tsx`
- `src/components/ui/direction.tsx`
- `src/components/ui/item.tsx`
- `src/components/ui/chart.tsx`
- `src/components/ui/resizable.tsx`
- `src/components/ui/carousel.tsx`
- `src/components/ui/aspect-ratio.tsx` (after rewriting 2 call sites to Tailwind utility)

### Files to rewrite as Hero UI re-exports/wrappers (28 files)

`button.tsx`, `button-group.tsx`, `input.tsx`, `input-group.tsx`, `textarea.tsx`, `label.tsx`, `select.tsx`, `native-select.tsx`, `searchable-select.tsx`, `searchable-multi-select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `switch.tsx`, `toggle.tsx`, `toggle-group.tsx`, `slider.tsx`, `badge.tsx`, `avatar.tsx`, `card.tsx`, `separator.tsx`, `skeleton.tsx`, `spinner.tsx`, `progress.tsx`, `kbd.tsx`, `alert.tsx`, `pagination.tsx`, `breadcrumb.tsx`, `accordion.tsx`, `collapsible.tsx`, `tabs.tsx`, `modal.tsx`, `dialog.tsx`, `alert-dialog.tsx`, `popover.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`, `sheet.tsx`, `drawer.tsx`, `scroll-area.tsx`, `table.tsx`, `sonner.tsx`

### Files to reskin (preserved shadcn — 5 truly used + LiveKit)

- `src/components/ui/sidebar.tsx` (8 import sites — preserved, internal classes updated to Hero UI tokens)
- `src/components/ui/command.tsx` (5 — preserved, reskinned)
- `src/components/ui/sortable-list.tsx` (2 — preserved, reskinned)
- `src/components/ui/hover-card.tsx` (2 — preserved, reskinned)
- `src/components/ui/empty.tsx` (6 — preserved, reskinned)
- `src/components/ui/field.tsx` (13 — layout primitives preserved, internal classes updated)

### Files unchanged

- `src/components/ui/alignui/*`
- `src/components/ui/bar-visualizer.tsx`, `live-waveform.tsx`, `mic-selector.tsx`
- `src/components/agents-ui/*`, `src/hooks/agents-ui/*`

### Files to modify (non-`ui/`)

- `src/app/globals.css` — full theme rewrite
- `src/app/layout.tsx` — add `HeroUIProvider` + `ToastProvider`, change `next-themes` attribute
- `src/components/theme-provider.tsx` — confirm passes `attribute` through
- `package.json` — add `@heroui/react`, `framer-motion`; remove `sonner`, `vaul`, `cmdk` (only if `command` still uses it — check below), `input-otp` (no longer used)

### Files newly imported in tests

- `src/components/ui/__tests__/migration-smoke.test.tsx` (new) — minimal Hero UI Button render smoke test

---

## Phase 1: Setup

### Task 1: Branch and install dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Create branch and confirm clean tree**

```bash
git checkout main && git pull
git checkout -b feat/heroui-migration
git status   # must be clean
```

- [ ] **Step 2: Install Hero UI and peer deps**

```bash
pnpm add @heroui/react framer-motion
pnpm view @heroui/react version   # confirm >= 3.0.4
```

- [ ] **Step 3: Commit dep install**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(ui): add @heroui/react and framer-motion"
```

---

### Task 2: Add HeroUIProvider and ToastProvider in root layout

**Files:**

- Modify: `src/app/layout.tsx:8-101` (provider tree region)

- [ ] **Step 1: Read current `src/app/layout.tsx`**

```bash
sed -n '80,105p' src/app/layout.tsx
```

Locate the existing `<ThemeProvider …>` wrapping `{children}` and the `<Toaster />` mount.

- [ ] **Step 2: Wrap providers**

Replace the section that currently mounts `<ThemeProvider>{children}</ThemeProvider>` (and its companion `<Toaster />`) with:

```tsx
import { HeroUIProvider, ToastProvider } from "@heroui/react";

// inside <body>:
<HeroUIProvider>
  <ToastProvider /> {/* new — replaces sonner Toaster */}
  <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
    {children}
  </ThemeProvider>
</HeroUIProvider>;
```

Keep the existing `<Toaster />` import + mount **temporarily** (we delete it in Task 25) so toasts keep working until call sites migrate. Delete only when Sonner→Toast migration is complete.

- [ ] **Step 3: Confirm dev server compiles**

```bash
pnpm dev
```

Open `http://localhost:3000`. Page should still render. There will be no Hero UI components yet — just verifying provider mount doesn't crash.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(ui): mount HeroUIProvider and ToastProvider"
```

---

### Task 3: Theme migration — globals.css + next-themes attribute

**Files:**

- Modify: `src/app/globals.css` (full rewrite of theme blocks)
- Modify: `src/components/theme-provider.tsx` (no code change — verify passthrough)

- [ ] **Step 1: Rewrite `src/app/globals.css`**

Replace the file's content with:

```css
@import "tailwindcss";
@plugin "@heroui/react";
@import "tw-animate-css";
@source "../node_modules/streamdown/dist/*.js";

@custom-variant dark (&:is([data-theme="dark"] *));

:root,
[data-theme="light"] {
  --background: oklch(1 0 0);
  --foreground: oklch(0.28 0.04 254);

  --surface: #fafafa;
  --surface-foreground: oklch(0.28 0.04 254);

  --primary: oklch(0.62 0.17 254);
  --primary-foreground: oklch(0.99 0.005 254);
  --secondary: #f5f5f5;
  --secondary-foreground: oklch(0.36 0.05 254);

  --danger: oklch(0.577 0.245 27.325);
  --success: oklch(0.7329 0.1935 150.81);
  --warning: oklch(0.82 0.16 80);

  --divider: #e5e5e5;
  --focus: oklch(0.644 0.164 254);

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

  --content1: #fafafa;
  --content2: #f5f5f5;
  --content3: #ebebeb;
  --content4: #e0e0e0;

  --radius: 0.875rem;
  --default-font-family:
    "MiSans", "MiSans VL", var(--font-source-sans), "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", sans-serif;
  --default-mono-font-family: var(--font-ibm-plex-mono);

  /* sidebar tokens (preserved component) */
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
  --sidebar: oklch(0.23 0.02 254);
  --sidebar-foreground: oklch(0.97 0.006 254);
  --sidebar-primary: oklch(0.62 0.1 254);
  --sidebar-primary-foreground: oklch(0.97 0.006 254);
  --sidebar-accent: oklch(0.3 0.022 254);
  --sidebar-accent-foreground: oklch(0.97 0.006 254);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.65 0.09 254);
}

@layer base {
  html,
  body {
    min-height: 100%;
  }
  * {
    @apply border-divider outline-focus/50;
  }
  body {
    @apply font-sans text-foreground;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    touch-action: manipulation;
    -webkit-tap-highlight-color: rgba(61, 142, 238, 0.14);
  }
  ::selection {
    background: oklch(0.86 0.09 254);
    color: oklch(0.32 0.1 254);
  }
  * {
    scrollbar-width: thin;
    scrollbar-color: oklch(0.6 0 0 / 45%) transparent;
  }
  *::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }
  *::-webkit-scrollbar-track {
    background: transparent;
  }
  *::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 9999px;
    background: oklch(0.6 0 0 / 45%);
    background-clip: content-box;
  }
  *::-webkit-scrollbar-thumb:hover {
    background: oklch(0.45 0 0 / 65%);
    background-clip: content-box;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}

.os-theme-app {
  --os-size: 10px;
  --os-padding-perpendicular: 2px;
  --os-padding-axis: 2px;
  --os-track-border-radius: 9999px;
  --os-handle-border-radius: 9999px;
  --os-handle-bg: color-mix(in oklch, var(--default-500) 25%, transparent);
  --os-handle-bg-hover: color-mix(in oklch, var(--default-500) 40%, transparent);
  --os-handle-bg-active: color-mix(in oklch, var(--default-500) 55%, transparent);
}
```

Key differences from before: removed `@theme inline` block (Hero UI plugin owns it), removed `--card`/`--popover`/`--muted`/`--accent`/`--border`/`--input`/`--ring`/`--destructive`/`--chart-*`, replaced `.dark` selector with `[data-theme="dark"]`, replaced `border-border outline-ring/50` with `border-divider outline-focus/50`.

- [ ] **Step 2: Update `next-themes` attribute in `src/app/layout.tsx`**

Already done in Task 2 Step 2 via `attribute="data-theme"`. Verify by grepping:

```bash
grep -n 'attribute=' src/app/layout.tsx
```

Expected: one match showing `attribute="data-theme"`.

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

Expected: errors in shadcn components that referenced removed tokens (`bg-card`, `text-muted-foreground`, etc.). These get fixed in Task 4 onwards. Do **not** fix yet.

- [ ] **Step 4: Verify Hero UI renders + dark mode toggles**

In any page (e.g., a test page or temporarily in `src/app/page.tsx`), drop in:

```tsx
import { Button } from "@heroui/react";

<Button color="primary">Hero UI smoke</Button>;
```

Run `pnpm dev`. Confirm:

- Button renders with Hero UI's filled-blue style (not shadcn outline).
- Toggling theme via existing UI toggles `<html data-theme="dark">` (inspect element).
- Brand blue `#3D8EEE`-ish primary visible.

Remove the smoke `<Button>` after confirming.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): switch theme to Hero UI tokens and data-theme attribute"
```

---

## Phase 2: Cleanup unused shadcn files (zero-risk deletes)

### Task 4: Delete 12 unused shadcn UI files

**Files:**

- Delete: `src/components/ui/{form,calendar,input-otp,combobox,context-menu,menubar,navigation-menu,direction,item,chart,resizable,carousel}.tsx`

- [ ] **Step 1: Verify zero imports for each (paranoia check)**

```bash
for c in form calendar input-otp combobox context-menu menubar navigation-menu direction item chart resizable carousel; do
  count=$(grep -rln "from \"@/components/ui/$c\"" src 2>/dev/null | wc -l | tr -d ' ')
  echo "$c: $count"
done
```

Expected: every line shows `0`.

- [ ] **Step 2: Delete the files**

```bash
rm src/components/ui/{form,calendar,input-otp,combobox,context-menu,menubar,navigation-menu,direction,item,chart,resizable,carousel}.tsx
```

- [ ] **Step 3: Remove now-unused npm deps**

```bash
pnpm remove input-otp react-day-picker recharts react-resizable-panels embla-carousel-react embla-carousel-autoplay
```

- [ ] **Step 4: typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no new errors from these deletions.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(ui): drop 12 unused shadcn components and their npm deps"
```

---

## Phase 3: Hero UI wrapper rewrites + call-site sweeps

For each task in this phase the pattern is:

1. Rewrite the wrapper at `src/components/ui/<name>.tsx` to use Hero UI.
2. Run `pnpm typecheck` to surface call-site failures.
3. Sweep call sites with the patterns shown.
4. Re-run `pnpm typecheck` until clean for that family.
5. Commit.

> **Sweep technique:** for each `find/replace` pattern, run a project-wide grep first to enumerate hits, then apply. Use `rg --files-with-matches` if available (`pnpm dlx ripgrep` or `rg`).

### Task 5: button + button-group

**Files:**

- Rewrite: `src/components/ui/button.tsx`
- Rewrite: `src/components/ui/button-group.tsx`
- Sweep: 64 call sites (button) + 1 call site (button-group)

- [ ] **Step 1: Rewrite both wrappers**

```tsx
// src/components/ui/button.tsx
export { Button, type ButtonProps } from "@heroui/react";
```

```tsx
// src/components/ui/button-group.tsx
export { ButtonGroup, type ButtonGroupProps } from "@heroui/react";
```

- [ ] **Step 2: Enumerate variant usage**

```bash
grep -rn 'variant="default"\|variant="destructive"\|variant="outline"\|variant="ghost"\|variant="secondary"\|variant="link"' src --include="*.tsx" | head -80
```

- [ ] **Step 3: Sweep variants per the prop migration table**

Apply these rewrites across all matches (a sed-style or careful manual edit):

| From                             | To                                |
| -------------------------------- | --------------------------------- |
| `variant="default"`              | `color="primary"`                 |
| `variant="destructive"`          | `color="danger"`                  |
| `variant="outline"`              | `variant="bordered"`              |
| `variant="ghost"`                | `variant="light"`                 |
| `variant="secondary"`            | `variant="flat"`                  |
| `variant="link"` (on `<Button>`) | `variant="light" color="primary"` |

Hero UI Button defaults: `variant="solid"`, `color="default"`. A bare `<Button>` was shadcn-default-blue; with Hero UI it's gray-flat. Therefore: **bare `<Button>` should also gain `color="primary"`** if the caller previously relied on default-blue. Inspect each — if intent is "primary action", add `color="primary"`.

- [ ] **Step 4: Disabled prop**

Hero UI uses `isDisabled`, not `disabled`. Sweep:

```bash
grep -rn '<Button[^>]*\s\(disabled\)' src --include="*.tsx" | head
```

Replace `disabled={x}` → `isDisabled={x}` on `<Button>` and `<ButtonGroup>` only.

- [ ] **Step 5: Loading prop**

Hero UI uses `isLoading={...}` plus optional `spinner` slot. Project sometimes does `<Button disabled={isSubmitting}>{isSubmitting ? <LoaderCircle.../> : null}{label}</Button>` (see `department-form-dialog.tsx:93-96`). Refactor to:

```tsx
<Button isLoading={isSubmitting} type="submit" form="department-form">
  {isEdit ? "保存" : "创建"}
</Button>
```

This eliminates the inline `<LoaderCircleIcon className="size-4 animate-spin" />`.

- [ ] **Step 6: typecheck**

```bash
pnpm typecheck
```

Expected: 0 button-related errors. Other component errors still present.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/button-group.tsx src
git commit -m "feat(ui): migrate Button and ButtonGroup to Hero UI"
```

---

### Task 6: input + textarea + label + input-group

**Files:**

- Rewrite: `src/components/ui/input.tsx`, `textarea.tsx`, `label.tsx`, `input-group.tsx`

- [ ] **Step 1: Rewrite wrappers**

```tsx
// src/components/ui/input.tsx
export { Input, type InputProps } from "@heroui/react";
```

```tsx
// src/components/ui/textarea.tsx
export { Textarea, type TextareaProps } from "@heroui/react";
```

```tsx
// src/components/ui/label.tsx
export { Label, type LabelProps } from "@heroui/react";
```

```tsx
// src/components/ui/input-group.tsx
export { InputGroup, type InputGroupProps } from "@heroui/react";
```

- [ ] **Step 2: Sweep `disabled` → `isDisabled` on Input/Textarea**

```bash
grep -rn '<Input\|<Textarea' src --include="*.tsx" | grep 'disabled' | head
```

Replace `disabled={x}` with `isDisabled={x}` only on these components. Native HTML `disabled` on `<button>`/`<form>` etc. stays.

- [ ] **Step 3: aria-invalid → isInvalid**

In files using shadcn-style `aria-invalid={...}` on Hero UI Input/Textarea (e.g., `department-form-dialog.tsx:119-120`), replace with `isInvalid={...}`. Hero UI handles ARIA internally.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/{input,textarea,label,input-group}.tsx src
git commit -m "feat(ui): migrate Input, Textarea, Label, InputGroup to Hero UI"
```

---

### Task 7: select + native-select

**Files:**

- Rewrite: `src/components/ui/select.tsx`, `native-select.tsx`

- [ ] **Step 1: Rewrite wrappers**

```tsx
// src/components/ui/select.tsx
export {
  Select,
  SelectItem,
  SelectSection,
  type SelectProps,
  type SelectItemProps,
} from "@heroui/react";
```

```tsx
// src/components/ui/native-select.tsx
// Hero UI does not have a native-select primitive; use Select.
// Re-export Select so import alias keeps working.
export { Select as NativeSelect, SelectItem as NativeSelectItem } from "@heroui/react";
```

- [ ] **Step 2: Sweep call-site Select API**

shadcn Select uses 4-deep composition; Hero UI flattens. Pattern:

From:

```tsx
<Select value={v} onValueChange={setV}>
  <SelectTrigger>
    <SelectValue placeholder="..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
    <SelectItem value="b">B</SelectItem>
  </SelectContent>
</Select>
```

To:

```tsx
<Select
  selectedKeys={[v]}
  onSelectionChange={(keys) => setV(Array.from(keys)[0] as string)}
  placeholder="..."
>
  <SelectItem key="a">A</SelectItem>
  <SelectItem key="b">B</SelectItem>
</Select>
```

Notes:

- shadcn `value` (string) → Hero UI `selectedKeys` (`Set<string>` or array)
- shadcn `onValueChange(string)` → Hero UI `onSelectionChange(Selection)`; convert with `Array.from(keys)[0]`
- `<SelectItem value>` → `<SelectItem key>`
- Drop `<SelectTrigger>`, `<SelectValue>`, `<SelectContent>`

Enumerate hits:

```bash
grep -rn 'SelectTrigger\|SelectValue\|SelectContent' src --include="*.tsx" | head -40
```

- [ ] **Step 3: typecheck and fix**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/{select,native-select}.tsx src
git commit -m "feat(ui): migrate Select and NativeSelect to Hero UI"
```

---

### Task 8: checkbox + radio-group + switch + toggle + toggle-group

**Files:**

- Rewrite: `src/components/ui/{checkbox,radio-group,switch,toggle,toggle-group}.tsx`

- [ ] **Step 1: Rewrite wrappers**

```tsx
// src/components/ui/checkbox.tsx
export { Checkbox, CheckboxGroup, type CheckboxProps } from "@heroui/react";
```

```tsx
// src/components/ui/radio-group.tsx
export { RadioGroup, Radio as RadioGroupItem, type RadioGroupProps } from "@heroui/react";
```

```tsx
// src/components/ui/switch.tsx
export { Switch, type SwitchProps } from "@heroui/react";
```

```tsx
// src/components/ui/toggle.tsx
export { ToggleButton as Toggle, type ToggleButtonProps as ToggleProps } from "@heroui/react";
```

```tsx
// src/components/ui/toggle-group.tsx
export {
  ToggleButtonGroup as ToggleGroup,
  type ToggleButtonGroupProps as ToggleGroupProps,
} from "@heroui/react";
```

The aliasing (`Radio as RadioGroupItem`, `ToggleButton as Toggle`) keeps the existing import names identical so call sites don't change names — only props.

- [ ] **Step 2: Sweep prop names**

| Old (shadcn)                                    | New (Hero UI)                                    |
| ----------------------------------------------- | ------------------------------------------------ |
| `<Switch checked={v} onCheckedChange={setV}>`   | `<Switch isSelected={v} onValueChange={setV}>`   |
| `<Checkbox checked={v} onCheckedChange={setV}>` | `<Checkbox isSelected={v} onValueChange={setV}>` |
| `<Toggle pressed={v} onPressedChange={setV}>`   | `<Toggle isSelected={v} onChange={setV}>`        |
| `disabled` on any of these                      | `isDisabled`                                     |

Enumerate hits:

```bash
grep -rn 'onCheckedChange\|onPressedChange\|pressed=' src --include="*.tsx" | head -40
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/{checkbox,radio-group,switch,toggle,toggle-group}.tsx src
git commit -m "feat(ui): migrate Checkbox, RadioGroup, Switch, Toggle, ToggleGroup to Hero UI"
```

---

### Task 9: slider + searchable-select + searchable-multi-select

**Files:**

- Rewrite: `src/components/ui/slider.tsx`
- Rewrite: `src/components/ui/searchable-select.tsx`
- Rewrite: `src/components/ui/searchable-multi-select.tsx`

- [ ] **Step 1: slider — re-export**

```tsx
// src/components/ui/slider.tsx
export { Slider, type SliderProps } from "@heroui/react";
```

- [ ] **Step 2: searchable-select — Hero UI Autocomplete wrapper**

Read current `src/components/ui/searchable-select.tsx` (it's a custom shadcn-on-cmdk composition with ~6 call sites). Replace its body with:

```tsx
"use client";

import { Autocomplete, AutocompleteItem, type AutocompleteProps } from "@heroui/react";
import type { ReactNode } from "react";

export type SearchableSelectOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

type Props = Omit<AutocompleteProps, "children"> & {
  options: SearchableSelectOption[];
  emptyText?: string;
};

export function SearchableSelect({ options, emptyText = "无匹配项", ...rest }: Props) {
  return (
    <Autocomplete {...rest} listboxProps={{ emptyContent: emptyText }}>
      {options.map((o) => (
        <AutocompleteItem key={o.value} description={o.description} isDisabled={o.disabled}>
          {o.label}
        </AutocompleteItem>
      ))}
    </Autocomplete>
  );
}
```

- [ ] **Step 3: searchable-multi-select — TagGroup + Autocomplete composition**

Read current `searchable-multi-select.tsx` and infer its prop surface (likely `options`, `value: string[]`, `onChange`). Replace with:

```tsx
"use client";

import { Autocomplete, AutocompleteItem, Chip } from "@heroui/react";
import { useState } from "react";

export type MultiOption = { value: string; label: string };

type Props = {
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  isDisabled?: boolean;
};

export function SearchableMultiSelect({
  options,
  value,
  onChange,
  placeholder,
  isDisabled,
}: Props) {
  const [query, setQuery] = useState("");
  const selected = options.filter((o) => value.includes(o.value));
  const remaining = options.filter((o) => !value.includes(o.value));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {selected.map((o) => (
          <Chip key={o.value} onClose={() => onChange(value.filter((v) => v !== o.value))}>
            {o.label}
          </Chip>
        ))}
      </div>
      <Autocomplete
        inputValue={query}
        onInputChange={setQuery}
        placeholder={placeholder}
        isDisabled={isDisabled}
        onSelectionChange={(key) => {
          if (key && typeof key === "string" && !value.includes(key)) onChange([...value, key]);
          setQuery("");
        }}
      >
        {remaining.map((o) => (
          <AutocompleteItem key={o.value}>{o.label}</AutocompleteItem>
        ))}
      </Autocomplete>
    </div>
  );
}
```

If existing call sites use a different prop shape, adapt the Props type to match — but keep the implementation pattern shown.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

Fix any caller mismatch by updating callers (not the wrapper).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/{slider,searchable-select,searchable-multi-select}.tsx src
git commit -m "feat(ui): migrate Slider and Searchable(Multi)Select to Hero UI Autocomplete"
```

---

### Task 10: badge → Chip

**Files:**

- Rewrite: `src/components/ui/badge.tsx`
- Sweep: 19 call sites

- [ ] **Step 1: Rewrite as Chip alias**

```tsx
// src/components/ui/badge.tsx
// Migrated to Hero UI Chip; the Badge name kept for fewer import diffs.
export { Chip as Badge, type ChipProps as BadgeProps } from "@heroui/react";
```

- [ ] **Step 2: Sweep variant prop**

shadcn `<Badge variant="default|secondary|destructive|outline">`. Hero UI Chip uses `color` and `variant`:

| shadcn                  | Hero UI Chip                     |
| ----------------------- | -------------------------------- |
| `variant="default"`     | `color="primary"`                |
| `variant="secondary"`   | `variant="flat" color="default"` |
| `variant="destructive"` | `color="danger"`                 |
| `variant="outline"`     | `variant="bordered"`             |

Enumerate:

```bash
grep -rn '<Badge' src --include="*.tsx" | head -40
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/badge.tsx src
git commit -m "feat(ui): migrate Badge to Hero UI Chip"
```

---

### Task 11: avatar

**Files:**

- Rewrite: `src/components/ui/avatar.tsx`
- Sweep: 1 call site

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/avatar.tsx
export { Avatar, type AvatarProps } from "@heroui/react";
```

- [ ] **Step 2: Refactor any nested API**

shadcn pattern was `<Avatar><AvatarImage src/><AvatarFallback>FB</AvatarFallback></Avatar>`. Hero UI flattens to `<Avatar src={src} name="FB" />`. Find call sites:

```bash
grep -rn 'AvatarImage\|AvatarFallback' src --include="*.tsx"
```

For each, rewrite to `<Avatar src={...} name={...} />`. If fallback content was JSX (an icon), use `<Avatar icon={<MyIcon />} />` or `<Avatar fallback={<MyIcon />} />` depending on Hero UI's exact prop name — check `node_modules/@heroui/react/dist/avatar/avatar.d.ts` if uncertain.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/avatar.tsx src
git commit -m "feat(ui): migrate Avatar to Hero UI"
```

---

### Task 12: card

**Files:**

- Rewrite: `src/components/ui/card.tsx`
- Sweep: 4 call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/card.tsx
export {
  Card,
  CardHeader,
  CardBody as CardContent,
  CardFooter,
  type CardProps,
} from "@heroui/react";
// Hero UI does not have CardTitle/CardDescription. Provide minimal shims:
import type { HTMLAttributes } from "react";
export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-lg font-semibold leading-none ${className ?? ""}`} {...rest} />;
}
export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm text-default-500 ${className ?? ""}`} {...rest} />;
}
```

shadcn Card had 5 named exports (Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter). Hero UI has Card / CardHeader / CardBody / CardFooter. We alias `CardBody as CardContent` and shim CardTitle/CardDescription to avoid call-site noise.

- [ ] **Step 2: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/card.tsx
git commit -m "feat(ui): migrate Card to Hero UI"
```

---

### Task 13: separator + skeleton + spinner + progress + kbd + alert

**Files:**

- Rewrite: `src/components/ui/{separator,skeleton,spinner,progress,kbd,alert}.tsx`

- [ ] **Step 1: Rewrite all six**

```tsx
// separator.tsx
export { Divider as Separator, type DividerProps as SeparatorProps } from "@heroui/react";

// skeleton.tsx
export { Skeleton, type SkeletonProps } from "@heroui/react";

// spinner.tsx
export { Spinner, type SpinnerProps } from "@heroui/react";

// progress.tsx
export { Progress, type ProgressProps } from "@heroui/react";

// kbd.tsx
export { Kbd, type KbdProps } from "@heroui/react";

// alert.tsx
// Hero UI Alert exposes title/description as props. Project's Alert + AlertDescription
// pattern is preserved by passing description prop.
export { Alert, type AlertProps } from "@heroui/react";
// shim AlertDescription to keep imports stable
import type { HTMLAttributes } from "react";
export function AlertDescription({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...rest} />;
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

If `<Separator orientation="vertical">` errors out, Hero UI Divider supports `orientation` the same way — check that prop exists; if not, use `<Divider className="h-auto w-px" />` for vertical.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/{separator,skeleton,spinner,progress,kbd,alert}.tsx
git commit -m "feat(ui): migrate Separator, Skeleton, Spinner, Progress, Kbd, Alert to Hero UI"
```

---

### Task 14: modal + dialog (compositional API)

**Files:**

- Rewrite: `src/components/ui/modal.tsx`, `dialog.tsx`
- Sweep: 14 modal call sites + 2 dialog call sites

- [ ] **Step 1: Rewrite wrappers**

```tsx
// src/components/ui/modal.tsx
export {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  type ModalProps,
} from "@heroui/react";
```

```tsx
// src/components/ui/dialog.tsx
// Project conflated Dialog with Modal. Re-export Modal under Dialog names.
export {
  Modal as Dialog,
  ModalContent as DialogContent,
  ModalHeader as DialogHeader,
  ModalBody as DialogBody,
  ModalFooter as DialogFooter,
} from "@heroui/react";
import type { HTMLAttributes } from "react";
export function DialogTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-lg font-semibold ${className ?? ""}`} {...rest} />;
}
export function DialogDescription({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm text-default-500 ${className ?? ""}`} {...rest} />;
}
```

- [ ] **Step 2: Sweep Modal call sites**

The current project Modal has a custom convenience API: `<Modal open onOpenChange title description size footer>{body}</Modal>`. Refactor each call site to compositional Hero UI:

From (e.g., `department-form-dialog.tsx:82-99`):

```tsx
<Modal
  open={open}
  onOpenChange={onOpenChange}
  title="..."
  description="..."
  size="md"
  footer={<>...</>}
>
  <FormBody />
</Modal>
```

To:

```tsx
<Modal isOpen={open} onOpenChange={onOpenChange} size="md">
  <ModalContent>
    {(onClose) => (
      <>
        <ModalHeader>
          <div className="text-lg font-semibold">...</div>
          <div className="text-sm text-default-500">...</div>
        </ModalHeader>
        <ModalBody>
          <FormBody />
        </ModalBody>
        <ModalFooter>...</ModalFooter>
      </>
    )}
  </ModalContent>
</Modal>
```

Enumerate hits:

```bash
grep -rln 'from "@/components/ui/modal"' src
```

For each file, rewrite the `<Modal>` JSX as shown.

- [ ] **Step 3: Sweep `<Dialog>` call sites**

```bash
grep -rln 'from "@/components/ui/dialog"' src
```

Replace `open` → `isOpen`. Apply the same compositional pattern as Modal.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Visual smoke**

`pnpm dev`, open a page using Modal (e.g., department creation in Studio). Confirm modal opens, has Hero UI styling, Esc closes, backdrop click closes.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/{modal,dialog}.tsx src
git commit -m "feat(ui): migrate Modal and Dialog to Hero UI compositional API"
```

---

### Task 15: alert-dialog

**Files:**

- Rewrite: `src/components/ui/alert-dialog.tsx`
- Sweep: 10 call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/alert-dialog.tsx
export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  type AlertDialogProps,
} from "@heroui/react";
import type { HTMLAttributes } from "react";
export function AlertDialogTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-lg font-semibold ${className ?? ""}`} {...rest} />;
}
export function AlertDialogDescription({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm text-default-500 ${className ?? ""}`} {...rest} />;
}
// shadcn had AlertDialogTrigger / AlertDialogAction / AlertDialogCancel which Hero UI
// does not provide as separate components. Project pattern is to control with isOpen state.
// If any caller used <AlertDialogTrigger asChild>, refactor to imperative open via state.
```

- [ ] **Step 2: Sweep call sites**

```bash
grep -rn 'AlertDialogTrigger\|AlertDialogAction\|AlertDialogCancel' src --include="*.tsx" | head
```

For each:

- `<AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>` → render the trigger (e.g., `<Button>`) directly in parent, attach `onClick={() => setOpen(true)}`.
- `<AlertDialogAction onClick={...}>OK</AlertDialogAction>` → `<Button color="danger" onPress={() => { onClick(); setOpen(false); }}>OK</Button>` inside `<AlertDialogFooter>`.
- `<AlertDialogCancel>Cancel</AlertDialogCancel>` → `<Button variant="light" onPress={() => setOpen(false)}>取消</Button>`.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/alert-dialog.tsx src
git commit -m "feat(ui): migrate AlertDialog to Hero UI"
```

---

### Task 16: drawer + sheet

**Files:**

- Rewrite: `src/components/ui/drawer.tsx`, `sheet.tsx`
- Sweep: 1 drawer + 2 sheet call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/drawer.tsx
export {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerFooter,
  type DrawerProps,
} from "@heroui/react";
```

```tsx
// src/components/ui/sheet.tsx
// Project's Sheet was Vaul-based or shadcn drawer; map to Hero UI Drawer.
export {
  Drawer as Sheet,
  DrawerContent as SheetContent,
  DrawerHeader as SheetHeader,
  DrawerBody as SheetBody,
  DrawerFooter as SheetFooter,
} from "@heroui/react";
import type { HTMLAttributes } from "react";
export function SheetTitle({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-lg font-semibold ${className ?? ""}`} {...rest} />;
}
export function SheetDescription({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`text-sm text-default-500 ${className ?? ""}`} {...rest} />;
}
```

- [ ] **Step 2: Sweep call sites**

```bash
grep -rln 'from "@/components/ui/drawer"\|from "@/components/ui/sheet"' src
```

For each, swap `open` → `isOpen`, `side="right"` → `placement="right"`. Convert nested JSX to compositional `<Drawer><DrawerContent>{(onClose) => <>...</>}</DrawerContent></Drawer>` pattern.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/{drawer,sheet}.tsx src
git commit -m "feat(ui): migrate Drawer and Sheet to Hero UI Drawer"
```

---

### Task 17: popover + tooltip

**Files:**

- Rewrite: `src/components/ui/popover.tsx`, `tooltip.tsx`
- Sweep: 5 popover + 9 tooltip call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/popover.tsx
export { Popover, PopoverTrigger, PopoverContent, type PopoverProps } from "@heroui/react";
```

```tsx
// src/components/ui/tooltip.tsx
export { Tooltip, type TooltipProps } from "@heroui/react";
// shadcn's TooltipProvider/TooltipTrigger/TooltipContent flatten into <Tooltip content>{trigger}</Tooltip>.
// Provide stub TooltipProvider as no-op (already in HeroUIProvider).
import type { ReactNode } from "react";
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
// Stub TooltipTrigger and TooltipContent to keep imports compiling — but call sites should refactor.
export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  return <>{children}</>;
}
export function TooltipContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 2: Sweep tooltip call sites to flat API**

shadcn pattern → Hero UI:

```tsx
// before
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild><Button>x</Button></TooltipTrigger>
    <TooltipContent>说明</TooltipContent>
  </Tooltip>
</TooltipProvider>

// after
<Tooltip content="说明">
  <Button>x</Button>
</Tooltip>
```

If `TooltipContent` was JSX (not text), pass it as `content={<JSX/>}`.

After sweep, the TooltipProvider/Trigger/Content stubs in `tooltip.tsx` should have zero remaining imports — delete them in step 4.

- [ ] **Step 3: Sweep popover call sites**

shadcn `<PopoverTrigger asChild>` → Hero UI does support `<PopoverTrigger>{element}</PopoverTrigger>` directly; drop `asChild`. Otherwise structure is identical.

- [ ] **Step 4: Remove tooltip stubs once unused**

```bash
grep -rn 'TooltipProvider\|TooltipTrigger\|TooltipContent' src --include="*.tsx"
```

If 0 hits outside `tooltip.tsx` itself, delete the stub exports from `tooltip.tsx`.

- [ ] **Step 5: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/{popover,tooltip}.tsx src
git commit -m "feat(ui): migrate Popover and Tooltip to Hero UI flat API"
```

---

### Task 18: dropdown-menu

**Files:**

- Rewrite: `src/components/ui/dropdown-menu.tsx`
- Sweep: 6 call sites

- [ ] **Step 1: Rewrite with name aliases**

```tsx
// src/components/ui/dropdown-menu.tsx
export {
  Dropdown as DropdownMenu,
  DropdownTrigger as DropdownMenuTrigger,
  DropdownMenu as DropdownMenuContent,
  DropdownItem as DropdownMenuItem,
  DropdownSection as DropdownMenuSeparator,
  type DropdownProps as DropdownMenuProps,
} from "@heroui/react";
```

This re-aliasing keeps the `DropdownMenu*` import names intact at call sites.

- [ ] **Step 2: Refactor `value`/`onValueChange` patterns**

If any call site uses `<DropdownMenuRadioGroup>` or `<DropdownMenuCheckboxItem>`, those don't exist in Hero UI; convert to plain `<DropdownMenuItem onClick>` and store selection in caller state.

```bash
grep -rn 'DropdownMenuRadioGroup\|DropdownMenuCheckboxItem\|DropdownMenuSub' src --include="*.tsx"
```

If 0 hits, no further action.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/dropdown-menu.tsx src
git commit -m "feat(ui): migrate DropdownMenu to Hero UI Dropdown"
```

---

### Task 19: tabs

**Files:**

- Rewrite: `src/components/ui/tabs.tsx`
- Sweep: 6 call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/tabs.tsx
export { Tabs, Tab, type TabsProps } from "@heroui/react";
```

- [ ] **Step 2: Sweep call sites**

shadcn 4-deep → Hero UI 2-deep:

```tsx
// before
<Tabs defaultValue="a" onValueChange={onChange}>
  <TabsList>
    <TabsTrigger value="a">A</TabsTrigger>
    <TabsTrigger value="b">B</TabsTrigger>
  </TabsList>
  <TabsContent value="a">{aBody}</TabsContent>
  <TabsContent value="b">{bBody}</TabsContent>
</Tabs>

// after
<Tabs defaultSelectedKey="a" onSelectionChange={onChange}>
  <Tab key="a" title="A">{aBody}</Tab>
  <Tab key="b" title="B">{bBody}</Tab>
</Tabs>
```

Enumerate:

```bash
grep -rn 'TabsList\|TabsTrigger\|TabsContent' src --include="*.tsx"
```

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/tabs.tsx src
git commit -m "feat(ui): migrate Tabs to Hero UI"
```

---

### Task 20: accordion + collapsible

**Files:**

- Rewrite: `src/components/ui/accordion.tsx`, `collapsible.tsx`
- Sweep: 2 accordion + 3 collapsible call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/accordion.tsx
export { Accordion, AccordionItem, type AccordionProps } from "@heroui/react";
// shadcn AccordionTrigger/AccordionContent flatten into AccordionItem props.
```

```tsx
// src/components/ui/collapsible.tsx
// Hero UI uses Disclosure for single-item collapsible.
export {
  Disclosure as Collapsible,
  DisclosureTrigger as CollapsibleTrigger,
  DisclosurePanel as CollapsibleContent,
  type DisclosureProps as CollapsibleProps,
} from "@heroui/react";
```

- [ ] **Step 2: Sweep accordion sites**

```tsx
// before
<Accordion type="single" collapsible>
  <AccordionItem value="x">
    <AccordionTrigger>Title</AccordionTrigger>
    <AccordionContent>Body</AccordionContent>
  </AccordionItem>
</Accordion>

// after
<Accordion>
  <AccordionItem key="x" title="Title">Body</AccordionItem>
</Accordion>
```

Enumerate `AccordionTrigger\|AccordionContent`:

```bash
grep -rn 'AccordionTrigger\|AccordionContent' src --include="*.tsx"
```

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/{accordion,collapsible}.tsx src
git commit -m "feat(ui): migrate Accordion and Collapsible to Hero UI"
```

---

### Task 21: breadcrumb + pagination

**Files:**

- Rewrite: `src/components/ui/breadcrumb.tsx`, `pagination.tsx`
- Sweep: 2 breadcrumb sites; pagination unused (per zero count); skip if so.

- [ ] **Step 1: Rewrite breadcrumb**

```tsx
// src/components/ui/breadcrumb.tsx
export {
  Breadcrumbs as Breadcrumb,
  BreadcrumbItem,
  type BreadcrumbsProps as BreadcrumbProps,
} from "@heroui/react";
// shadcn had BreadcrumbList/BreadcrumbLink/BreadcrumbPage/BreadcrumbSeparator.
// Hero UI flattens to <Breadcrumbs><BreadcrumbItem>...</BreadcrumbItem></Breadcrumbs>.
import type { HTMLAttributes, ReactNode } from "react";
export function BreadcrumbList({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function BreadcrumbLink({
  children,
  ...rest
}: HTMLAttributes<HTMLAnchorElement> & { href?: string }) {
  return <a {...rest}>{children}</a>;
}
export function BreadcrumbPage({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}
export function BreadcrumbSeparator() {
  return null;
}
```

- [ ] **Step 2: Rewrite pagination**

```tsx
// src/components/ui/pagination.tsx
export { Pagination, type PaginationProps } from "@heroui/react";
```

- [ ] **Step 3: Sweep breadcrumb call sites**

Refactor `<BreadcrumbList><BreadcrumbItem><BreadcrumbLink href><BreadcrumbPage>...</BreadcrumbItem><BreadcrumbSeparator/>...` to:

```tsx
<Breadcrumb>
  <BreadcrumbItem href="...">A</BreadcrumbItem>
  <BreadcrumbItem>B (current)</BreadcrumbItem>
</Breadcrumb>
```

Then delete the BreadcrumbList/Link/Page/Separator stubs from `breadcrumb.tsx` once no longer imported.

- [ ] **Step 4: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/{breadcrumb,pagination}.tsx src
git commit -m "feat(ui): migrate Breadcrumb and Pagination to Hero UI"
```

---

### Task 22: scroll-area → ScrollShadow

**Files:**

- Rewrite: `src/components/ui/scroll-area.tsx`
- Sweep: 2 call sites

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/scroll-area.tsx
// Hero UI provides ScrollShadow. The project also uses OverlayScrollbars for visual scrollbars;
// we keep that orthogonally — ScrollShadow only adds the gradient mask at edges.
export {
  ScrollShadow as ScrollArea,
  type ScrollShadowProps as ScrollAreaProps,
} from "@heroui/react";
import type { ReactNode } from "react";
// shadcn had <ScrollBar/>; Hero UI does not need it. Stub for import compatibility:
export function ScrollBar(_: { orientation?: "vertical" | "horizontal"; className?: string }) {
  return null;
}
```

- [ ] **Step 2: Sweep call sites**

```bash
grep -rln 'from "@/components/ui/scroll-area"' src
grep -rn '<ScrollBar' src --include="*.tsx"
```

For each call site: confirm `<ScrollBar>` removed (or kept as no-op stub). Confirm `<ScrollArea className="h-...">{children}</ScrollArea>` still renders correctly with ScrollShadow.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/scroll-area.tsx src
git commit -m "feat(ui): migrate ScrollArea to Hero UI ScrollShadow"
```

---

### Task 23: table

**Files:**

- Rewrite: `src/components/ui/table.tsx`
- Sweep: 1 call site

- [ ] **Step 1: Rewrite**

```tsx
// src/components/ui/table.tsx
export {
  Table,
  TableHeader,
  TableBody,
  TableColumn,
  TableRow,
  TableCell,
  type TableProps,
} from "@heroui/react";
// shadcn naming differences: TableHead → TableColumn, TableCaption/TableFooter not in Hero UI.
import type { HTMLAttributes, ReactNode } from "react";
export const TableHead = (props: HTMLAttributes<HTMLTableCellElement>) => <th {...props} />;
export const TableCaption = ({ children }: { children: ReactNode }) => (
  <caption className="text-default-500 text-sm">{children}</caption>
);
export const TableFooter = ({ children }: { children: ReactNode }) => <tfoot>{children}</tfoot>;
```

- [ ] **Step 2: Sweep call site**

The single call site likely uses shadcn-style `<TableHead>`. Convert to `<TableColumn>`.

- [ ] **Step 3: typecheck and commit**

```bash
pnpm typecheck
git add src/components/ui/table.tsx src
git commit -m "feat(ui): migrate Table to Hero UI"
```

---

### Task 24: field.tsx layout reskin (token-only changes)

**Files:**

- Modify: `src/components/ui/field.tsx` (internal classNames only — full structure preserved)

- [ ] **Step 1: Read the file and apply token mapping**

For each instance of these classes, swap as shown. The Field family has 10 components (FieldSet, FieldGroup, FieldLegend, Field, FieldContent, FieldLabel, FieldTitle, FieldDescription, FieldSeparator, FieldError) plus a `<Separator>` import.

| Old class                              | New class                                     |
| -------------------------------------- | --------------------------------------------- |
| `text-muted-foreground`                | `text-default-500`                            |
| `text-destructive`                     | `text-danger`                                 |
| `bg-background`                        | `bg-background` (unchanged — token name same) |
| `bg-primary/5` `bg-primary/10`         | unchanged (still valid Hero UI primary)       |
| `border-primary`                       | unchanged                                     |
| `text-primary`                         | unchanged                                     |
| `data-[invalid=true]:text-destructive` | `data-[invalid=true]:text-danger`             |

- [ ] **Step 2: Confirm internal `<Label>` and `<Separator>` imports**

These are imported from `@/components/ui/label` and `@/components/ui/separator`, which Tasks 6 and 13 already migrated to Hero UI. No import changes needed.

- [ ] **Step 3: typecheck and visual smoke**

```bash
pnpm typecheck
pnpm dev
```

Open a Studio form dialog (e.g., `/studio/departments` → "新建部门") and confirm:

- Field labels visible
- Validation errors red (now `--danger`)
- Field descriptions muted (now `--default-500`)

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/field.tsx
git commit -m "refactor(ui): retint Field family classes to Hero UI tokens"
```

---

### Task 25: sonner.tsx → Hero UI Toast

**Files:**

- Rewrite: `src/components/ui/sonner.tsx`
- Sweep: 26 call sites importing `toast` from `sonner`

- [ ] **Step 1: Rewrite the wrapper to keep import path stable**

```tsx
// src/components/ui/sonner.tsx
// Sonner replaced by Hero UI Toast. Keep the same import surface.
import { addToast } from "@heroui/react";

type ToastFn = (message: string, opts?: { description?: string }) => void;

export const toast = Object.assign(
  ((message, opts) => addToast({ title: message, description: opts?.description })) as ToastFn,
  {
    success: (message: string, opts?: { description?: string }) =>
      addToast({ title: message, description: opts?.description, color: "success" }),
    error: (message: string, opts?: { description?: string }) =>
      addToast({ title: message, description: opts?.description, color: "danger" }),
    warning: (message: string, opts?: { description?: string }) =>
      addToast({ title: message, description: opts?.description, color: "warning" }),
    info: (message: string, opts?: { description?: string }) =>
      addToast({ title: message, description: opts?.description, color: "primary" }),
  },
);

// shadcn's <Toaster /> is replaced by <ToastProvider /> mounted in layout.tsx.
// Export an empty stub so `<Toaster />` imports keep compiling.
export function Toaster() {
  return null;
}
```

- [ ] **Step 2: Sweep `from "sonner"` imports**

```bash
grep -rln 'from "sonner"' src
```

For each match, replace `from "sonner"` with `from "@/components/ui/sonner"`. Now all `toast.*` calls go through our wrapper.

- [ ] **Step 3: Remove `<Toaster />` mount in layout.tsx**

It was kept in Task 2 as transitional. Remove the `<Toaster />` JSX line and its import (`Toaster` from `@/components/ui/sonner`) from `src/app/layout.tsx`.

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Visual smoke**

`pnpm dev` → trigger a toast (e.g., create a department to fire `toast.success("部门已创建")`). Confirm Hero UI Toast appears with green success color.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/sonner.tsx src/app/layout.tsx src
git commit -m "feat(ui): migrate Sonner toast() shim to Hero UI Toast"
```

---

## Phase 4: Preserved component reskin

### Task 26: Reskin 5 preserved components to Hero UI tokens

**Files:**

- Modify: `src/components/ui/{sidebar,command,sortable-list,hover-card,empty}.tsx`

For each file, apply the token mapping below to internal `className` strings only. **Do not change component APIs or export shapes.**

| Old class                                          | New class                   |
| -------------------------------------------------- | --------------------------- |
| `bg-card` / `bg-popover`                           | `bg-content1`               |
| `bg-muted`                                         | `bg-default-100`            |
| `bg-accent`                                        | `bg-default-100`            |
| `hover:bg-accent`                                  | `hover:bg-default-200`      |
| `text-muted-foreground`                            | `text-default-500`          |
| `text-accent-foreground`                           | `text-default-700`          |
| `text-card-foreground` / `text-popover-foreground` | `text-foreground`           |
| `border-border` / `border-input`                   | `border-divider`            |
| `ring-ring`                                        | `ring-focus`                |
| `bg-destructive` / `text-destructive`              | `bg-danger` / `text-danger` |

`sidebar.tsx` keeps its own `--sidebar-*` token names (defined in globals.css) — do NOT remap `bg-sidebar` / `text-sidebar-foreground` etc.; those drive sidebar's distinct palette.

- [ ] **Step 1: Edit `sidebar.tsx`**

Apply mappings above. Preserve all `bg-sidebar*` / `text-sidebar*` classes.

- [ ] **Step 2: Edit `command.tsx`**

Apply mappings.

- [ ] **Step 3: Edit `sortable-list.tsx`**

Apply mappings. Note: any internal `<Button>` or other UI imports already auto-migrated.

- [ ] **Step 4: Edit `hover-card.tsx`**

Apply mappings. (Radix HoverCard internals stay; only outer styles change.)

- [ ] **Step 5: Edit `empty.tsx`**

Apply mappings.

- [ ] **Step 6: typecheck and visual smoke (light + dark)**

```bash
pnpm typecheck
pnpm dev
```

Toggle theme. Verify in dark mode:

- Sidebar background distinct from main bg
- Command palette opens with proper contrast
- Hover-card readable

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/{sidebar,command,sortable-list,hover-card,empty}.tsx
git commit -m "refactor(ui): retint preserved shadcn components to Hero UI tokens"
```

---

## Phase 5: Cleanup and verification

### Task 27: Delete aspect-ratio.tsx and rewrite 2 call sites

**Files:**

- Delete: `src/components/ui/aspect-ratio.tsx`
- Modify: 2 call sites (file paths from earlier grep)

- [ ] **Step 1: Find and rewrite call sites**

```bash
grep -rln 'from "@/components/ui/aspect-ratio"' src
```

Two files (`pre-interview-forms-view.tsx` and `ai-elements/suggestion.tsx`).

For each:

- Remove import line.
- Replace `<AspectRatio ratio={16/9}>...</AspectRatio>` with `<div className="aspect-[16/9]">...</div>`.
- Replace `ratio={1}` with `aspect-square`, `ratio={4/3}` with `aspect-[4/3]`, etc.

- [ ] **Step 2: Delete the wrapper**

```bash
rm src/components/ui/aspect-ratio.tsx
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): drop AspectRatio wrapper in favor of Tailwind aspect-* utility"
```

---

### Task 28: Remove unused dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Verify zero usage of each before removal**

```bash
for dep in sonner vaul; do
  count=$(grep -rln "from \"$dep\"" src 2>/dev/null | wc -l | tr -d ' ')
  echo "$dep: $count"
done
```

Expected: both `0`.

- [ ] **Step 2: Remove**

```bash
pnpm remove sonner vaul
```

- [ ] **Step 3: Confirm `cmdk` retention**

```bash
grep -rln "from \"cmdk\"" src
```

If `command.tsx` still imports `cmdk`, **keep** the dep. If 0 hits, also `pnpm remove cmdk`.

- [ ] **Step 4: typecheck and commit**

```bash
pnpm typecheck
git add package.json pnpm-lock.yaml
git commit -m "chore: drop sonner and vaul dependencies"
```

---

### Task 29: Final verification gate

**Files:** none (gate task)

- [ ] **Step 1: Full check matrix**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

All four commands must succeed. If any fails, fix the root cause — do not bypass.

- [ ] **Step 2: Grep audits**

```bash
grep -rn 'class="dark"\|className="dark"' src --include="*.tsx" --include="*.ts"
grep -rn 'from "sonner"\|from "vaul"' src --include="*.tsx" --include="*.ts"
grep -rn 'bg-card\|bg-popover\|bg-muted\|bg-accent\|text-muted-foreground\|text-accent-foreground\|text-destructive\|border-border\|border-input\|ring-ring' src/components/ui --include="*.tsx" | grep -v sidebar
```

Expected:

- No `class="dark"` or `className="dark"` matches.
- No `from "sonner"` or `from "vaul"` matches.
- No deprecated tokens in `src/components/ui/*` (except `sidebar.tsx`, which is filtered out).

- [ ] **Step 3: Component inventory**

```bash
ls src/components/ui/*.tsx | wc -l
```

Should be ≤ 47 (was 60+, minus 12 deleted unused, minus 1 aspect-ratio = ~47 remaining including 5 preserved + ~42 wrappers + LiveKit specials).

- [ ] **Step 4: package.json sanity**

```bash
grep -E '"(@heroui/react|framer-motion|sonner|vaul|input-otp|react-day-picker|recharts|react-resizable-panels|embla-carousel-react)"' package.json
```

Expected: only `@heroui/react` and `framer-motion` present; the rest absent.

---

### Task 30: Manual smoke test of major flows

**Files:** none (manual verification)

- [ ] **Step 1: Run dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Walk these flows in light mode then dark mode**

For each, note any visual regressions or interaction breakage in a checklist:

- [ ] Login / signup form (Better Auth flow)
- [ ] Studio interview list page (sidebar nav, tabs, table if any)
- [ ] Create interview dialog (Modal compositional API)
- [ ] Edit interview dialog (form, autocomplete, validation)
- [ ] Department creation dialog (Field family render, Toast on success)
- [ ] Resume upload page (file input, progress, errors)
- [ ] Interview room (camera/mic permission flow — LiveKit components untouched)
- [ ] Theme toggle (data-theme switching, all surfaces re-tint)
- [ ] Command palette / cmd-k (preserved cmdk, retinted)
- [ ] Sidebar collapse/expand
- [ ] Tooltip on any icon button
- [ ] Dropdown menu (user menu)
- [ ] Modal Esc / backdrop close

- [ ] **Step 3: Compare screenshots**

Take light + dark screenshots of:

- Landing page
- Studio interviews list
- Studio interview edit dialog
- Resume upload page

Visually confirm: **no two competing primary blues, no two radii in same view, no two contrast levels** within a single page (the original goal of the migration).

- [ ] **Step 4: Final commit and PR**

If any small fixups required during smoke test:

```bash
git add -A
git commit -m "fix(ui): smoke-test corrections for Hero UI migration"
```

Then push:

```bash
git push -u origin feat/heroui-migration
gh pr create --title "feat: migrate UI from shadcn/ui to Hero UI v3" \
  --body "$(cat <<'EOF'
## Summary
- Migrate 41 shadcn UI wrappers to Hero UI v3 (`@heroui/react`)
- Delete 12 unused shadcn files (form, calendar, input-otp, combobox, context-menu, menubar, navigation-menu, direction, item, chart, resizable, carousel) and their npm deps
- Preserve and retint 5 components Hero UI lacks (sidebar, command, sortable-list, hover-card, empty)
- Switch theme tokens to Hero UI v3 plugin; `next-themes` attribute moves from `class` to `data-theme`
- Replace Sonner toast with Hero UI Toast via thin shim at `@/components/ui/sonner`
- Drop AspectRatio wrapper in favor of Tailwind `aspect-*` utility

Spec: `docs/superpowers/specs/2026-05-08-heroui-migration-design.md`
Plan: `docs/superpowers/plans/2026-05-08-heroui-migration.md`

## Test plan
- [x] `pnpm typecheck` passes
- [x] `pnpm lint` passes
- [x] `pnpm test` passes
- [x] `pnpm build` produces working standalone output
- [x] Manual smoke (Task 30 checklist) — light + dark
- [x] No legacy `class="dark"` selectors remain
- [x] No `from "sonner"` / `from "vaul"` imports remain

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
