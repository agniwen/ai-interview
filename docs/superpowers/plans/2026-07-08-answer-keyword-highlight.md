# 候选人回答关键词自动高亮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在面试报告与问答记录中，用纯前端规则/词典自动识别并高亮候选人相关文本里的技能、数字/绩效、风险词三类关键词，两处结果一致，可按类别开关。

**Architecture:** 一个纯函数提取层 `@arc/shared/answer-keywords`（同步、可测）产出关键词片段；web 侧 `HighlightedText` 渲染 `<mark>`，`KeywordHighlightProvider` + `KeywordHighlightLegend` 提供共享的分类开关状态；在 `studio-person-detail-panel.tsx` 的报告 Tab 内接入。无 LLM、不改数据库、不动后端。

**Tech Stack:** TypeScript、React 19、Vitest、Tailwind CSS v4、`@arc/shared` 工作区包。

## Global Constraints

- 提取器放 `@arc/shared`，纯/同构，不引入 `node:*`、web 运行时或 `@/` 本地模块。
- `KeywordSpan.start/end` 为 JS 字符串下标（UTF-16 code unit），与 `String.prototype.slice(start, end)` 一致。
- 类别固定三类：`"skill" | "metric" | "risk"`；优先级 `risk > skill > metric`。
- metric 只匹配紧跟单位/百分号的数字；裸数字（年份/题号/年龄/版本号）不命中。
- 高亮文本范围：候选人原话（问答记录 `user` 气泡、报告证据 `quote`）+ AI 评价文本（`overallAssessment`、逐题 `assessment`）；**不**高亮面试官（`assistant`）气泡。
- 中文注释保留项目双语风格即可；提交用 conventional commits。
- 每个任务结束前跑对应测试到绿；全部完成后跑 `pnpm fix` 统一格式。

---

## File Structure

**新建（提取层，`@arc/shared`）：**

- `packages/shared/src/answer-keywords-dictionary.ts` — 内置技能词典、风险词表、metric 正则。
- `packages/shared/src/answer-keywords.ts` — 类型 + `extractAnswerKeywords`。
- `packages/shared/src/answer-keywords.test.ts` — 提取器单测。

**新建（web 高亮 UI，同目录 `.../interview-detail/keyword-highlight/`）：**

- `context.tsx` — `KeywordHighlightProvider` / `useKeywordHighlight` / `ALL_KEYWORD_CATEGORIES`。
- `highlighted-text.tsx` — `HighlightedText` 组件。
- `legend.tsx` — `KeywordHighlightLegend` 组件。
- `highlighted-text.test.tsx` — 组件测试。
- `legend.test.tsx` — 图例测试。

**修改：**

- `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/conversation-transcript.tsx` — 候选人气泡接入。
- `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.tsx` — 评价/证据接入 + 集成测试 `evaluation-results.highlight.test.tsx`（新建）。
- `apps/ai-recruitment-copilot/src/components/features/studio/studio-person-detail-panel.tsx` — 报告 Tab 内包 Provider + 渲染 Legend。

---

## Task 1: 关键词提取器 `@arc/shared/answer-keywords`

**Files:**

- Create: `packages/shared/src/answer-keywords-dictionary.ts`
- Create: `packages/shared/src/answer-keywords.ts`
- Test: `packages/shared/src/answer-keywords.test.ts`

**Interfaces:**

- Produces:
  - `type KeywordCategory = "skill" | "metric" | "risk"`
  - `interface KeywordSpan { start: number; end: number; text: string; category: KeywordCategory }`
  - `interface ExtractOptions { extraSkills?: string[] }`
  - `function extractAnswerKeywords(text: string, options?: ExtractOptions): KeywordSpan[]`（返回按 `start` 升序、互不重叠的片段）

- [ ] **Step 1: 写失败测试**

创建 `packages/shared/src/answer-keywords.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { extractAnswerKeywords, type KeywordSpan } from "./answer-keywords";

function texts(spans: KeywordSpan[]): string[] {
  return spans.map((span) => span.text);
}

describe("extractAnswerKeywords", () => {
  it("returns empty for empty input", () => {
    expect(extractAnswerKeywords("")).toEqual([]);
  });

  it("matches skill terms including symbol-bearing and Chinese", () => {
    const spans = extractAnswerKeywords("我用 React 和 Node.js 做过项目管理");
    expect(texts(spans)).toEqual(expect.arrayContaining(["React", "Node.js", "项目管理"]));
  });

  it("does not match a latin skill inside a larger word", () => {
    const spans = extractAnswerKeywords("javascript 很熟");
    expect(spans.filter((span) => span.text.toLowerCase() === "java")).toHaveLength(0);
  });

  it("matches numbers with units but not bare numbers", () => {
    const spans = extractAnswerKeywords("绩效提升30%，带10人团队，3.5年经验");
    expect(texts(spans)).toEqual(expect.arrayContaining(["30%", "10人", "3.5年"]));
    const bare = extractAnswerKeywords("我是2024届，做对了第3题");
    expect(texts(bare)).not.toEqual(expect.arrayContaining(["2024", "3"]));
  });

  it("matches risk words", () => {
    const spans = extractAnswerKeywords("这个我不太清楚，应该是别人做的");
    const risks = spans.filter((span) => span.category === "risk").map((span) => span.text);
    expect(risks).toEqual(expect.arrayContaining(["不太清楚", "应该是"]));
  });

  it("prefers risk over skill on identical overlap", () => {
    const spans = extractAnswerKeywords("这题我不太清楚", { extraSkills: ["不太清楚"] });
    expect(spans.find((span) => span.text === "不太清楚")?.category).toBe("risk");
  });

  it("returns non-overlapping spans in ascending order", () => {
    const spans = extractAnswerKeywords("没做过数据分析，绩效提升30%");
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
    }
  });

  it("merges and dedupes extraSkills case-insensitively", () => {
    const spans = extractAnswerKeywords("我精通 ReScript 框架", {
      extraSkills: ["ReScript", "rescript"],
    });
    expect(spans.filter((span) => span.text.toLowerCase() === "rescript")).toHaveLength(1);
  });

  it("produces identical spans for the same text", () => {
    const sample = "绩效提升30%，负责项目管理";
    expect(extractAnswerKeywords(sample)).toEqual(extractAnswerKeywords(sample));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/shared exec vitest run src/answer-keywords.test.ts`
Expected: FAIL —「Cannot find module './answer-keywords'」。

- [ ] **Step 3: 写词典模块**

创建 `packages/shared/src/answer-keywords-dictionary.ts`：

```ts
/**
 * 候选人回答关键词高亮的内置词表与正则。词条为初始集合，可后续增补——不属架构决策。
 * Built-in dictionaries/regex for answer-keyword highlighting; an initial set, extend later.
 */

/** 技能词典：技术 + 管理/能力词。含符号技能按完整字面量登记、整体匹配。 */
export const BUILT_IN_SKILLS: readonly string[] = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "Kotlin",
  "Swift",
  "Go",
  "Rust",
  "C++",
  "C#",
  "PHP",
  "Ruby",
  "Scala",
  "Node.js",
  "React",
  "React Native",
  "Vue",
  "Angular",
  "Next.js",
  "TailwindCSS",
  "HTML",
  "CSS",
  "Spring",
  "Django",
  "Flask",
  "GraphQL",
  "MySQL",
  "PostgreSQL",
  "MongoDB",
  "Redis",
  "Kafka",
  "Elasticsearch",
  "Hadoop",
  "Spark",
  "Docker",
  "Kubernetes",
  "AWS",
  "阿里云",
  "Linux",
  "Nginx",
  "项目管理",
  "团队管理",
  "团队协作",
  "跨部门协作",
  "需求分析",
  "架构设计",
  "性能优化",
  "数据分析",
  "机器学习",
  "深度学习",
  "自然语言处理",
  "敏捷开发",
  "带团队",
  "招聘",
  "绩效管理",
  "预算管理",
  "供应链",
  "市场营销",
  "用户增长",
];

/** 风险词：表意含糊或负面的信号词。 */
export const BUILT_IN_RISK_WORDS: readonly string[] = [
  "离职",
  "被裁",
  "裁员",
  "没做过",
  "没接触过",
  "不太清楚",
  "不清楚",
  "不了解",
  "不确定",
  "应该是",
  "大概",
  "可能吧",
  "记不清",
  "忘了",
  "没经验",
  "不擅长",
  "没参与",
  "打杂",
  "被动",
  "没结果",
  "失败",
];

/**
 * 带含义的数字：只匹配紧跟单位/百分号的数字。裸数字不命中。
 * 分支顺序：货币前缀 → 数字+单位（多字单位 `万元` 必须排在单字 `万`/`元` 之前）。
 * 已知局限：`2024年` 这类含单位的年份会被当 metric 命中，属可接受噪声。
 */
export const METRIC_REGEX =
  /[￥¥]\s?\d+(?:\.\d+)?(?:[万亿千])?(?:元)?|\d+(?:\.\d+)?\s?(?:万元|万|亿|千|个|人|名|位|年|月|天|次|倍|条|项|台|件|元|%|％)/g;
```

- [ ] **Step 4: 写提取器实现**

创建 `packages/shared/src/answer-keywords.ts`：

```ts
import { BUILT_IN_RISK_WORDS, BUILT_IN_SKILLS, METRIC_REGEX } from "./answer-keywords-dictionary";

export type KeywordCategory = "skill" | "metric" | "risk";

export interface KeywordSpan {
  /** JS 字符串下标（UTF-16 code unit），含 / inclusive start. */
  start: number;
  /** 不含；与 String.prototype.slice(start, end) 一致 / exclusive end. */
  end: number;
  text: string;
  category: KeywordCategory;
}

export interface ExtractOptions {
  extraSkills?: string[];
}

const CATEGORY_PRIORITY: Record<KeywordCategory, number> = {
  risk: 3,
  skill: 2,
  metric: 1,
};

const LATIN_CHAR = /[A-Za-z0-9]/;
const HAS_LATIN_LETTER = /[A-Za-z]/;

function buildSkillList(extraSkills?: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const raw of [...BUILT_IN_SKILLS, ...(extraSkills ?? [])]) {
    const term = raw.trim();
    if (!term) {
      continue;
    }
    const key = term.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    list.push(term);
  }
  return list;
}

function matchSkills(text: string, skills: string[]): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  const haystack = text.toLowerCase();
  for (const term of skills) {
    const needle = term.toLowerCase();
    const latin = HAS_LATIN_LETTER.test(term);
    let from = 0;
    for (;;) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) {
        break;
      }
      const end = idx + needle.length;
      from = idx + 1;
      if (latin) {
        const before = idx > 0 ? text[idx - 1] : "";
        const after = end < text.length ? text[end] : "";
        if (LATIN_CHAR.test(before) || LATIN_CHAR.test(after)) {
          continue;
        }
      }
      spans.push({ start: idx, end, text: text.slice(idx, end), category: "skill" });
    }
  }
  return spans;
}

function matchMetrics(text: string): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  for (const match of text.matchAll(METRIC_REGEX)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length, text: match[0], category: "metric" });
  }
  return spans;
}

function matchRisks(text: string): KeywordSpan[] {
  const spans: KeywordSpan[] = [];
  for (const word of BUILT_IN_RISK_WORDS) {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(word, from);
      if (idx === -1) {
        break;
      }
      spans.push({ start: idx, end: idx + word.length, text: word, category: "risk" });
      from = idx + 1;
    }
  }
  return spans;
}

function resolveOverlaps(candidates: KeywordSpan[], length: number): KeywordSpan[] {
  const ordered = [...candidates].sort((a, b) => {
    const byPriority = CATEGORY_PRIORITY[b.category] - CATEGORY_PRIORITY[a.category];
    if (byPriority !== 0) {
      return byPriority;
    }
    const byLength = b.end - b.start - (a.end - a.start);
    if (byLength !== 0) {
      return byLength;
    }
    return a.start - b.start;
  });
  const occupied = new Array<boolean>(length).fill(false);
  const accepted: KeywordSpan[] = [];
  for (const span of ordered) {
    let free = true;
    for (let i = span.start; i < span.end; i++) {
      if (occupied[i]) {
        free = false;
        break;
      }
    }
    if (!free) {
      continue;
    }
    for (let i = span.start; i < span.end; i++) {
      occupied[i] = true;
    }
    accepted.push(span);
  }
  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

export function extractAnswerKeywords(text: string, options?: ExtractOptions): KeywordSpan[] {
  if (!text) {
    return [];
  }
  const skills = buildSkillList(options?.extraSkills);
  const candidates = [...matchSkills(text, skills), ...matchMetrics(text), ...matchRisks(text)];
  return resolveOverlaps(candidates, text.length);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @arc/shared exec vitest run src/answer-keywords.test.ts`
Expected: PASS（9 个用例全绿）。

- [ ] **Step 6: 提交**

```bash
git add packages/shared/src/answer-keywords.ts packages/shared/src/answer-keywords-dictionary.ts packages/shared/src/answer-keywords.test.ts
git commit -m "feat(shared): 候选人回答关键词提取器（技能/数字/风险词）"
```

---

## Task 2: 分类开关状态 + 图例

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/context.tsx`
- Create: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/legend.tsx`
- Test: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/legend.test.tsx`

**Interfaces:**

- Consumes: `KeywordCategory`（Task 1）。
- Produces:
  - `const ALL_KEYWORD_CATEGORIES: readonly KeywordCategory[]`
  - `function KeywordHighlightProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useKeywordHighlight(): { enabledCategories: Set<KeywordCategory>; toggleCategory: (c: KeywordCategory) => void }`（无 Provider 时返回默认全开 + 空 toggle，不抛错）
  - `function KeywordHighlightLegend({ className }?: { className?: string }): JSX.Element`

- [ ] **Step 1: 写 context**

创建 `.../keyword-highlight/context.tsx`：

```tsx
"use client";

import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const ALL_KEYWORD_CATEGORIES: readonly KeywordCategory[] = ["skill", "metric", "risk"];

interface KeywordHighlightContextValue {
  enabledCategories: Set<KeywordCategory>;
  toggleCategory: (category: KeywordCategory) => void;
}

const DEFAULT_VALUE: KeywordHighlightContextValue = {
  enabledCategories: new Set(ALL_KEYWORD_CATEGORIES),
  toggleCategory: () => {
    // 无 Provider 时的空实现：高亮默认全开、开关不可用。
  },
};

const KeywordHighlightContext = createContext<KeywordHighlightContextValue>(DEFAULT_VALUE);

export function KeywordHighlightProvider({ children }: { children: React.ReactNode }) {
  const [enabledCategories, setEnabledCategories] = useState<Set<KeywordCategory>>(
    () => new Set(ALL_KEYWORD_CATEGORIES),
  );

  const toggleCategory = useCallback((category: KeywordCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ enabledCategories, toggleCategory }),
    [enabledCategories, toggleCategory],
  );

  return (
    <KeywordHighlightContext.Provider value={value}>{children}</KeywordHighlightContext.Provider>
  );
}

export function useKeywordHighlight(): KeywordHighlightContextValue {
  return useContext(KeywordHighlightContext);
}
```

- [ ] **Step 2: 写 legend**

创建 `.../keyword-highlight/legend.tsx`：

```tsx
"use client";

import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { cn } from "@arc/shared/utils";
import { useKeywordHighlight } from "./context";

const CATEGORY_META: { category: KeywordCategory; label: string; dotClass: string }[] = [
  { category: "skill", label: "技能", dotClass: "bg-blue-500" },
  { category: "metric", label: "数字/绩效", dotClass: "bg-emerald-500" },
  { category: "risk", label: "风险词", dotClass: "bg-amber-500" },
];

export function KeywordHighlightLegend({ className }: { className?: string }) {
  const { enabledCategories, toggleCategory } = useKeywordHighlight();
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-muted-foreground text-xs">关键词高亮</span>
      {CATEGORY_META.map((meta) => {
        const active = enabledCategories.has(meta.category);
        return (
          <button
            aria-pressed={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
              active
                ? "border-border bg-background"
                : "border-border/50 bg-muted/40 text-muted-foreground opacity-60",
            )}
            key={meta.category}
            onClick={() => toggleCategory(meta.category)}
            type="button"
          >
            <span
              className={cn("size-2 rounded-full", meta.dotClass, active ? "" : "opacity-40")}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: 写图例测试**

创建 `.../keyword-highlight/legend.test.tsx`：

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeywordHighlightProvider } from "./context";
import { KeywordHighlightLegend } from "./legend";

describe("KeywordHighlightLegend", () => {
  it("renders a toggle for each category, all active by default", () => {
    const html = renderToStaticMarkup(
      <KeywordHighlightProvider>
        <KeywordHighlightLegend />
      </KeywordHighlightProvider>,
    );
    expect(html).toContain("技能");
    expect(html).toContain("数字/绩效");
    expect(html).toContain("风险词");
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(3);
  });
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail/keyword-highlight/legend.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/context.tsx apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/legend.tsx apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/legend.test.tsx
git commit -m "feat(studio): 关键词高亮分类开关状态与图例"
```

---

## Task 3: 高亮渲染组件 `HighlightedText`

**Files:**

- Create: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.tsx`
- Test: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.test.tsx`

**Interfaces:**

- Consumes: `extractAnswerKeywords`、`KeywordCategory`（Task 1）；`ALL_KEYWORD_CATEGORIES`（Task 2）。
- Produces: `function HighlightedText(props: { text: string; enabledCategories?: Set<KeywordCategory>; extraSkills?: string[]; className?: string }): JSX.Element`（命中片段渲染 `<mark data-category=...>`，其余纯文本；外层 `whitespace-pre-wrap`）。

- [ ] **Step 1: 写失败测试**

创建 `.../keyword-highlight/highlighted-text.test.tsx`：

```tsx
import type { KeywordCategory } from "@arc/shared/answer-keywords";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "./highlighted-text";

describe("HighlightedText", () => {
  it("wraps known keywords in <mark> with category", () => {
    const html = renderToStaticMarkup(<HighlightedText text="绩效提升30%，负责项目管理" />);
    expect(html).toContain('data-category="metric"');
    expect(html).toContain('data-category="skill"');
    expect(html).toContain(">30%<");
  });

  it("respects enabledCategories filter", () => {
    const only: Set<KeywordCategory> = new Set(["skill"]);
    const html = renderToStaticMarkup(
      <HighlightedText enabledCategories={only} text="绩效提升30%，负责项目管理" />,
    );
    expect(html).not.toContain('data-category="metric"');
    expect(html).toContain('data-category="skill"');
  });

  it("renders plain text when nothing matches", () => {
    const html = renderToStaticMarkup(<HighlightedText text="今天天气不错" />);
    expect(html).not.toContain("<mark");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.test.tsx`
Expected: FAIL —「Cannot find module './highlighted-text'」。

- [ ] **Step 3: 写组件实现**

创建 `.../keyword-highlight/highlighted-text.tsx`：

```tsx
"use client";

import { extractAnswerKeywords, type KeywordCategory } from "@arc/shared/answer-keywords";
import { cn } from "@arc/shared/utils";
import { useMemo } from "react";
import { ALL_KEYWORD_CATEGORIES } from "./context";

const CATEGORY_CLASS: Record<KeywordCategory, string> = {
  skill: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  metric: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  risk: "bg-amber-500/20 text-amber-800 dark:text-amber-300",
};

const DEFAULT_ENABLED = new Set<KeywordCategory>(ALL_KEYWORD_CATEGORIES);

interface HighlightedTextProps {
  text: string;
  enabledCategories?: Set<KeywordCategory>;
  extraSkills?: string[];
  className?: string;
}

interface Segment {
  key: string;
  text: string;
  category: KeywordCategory | null;
}

export function HighlightedText({
  text,
  enabledCategories = DEFAULT_ENABLED,
  extraSkills,
  className,
}: HighlightedTextProps) {
  const spans = useMemo(() => extractAnswerKeywords(text, { extraSkills }), [text, extraSkills]);

  const segments = useMemo<Segment[]>(() => {
    const visible = spans.filter((span) => enabledCategories.has(span.category));
    const result: Segment[] = [];
    let cursor = 0;
    for (const span of visible) {
      if (span.start > cursor) {
        result.push({ key: `t-${cursor}`, text: text.slice(cursor, span.start), category: null });
      }
      result.push({
        key: `m-${span.start}`,
        text: text.slice(span.start, span.end),
        category: span.category,
      });
      cursor = span.end;
    }
    if (cursor < text.length) {
      result.push({ key: `t-${cursor}`, text: text.slice(cursor), category: null });
    }
    return result;
  }, [spans, enabledCategories, text]);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment) =>
        segment.category ? (
          <mark
            className={cn("rounded px-0.5", CATEGORY_CLASS[segment.category])}
            data-category={segment.category}
            key={segment.key}
          >
            {segment.text}
          </mark>
        ) : (
          <span key={segment.key}>{segment.text}</span>
        ),
      )}
    </span>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.tsx apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/keyword-highlight/highlighted-text.test.tsx
git commit -m "feat(studio): HighlightedText 关键词高亮渲染组件"
```

---

## Task 4: 接入问答记录与评估报告

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/conversation-transcript.tsx`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.tsx`
- Test: `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.highlight.test.tsx`（新建）

**Interfaces:**

- Consumes: `HighlightedText`（Task 3）、`useKeywordHighlight`（Task 2）。
- Produces: 无新导出；仅改渲染。

- [ ] **Step 1: 写集成失败测试**

创建 `.../interview-detail/evaluation-results.highlight.test.tsx`：

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvaluationResults } from "./evaluation-results";

describe("EvaluationResults highlighting", () => {
  it("highlights skill and metric keywords in question assessment", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{
          questions: [
            { order: 1, question: "介绍项目", assessment: "候选人负责项目管理，绩效提升30%" },
          ],
        }}
      />,
    );
    expect(html).toContain('data-category="skill"');
    expect(html).toContain('data-category="metric"');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail/evaluation-results.highlight.test.tsx`
Expected: FAIL（`data-category` 不存在，评价文本仍是纯文本）。

- [ ] **Step 3: 改 `evaluation-results.tsx` — 顶部导入**

在 `evaluation-results.tsx` 顶部（现有 import 之后）加入：

```tsx
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
```

- [ ] **Step 4: 改 `EvidenceList` — 证据 quote 高亮**

将 `EvidenceList` 的 props 加上 `enabledCategories`，并把 quote 文本换成 `HighlightedText`。把：

```tsx
function EvidenceList({
  evidence,
  onEvidenceSelect,
}: {
  evidence: EvidenceQuote[];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
```

改为（新增 `enabledCategories` 参数与类型导入）：

```tsx
function EvidenceList({
  enabledCategories,
  evidence,
  onEvidenceSelect,
}: {
  enabledCategories: Set<KeywordCategory>;
  evidence: EvidenceQuote[];
  onEvidenceSelect?: (evidence: EvidenceQuote) => void;
}) {
```

并在文件顶部的类型导入处加入 `KeywordCategory`（与 Step 3 的 import 合并成一行）：

```tsx
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
import type { KeywordCategory } from "@arc/shared/answer-keywords";
```

再把 `EvidenceList` 内的 quote 渲染，从：

```tsx
<span className="min-w-0 flex-1 truncate">“{item.quote}”</span>
```

改为：

```tsx
<span className="min-w-0 flex-1 truncate">
  “
  <HighlightedText
    className="whitespace-normal"
    enabledCategories={enabledCategories}
    text={item.quote ?? ""}
  />
  ”
</span>
```

（`whitespace-normal` 经 tailwind-merge 覆盖组件默认的 `whitespace-pre-wrap`，保留单行 truncate。）

- [ ] **Step 5: 改 `EvaluationResults` — 读取状态并接入评价文本**

在 `EvaluationResults` 函数体开头加入：

```tsx
const { enabledCategories } = useKeywordHighlight();
```

把 overallAssessment 段，从：

```tsx
{
  data.overallAssessment && (
    <p className="text-muted-foreground text-sm leading-normal">{data.overallAssessment}</p>
  );
}
```

改为：

```tsx
{
  data.overallAssessment && (
    <p className="text-muted-foreground text-sm leading-normal">
      <HighlightedText enabledCategories={enabledCategories} text={data.overallAssessment} />
    </p>
  );
}
```

把逐题 assessment 段，从：

```tsx
{
  q.assessment && <p className="mt-1.5 text-muted-foreground leading-normal">{q.assessment}</p>;
}
```

改为：

```tsx
{
  q.assessment && (
    <p className="mt-1.5 text-muted-foreground leading-normal">
      <HighlightedText enabledCategories={enabledCategories} text={q.assessment} />
    </p>
  );
}
```

把 `EvidenceList` 的调用，从：

```tsx
{
  Array.isArray(q.evidence) ? (
    <EvidenceList evidence={q.evidence} onEvidenceSelect={onEvidenceSelect} />
  ) : null;
}
```

改为：

```tsx
{
  Array.isArray(q.evidence) ? (
    <EvidenceList
      enabledCategories={enabledCategories}
      evidence={q.evidence}
      onEvidenceSelect={onEvidenceSelect}
    />
  ) : null;
}
```

- [ ] **Step 6: 跑集成测试确认通过**

Run: `pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail/evaluation-results.highlight.test.tsx`
Expected: PASS。

- [ ] **Step 7: 改 `conversation-transcript.tsx` — 候选人气泡接入**

顶部 import 处加入：

```tsx
import { HighlightedText } from "./keyword-highlight/highlighted-text";
import { useKeywordHighlight } from "./keyword-highlight/context";
```

在组件内 `const displayTurns = useMemo(...)` 之后加入：

```tsx
const { enabledCategories } = useKeywordHighlight();
```

把候选人气泡渲染，从：

```tsx
{
  isUser ? (
    <span className="whitespace-pre-wrap">{turn.message}</span>
  ) : (
    <Markdown>{turn.message}</Markdown>
  );
}
```

改为：

```tsx
{
  isUser ? (
    <HighlightedText enabledCategories={enabledCategories} text={turn.message} />
  ) : (
    <Markdown>{turn.message}</Markdown>
  );
}
```

- [ ] **Step 8: 提交**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.tsx apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/conversation-transcript.tsx apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.highlight.test.tsx
git commit -m "feat(studio): 问答记录与评估报告接入关键词高亮"
```

---

## Task 5: 报告 Tab 内挂 Provider 与图例

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/studio-person-detail-panel.tsx`

**Interfaces:**

- Consumes: `KeywordHighlightProvider`、`KeywordHighlightLegend`（Task 2）。
- Produces: 无新导出。`ConversationTranscript` 与 `EvaluationResults` 同在 `<TabsContent value="reports">` 子树内，Provider 包裹该内容区即满足「同步」约束。

- [ ] **Step 1: 顶部导入**

在 `studio-person-detail-panel.tsx` 现有的 `import { ConversationTranscript } ...` / `import { EvaluationResults } ...` 附近加入：

```tsx
import { KeywordHighlightProvider } from "./interviews/interview-detail/keyword-highlight/context";
import { KeywordHighlightLegend } from "./interviews/interview-detail/keyword-highlight/legend";
```

- [ ] **Step 2: 用 Provider 包住报告内容区（开标签）**

在 `<TabsContent value="reports">` 内，把：

```tsx
              ) : (
                <div className="space-y-8">
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-4">
```

改为（在 `<div className="space-y-8">` 外加 Provider 开标签）：

```tsx
              ) : (
                <KeywordHighlightProvider>
                <div className="space-y-8">
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-4">
```

（缩进先不管，Step 5 的 `pnpm fix` 会统一格式化。）

- [ ] **Step 3: 在汇总卡下方插入图例**

把（`reports.length === 0` 判断处）：

```tsx
                  {reports.length === 0 ? (
                    <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40 px-6 py-10 text-center">
```

改为在其前插入图例：

```tsx
                  {reports.length > 0 ? <KeywordHighlightLegend /> : null}

                  {reports.length === 0 ? (
                    <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40 px-6 py-10 text-center">
```

- [ ] **Step 4: 关闭 Provider（闭标签）**

`<div className="space-y-8">` 的匹配闭合处（`</Accordion>` 之后、`</div>` 收尾，随后 `)}` 收 `isReportsLoading` 三元、再 `</TabsContent>`）。把：

```tsx
                  )}
                </div>
              )}
            </TabsContent>
```

改为（在 `</div>` 与 `)}` 之间补 Provider 闭标签）：

```tsx
                  )}
                </div>
                </KeywordHighlightProvider>
              )}
            </TabsContent>
```

> 定位提示：这是 `value="reports"` 的 `TabsContent` 结尾。若同签名文本在别处重复，用「`</Accordion>` 后紧跟的 `</div> )} </TabsContent>`」作为锚点，确保改的是 reports Tab。

- [ ] **Step 5: 格式化 + 类型检查 + 全量测试**

Run:

```bash
pnpm fix
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot exec vitest run src/components/features/studio/interviews/interview-detail
pnpm --filter @arc/shared test
```

Expected: `pnpm fix` 无报错并把 Step 2 的缩进补齐；typecheck 通过；两处 vitest 全绿。

- [ ] **Step 6: 提交**

```bash
git add apps/ai-recruitment-copilot/src/components/features/studio/studio-person-detail-panel.tsx
git commit -m "feat(studio): 报告 Tab 挂载关键词高亮 Provider 与图例"
```

---

## 手动验证（可选，全部任务后）

启动 web（`pnpm --filter @arc/ai-recruitment-copilot dev`），进候选人详情 →「面试报告」Tab：

- 顶部出现「关键词高亮」图例三枚 chip；
- 问答记录里候选人气泡的技能/数字/风险词着色，面试官气泡不着色；
- 评估报告的评价文本、证据 quote 同样着色；
- 点某枚 chip 关闭该类，问答记录与报告同步隐藏该类高亮。

---

## Self-Review

**Spec coverage：**

- 三类关键词提取 → Task 1（skill/metric/risk 匹配 + 词典）。✅
- metric「仅带单位数字、裸数字不标」→ Task 1 `METRIC_REGEX` + 测试。✅
- 风险词内置固定词表 → Task 1 `BUILT_IN_RISK_WORDS`。✅
- `start/end` UTF-16 语义 → Task 1 `KeywordSpan` 注释 + `slice`。✅
- 重叠消解 `risk>skill>metric` → Task 1 `resolveOverlaps` + 优先级测试。✅
- 渲染 `<mark>`、保留 pre-wrap → Task 3。✅
- 图例 + 分类开关、默认全开、不可变更新 → Task 2。✅
- 同步（共享状态、两处一致）→ Task 5 Provider 包裹 reports 子树；一致性由 Task 1 同输入同输出保证。✅
- 高亮范围＝候选人原话 + AI 评价文本，不含面试官气泡 → Task 4（user 气泡、assessment、overallAssessment、evidence quote；assistant 气泡不改）。✅
- `extraSkills` 去重/合并接口预留、本期不传 → Task 1 `buildSkillList` + Task 3 prop（面板不传）。✅
- 无 LLM / 无 DB / 无后端改动 → 仅改前端与 shared。✅
- TDD、频繁提交 → 每任务先写测试、独立提交。✅

**Placeholder scan：** 无 TBD/TODO；每个改动步骤均给出完整代码与精确锚点。✅

**Type consistency：** `KeywordCategory` / `KeywordSpan` / `extractAnswerKeywords` / `ExtractOptions`（Task 1）→ `ALL_KEYWORD_CATEGORIES` / `KeywordHighlightProvider` / `useKeywordHighlight`（Task 2）→ `HighlightedText`（Task 3）→ 接入（Task 4/5）签名前后一致；`enabledCategories: Set<KeywordCategory>` 贯穿一致。✅

**已知局限（源自 spec，非缺口）：** 风险词无否定语境判定、metric 不处理负数与 K/M、`2024年` 含单位年份可能被当 metric、无障碍非颜色标识留后续 —— 均已在 spec 记录，本期接受。
