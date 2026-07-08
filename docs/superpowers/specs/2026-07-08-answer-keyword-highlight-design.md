# 候选人回答关键词自动高亮 — 设计文档

日期：2026-07-08
状态：已批准，待实现

## 背景与目标

在「面试报告」和「问答记录」中，自动识别并高亮候选人回答里的关键词，帮助 HR / 面试官快速定位重点信息。

关键词分三类（项目名先不做，见「明确不做」）：

- **技能（skill）** — 技能 / 技术 / 能力名词
- **数字/绩效（metric）** — 带含义的数字（百分比、量级、带单位计数、金额）
- **风险词（risk）** — 表意含糊或负面的信号词（如「离职」「没做过」「不太清楚」「应该是」）

「同步高亮」= 问答记录与报告两处共用同一套规则、同一份词表、同一种类别与配色，命中结果一致。

## 方案选型

采用**规则/词典（纯前端）**方案：技能靠内置词典、数字靠正则、风险词靠内置词表。

理由：四类目标里三类（数字、风险词、技能）用规则即可做到又快又准，且完全同步、不碰数据库、无 LLM 成本与延迟，正好满足「快速定位」诉求。唯一弱项是项目名——它既无已知列表可匹配，LLM 又容易对不回原文位置，故先不做，并把「关键词来源」设计成可插拔，未来可加 LLM provider 升级为混合方案而不改高亮渲染层。

已否决方案：

- **LLM 语义提取**：能抓项目名，但需 LLM 调用 + 存储 + 片段回原文位置对齐，复杂度高，收益集中在暂不做的项目名类别。
- **混合**：把规则与 LLM 复杂度叠加，当前阶段不必要。

## 架构总览

```
@arc/shared/answer-keywords.ts        ← 纯函数提取层（同步来源，可测）
        │  extractAnswerKeywords(text, options) → KeywordSpan[]
        ▼
web: interview-detail/keyword-highlight/
        highlighted-text.tsx           ← 渲染层：spans → <mark>
        context.tsx                     ← 共享 enabledCategories 状态
        legend.tsx                      ← 图例 + 分类开关
        │
        ├─ conversation-transcript.tsx  ← 候选人气泡接入
        └─ evaluation-results.tsx       ← 评价/证据接入
        （由 studio-person-detail-panel.tsx 用 Provider 包裹并渲染 Legend）
```

全程无 LLM、不改数据库、不动后端。

## 组件设计

### 1. 提取器 `@arc/shared`

文件：`packages/shared/src/answer-keywords.ts`（词典可拆到同目录 `answer-keywords-dictionary.ts`）。

类型：

```ts
export type KeywordCategory = "skill" | "metric" | "risk";
export interface KeywordSpan {
  start: number; // 字符起点（含）
  end: number; // 字符终点（不含）
  text: string;
  category: KeywordCategory;
}
export interface ExtractOptions {
  extraSkills?: string[]; // 可选：外部结构化技能来源，与内置词典合并
}
export function extractAnswerKeywords(text: string, options?: ExtractOptions): KeywordSpan[];
```

匹配规则：

- **skill**：匹配「内置技能词典 ∪ `extraSkills`」。拉丁词按词边界匹配（避免 `java` 命中 `javascript` 内部）、中文按子串匹配；同一位置多个候选取**最长优先**。
- **metric**：顶层常量正则匹配「带含义的数字」——百分比（`30%`）、量级（`500万`/`3亿`/`5千`）、带单位计数（`10人`/`5个`/`3年`/`2倍`/`3次`/`2名`）、金额（`万元`/`元`/`￥`）。**裸序号**（如「第3题」「问题2」）不标。
- **risk**：内置风险词表子串匹配。

重叠消解：所有候选 span 汇总后，按优先级 `risk > skill > metric` 消解——重叠时保留高优先级，丢弃被其包含或与其交叠的低优先级 span；同优先级取更长者。结果按 `start` 升序返回、互不重叠。

性能：词表为模块级常量，正则顶层定义（不在循环内 `new RegExp`）；技能匹配器对内置词典构建一次。

内置词表由本次实现给出一份初始集合（技能覆盖常见技术/管理能力词；风险词覆盖含糊与负面信号），可后续增补，不属架构决策。

### 2. 渲染组件 `HighlightedText`（web）

文件：`interview-detail/keyword-highlight/highlighted-text.tsx`

- props：`text: string`、`enabledCategories: Set<KeywordCategory>`、`extraSkills?: string[]`
- 用 `useMemo` 按 `text`（+ `extraSkills`）调 `extractAnswerKeywords` 得全部 spans；渲染时按 `enabledCategories` 过滤——**切换分类只重过滤，不重算提取**。
- 将 text 按 spans 切成「纯文本段 / 命中段」序列，命中段渲染 `<mark data-category={c} className={…}>`，其余为纯文本；外层保留 `whitespace-pre-wrap`。
- 类别配色（主题感知，走 Tailwind + CSS 变量）：技能=蓝、数字=绿、风险=琥珀/红。`<mark>` 背景透明度低、保证浅/深色下文字可读。

### 3. 共享状态与图例

- `keyword-highlight/context.tsx`：`KeywordHighlightProvider` 持有 `enabledCategories: Set<KeywordCategory>`（默认三类全开）与 `toggleCategory`；`useKeywordHighlight()` 读取。
- `keyword-highlight/legend.tsx`：`KeywordHighlightLegend` 渲染三个带颜色的可点 chip，点击切换对应类别的显隐。

图例放在报告 Tab 区域顶部，问答记录与报告共用同一份状态与图例，实现「同步」。

### 4. 接入点（外科式改动）

- `conversation-transcript.tsx`：候选人（`user`）气泡的 `{turn.message}` 改用 `<HighlightedText>`；面试官（`assistant`）气泡**不变**（仍为 Markdown，不高亮——功能只针对候选人回答）。
- `evaluation-results.tsx`：`overallAssessment`、逐题 `assessment`、证据 `quote` 文本包 `<HighlightedText>`。（证据为候选人原话；评价为 AI 文本——按需求两者都高亮。）这三处当前均为纯文本渲染，无需 Markdown 解析。
- `studio-person-detail-panel.tsx`：用 `KeywordHighlightProvider` 包住报告区域，并在其上渲染 `<KeywordHighlightLegend>`。`extraSkills` 当前传空/不传（基线用内置词典）；未来接结构化技能时从此处注入。

## 数据流

候选人文本 / 证据 quote / AI 评价文本
→ `extractAnswerKeywords(text, { extraSkills })`（memo，返回全部 spans）
→ 渲染层按 `enabledCategories` 过滤
→ 切段渲染 `<mark>` / 纯文本。

## 边界与错误处理

- 空 / 无命中文本：原样返回纯文本，零额外开销。
- 重叠命中：按上述优先级确定性消解，输出稳定。
- 长文本：单次线性扫描，开销可接受。
- 分类全关：渲染为纯文本。

## 测试（TDD 先行）

- Vitest 单测 `extractAnswerKeywords`：
  - 各类别命中（skill / metric / risk）
  - 重叠消解优先级与最长优先
  - 边界：拉丁词边界、中文子串、裸序号不误标、空串
  - `extraSkills` 合并生效
- 组件轻测 `HighlightedText`：已知关键词产生 `<mark>`；`enabledCategories` 过滤生效（关某类则该类不出 `<mark>`）。

## 明确不做（YAGNI）

- 项目名类别（`KeywordCategory` 预留扩展位，本期不实现）
- 组织级自定义风险词（本期内置固定词表）
- 任何持久化 / 数据库 / 后端改动
- LLM 调用
- 高亮面试官（assistant）发言

## 开放点（已定）

技能来源：本期用**内置技能词典**作为可靠基线；`extraSkills` 接口预留，未来可接 JD 结构化技能（该视图当前未现成加载结构化技能，故不在本期接入）。
