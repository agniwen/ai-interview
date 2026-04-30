# Frontend Refactor Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed in Auto Mode by the main session.

**Goal:** 在不改变业务行为的前提下，让前端 (`src/`) 在目录结构、组件拆分、组件复用、API 层架构上变得直观、优雅，并补充中英双语注释。No agent/ changes.

**Architecture:** 采用 _自下而上_ 的策略 — 先稳固「类型 / utils / api」三层基础设施，再回头切大组件。新代码全部加中英双语 JSDoc。所有改动以加法为主（新建模块 + re-export 桥接），保持向后兼容，避免一次性大重写引入回归。

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Hono, Drizzle ORM, shadcn/ui, Tailwind v4, React Query, Jotai.

---

## File Structure (target)

```
src/
├─ types/
│  ├─ index.ts            # 单入口 re-export / Single export entry
│  ├─ common.ts           # 通用类型（Nullable / Maybe / WithRequired ...）
│  ├─ interview.ts        # re-export from lib/interview/types
│  ├─ chat.ts             # 聊天领域类型
│  └─ studio.ts           # studio 领域类型
│
├─ lib/
│  ├─ utils/
│  │  ├─ index.ts         # cn + barrel re-export
│  │  ├─ cn.ts            # className 合并
│  │  ├─ format.ts        # 数字 / 日期 / 文本格式化
│  │  ├─ time.ts          # 时间 / 时长 / 相对时间
│  │  ├─ array.ts         # ensureArray / chunk / unique
│  │  ├─ object.ts        # pick / omit / deepClone (saner versions)
│  │  └─ guards.ts        # isString / isNonEmpty / hasOwn
│  ├─ utils.ts            # 兼容旧 import: re-export from utils/index
│  └─ api/
│     ├─ client.ts        # apiFetch — 统一 fetch、错误、JSON 解码
│     ├─ errors.ts        # ApiError, isApiError
│     ├─ endpoints/
│     │  ├─ chat.ts       # 收敛 chat-api.ts 的内容
│     │  ├─ interview.ts  # 候选人侧
│     │  ├─ studio.ts     # studio admin
│     │  └─ resume.ts     # 简历相关
│     └─ index.ts         # 统一 re-export
│
├─ hooks/
│  ├─ ...                # 既有保留
│  └─ agents-ui/
│     ├─ _internals/
│     │  └─ use-audio-frequency-bins.ts   # 5 个可视化 hook 共用底座
│     └─ use-agent-audio-visualizer-*.ts  # 改造为薄包装
```

---

## Tasks

### Task 1: Set up centralized `src/types/` with bilingual comments

**Files:**

- Create: `src/types/index.ts`
- Create: `src/types/common.ts`
- Create: `src/types/interview.ts`
- Create: `src/types/chat.ts`
- Create: `src/types/studio.ts`

- [ ] **Step 1:** Create `src/types/common.ts` with `Nullable`, `Maybe`, `WithRequired`, `ValueOf`, `AsyncResult` etc. — each typed alias accompanied by a Chinese + English JSDoc.
- [ ] **Step 2:** Create `src/types/interview.ts` re-exporting from `src/lib/interview/types.ts` (single source of truth for now).
- [ ] **Step 3:** Create `src/types/chat.ts` re-exporting `ChatConversationSummary`, `ChatConversationDetail`, `UploadedAttachment` from `src/lib/chat-api.ts` (later we'll move them; for now re-export).
- [ ] **Step 4:** Create `src/types/studio.ts` re-exporting selected types from `src/lib/studio-interviews.ts`, `src/lib/candidate-forms.ts` etc.
- [ ] **Step 5:** Create `src/types/index.ts` barrel.
- [ ] **Step 6:** Verify nothing broke — run `pnpm typecheck`.

### Task 2: Build themed `src/lib/utils/` modules

**Files:**

- Create: `src/lib/utils/cn.ts`
- Create: `src/lib/utils/format.ts`
- Create: `src/lib/utils/time.ts`
- Create: `src/lib/utils/array.ts`
- Create: `src/lib/utils/object.ts`
- Create: `src/lib/utils/guards.ts`
- Create: `src/lib/utils/index.ts`
- Modify: `src/lib/utils.ts` — keep `cn` export by re-exporting from new location

- [ ] **Step 1:** `cn.ts` — move existing `cn` here with bilingual JSDoc.
- [ ] **Step 2:** `format.ts` — `formatNumber`, `formatPercent`, `truncate`, `pluralize`-like helpers.
- [ ] **Step 3:** `time.ts` — `formatDate`, `formatDuration`, `formatRelativeTime` (使用 Intl.RelativeTimeFormat).
- [ ] **Step 4:** `array.ts` — `ensureArray`, `chunk`, `unique`, `partition`.
- [ ] **Step 5:** `object.ts` — `pick`, `omit`, `isPlainObject`.
- [ ] **Step 6:** `guards.ts` — `isString`, `isNumber`, `isNonEmptyString`, `isNonEmptyArray`, `hasOwn`.
- [ ] **Step 7:** `index.ts` — barrel re-export.
- [ ] **Step 8:** Rewrite `src/lib/utils.ts` to `export * from "./utils/index"` (preserve `cn` import paths).
- [ ] **Step 9:** Run typecheck.

### Task 3: Unified API client layer

**Files:**

- Create: `src/lib/api/client.ts`
- Create: `src/lib/api/errors.ts`
- Create: `src/lib/api/endpoints/chat.ts`
- Create: `src/lib/api/index.ts`
- Modify: `src/lib/chat-api.ts` — re-export from new location to keep backward compat.

- [ ] **Step 1:** `errors.ts` defines `ApiError` (status, code, message, payload), `isApiError`, `assertOk`.
- [ ] **Step 2:** `client.ts` defines `apiFetch<T>(path, init)` — handles JSON encoding, content-type, error wrapping, optional AbortSignal.
- [ ] **Step 3:** `endpoints/chat.ts` — port functions from `lib/chat-api.ts` to use `apiFetch`.
- [ ] **Step 4:** Update `lib/chat-api.ts` to re-export those functions (backward compat).
- [ ] **Step 5:** Bilingual JSDoc throughout.
- [ ] **Step 6:** Run typecheck.

### Task 4: Refactor audio visualizer hooks

**Files:**

- Create: `src/hooks/agents-ui/_internals/use-audio-frequency-bins.ts`
- Modify: each `use-agent-audio-visualizer-*.ts` to consume the primitive (only if signatures stay identical)

- [ ] **Step 1:** Read all 5 visualizer hooks.
- [ ] **Step 2:** Identify common primitive (likely subscribing to track + producing N-bin smoothed magnitudes).
- [ ] **Step 3:** Implement `useAudioFrequencyBins` with bilingual JSDoc and unit-test-friendly API.
- [ ] **Step 4:** **Only refactor visualizer hooks that share signatures** — if a hook's logic diverges materially, leave it alone for this pass and document why.
- [ ] **Step 5:** Run typecheck.

### Task 5: Split studio interviews god components

**Files:**

- Modify: `src/app/(auth)/studio/interviews/_components/interview-detail-dialog.tsx`
- Modify: `src/app/(auth)/studio/interviews/_components/interview-management-page.tsx`
- Create: smaller subcomponents under `interviews/_components/sections/`

- [ ] **Step 1:** Map current dialog into Tab sections; each Tab body becomes its own file.
- [ ] **Step 2:** Extract pure-display subcomponents first; keep state in the parent.
- [ ] **Step 3:** Maintain props contract — no behavior changes.
- [ ] **Step 4:** Run typecheck after each extraction.

### Task 6: Bilingual JSDoc pass

- [ ] **Step 1:** All new files (Tasks 1-5) ship with bilingual comments inline.
- [ ] **Step 2:** Sweep top-level exported symbols in `src/lib/` for missing JSDoc and add bilingual comments.
- [ ] **Step 3:** Make sure no comment is left in only one language for newly created files.

### Task 7: Final verification

- [ ] **Step 1:** `pnpm typecheck`
- [ ] **Step 2:** `pnpm lint`
- [ ] **Step 3:** Confirm zero new errors vs. baseline.

---

## Out of scope for this pass

- 重写 `prompt-input.tsx` (1349 行) — 因为它来自 ai-elements 的注册表，重构后续单独立项。
- 重写 `react-shader-toy.tsx` — 第三方移植代码。
- i18n 框架接入 — 只做注释双语化，业务文案保持中文。
- 增加测试框架 — 与 refactor 解耦，单独立项更稳。
- agent/ 目录的任何更改。
