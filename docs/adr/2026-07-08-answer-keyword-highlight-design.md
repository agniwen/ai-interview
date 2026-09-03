# 候选人回答关键词自动高亮 — 设计文档

日期：2026-07-08
状态：已批准，待实现

## 背景与目标

在「面试报告」和「问答记录」中，自动识别并高亮与候选人回答相关的关键词，帮助 HR / 面试官快速定位重点信息。

关键词分三类（项目名先不做，见「明确不做」）：

- **技能（skill）** — 技能 / 技术 / 能力名词
- **数字/绩效（metric）** — 带含义的数字（百分比、量级、带单位计数、金额）
- **风险词（risk）** — 表意含糊或负面的信号词（如「离职」「没做过」「不太清楚」「应该是」）

**高亮的文本范围**（本期明确覆盖两类文本，均套用同一套规则与词表）：

1. **候选人原话** — 问答记录里候选人（`user`）气泡、报告里的证据 `quote`。
2. **AI 评价文本** — 报告里的 `overallAssessment` 与逐题 `assessment`。这是 AI 对候选人的评述、非候选人原话，高亮它是为方便 HR 扫读评价结论；不高亮面试官（`assistant`）的提问气泡。

「同步高亮」= 上述所有文本共用同一套规则、同一份词表、同一种类别与配色；同一串文字在问答记录与报告中命中结果一致。

**验收口径**：给定同一段候选人原话，分别出现在问答记录气泡与报告证据 `quote` 中时，两处产生的高亮片段（起止、类别）必须完全一致——由针对 `extractAnswerKeywords` 的单测保证（同输入同输出），渲染层不引入差异。

## 方案选型

采用**规则/词典（纯前端）**方案：技能靠内置词典、数字靠正则、风险词靠内置词表。

理由：四类目标里三类（数字、风险词、技能）用规则即可做到又快又准，且完全同步、不碰数据库、无 LLM 成本与延迟，正好满足「快速定位」诉求。唯一弱项是项目名——它既无已知列表可匹配，LLM 又容易对不回原文位置，故先不做，并把「关键词来源」设计成可插拔，未来可加 LLM provider 升级为混合方案而不改高亮渲染层。

已否决方案：

- **LLM 语义提取**：能抓项目名，但需 LLM 调用 + 存储 + 片段回原文位置对齐，复杂度高，收益集中在暂不做的项目名类别。
- **混合**：把规则与 LLM 复杂度叠加，当前阶段不必要。

## 架构总览

```
@app/shared/answer-keywords.ts        ← 纯函数提取层（同步来源，可测）
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

### 1. 提取器 `@app/shared`

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
  extraSkills?: string[]; // 可选：外部结构化技能来源，与内置词典合并（提取器内部去重、trim、大小写按 skill 规则统一处理）
}
export function extractAnswerKeywords(text: string, options?: ExtractOptions): KeywordSpan[];
```

匹配规则：

- **skill**：匹配「内置技能词典 ∪ `extraSkills`」。拉丁词按词边界匹配（避免 `java` 命中 `javascript` 内部），词边界定义为「命中片段两侧不是 `[A-Za-z0-9]`」——含符号的技能（`C++`、`C#`、`Node.js`、`React Native`）在词典里按完整字面量登记、整体匹配，不做子词拆分；中文按子串匹配；同一位置多个候选取**最长优先**。
- **metric**（数字/绩效）：顶层常量正则,五类分支：
  - **阿拉伯数字紧跟单位/百分号**（数字与单位间**不允许空格**，可带负号 `-30%`）：百分比 `30%`/`30％`；量级前缀 `500万`/`3亿`/`5千`（可再接单位如 `500万元`）；带单位计数 `10人`/`5个`/`3年`/`2倍`/`3次`/`2名`；金额 `500元`/`500万元`；小数 `3.5年`。
  - **货币符号前缀**：`￥500`/`¥500`。
  - **K/M 量级**：`30K`/`1.2M`（后接字母不算，避免 `3km` 误判）。
  - **中文数字/量级 + 万/亿**：`千万`、`二十多万`、`上百万`、`几亿`、`数百万`——覆盖中文口语量级（`GMV 千万`、`二十多万会员`）。前导取自 `零一二三四五六七八九十百千两几上数多`，须以 `万`/`亿` 收尾。
  - **字母等级评价**：`S级`/`A级`/`B+级`（`[S-Fa-f][+-]?级`），绩效评级归 metric。
  - **负号**用 `(?<!\d)` 排除，避免把 `3-5年` 的连字符当负号（该例仍命中 `5年`）。**仍不处理**：全角负号、`w`（如 `30w`）等口语后缀。
  - **裸数字一律不标**：年份（`2024`）、题号/轮次（`第3题`、`第二轮`）、年龄、版本号、纯数字，均因缺紧邻单位而不命中；中文数字后接非 `万`/`亿` 单位（如 `一个`、`那一年度`）也不命中。
  - **已知噪声（接受）**：`2024年`（含单位年份）、`第3名/第3位/第3条`（序数排名）、`千万`（也可作副词「千万别」）均会被当 metric 命中——规则不做左侧上下文判定，属可接受噪声，不单独排除；如需排除留待后续加上下文守卫。
- **risk**：内置风险词表子串匹配，带**轻量否定守卫**：命中前 3 字窗口内出现 `不`/`没` 则判为语义反转并丢弃（如「从没想过离职」不标「离职」）。启发式,只取最可靠的 `不`/`没`；对复合词（`不过`/`差不多`/`未来`）可能偶发误伤,属已知局限,更细的否定/语境判定留待后续。

重叠消解：所有候选 span 汇总后，按优先级 `risk > skill > metric` 消解——重叠时保留高优先级，丢弃被其包含或与其交叠的低优先级 span；同优先级取更长者。结果按 `start` 升序返回、互不重叠。

**字符位置语义**：`start`/`end` 为 JS 字符串下标（UTF-16 code unit），与 `String.prototype.slice(start, end)` 一致；不做 grapheme 归一，含 emoji/组合字符时以 code unit 为准（切片仍稳定，不影响纯文本切段渲染）。

性能：词表为模块级常量，正则顶层定义（不在循环内 `new RegExp`）。每次调用会把「内置词典 ∪ extraSkills」合并去重一次（词表常量级，开销可忽略）；skill/risk 为按词表逐项扫描（复杂度 ~O(文本长度 × 词表规模)），实际开销可接受——不宣称严格单遍线性。

内置词表由本次实现给出一份初始集合（技能覆盖常见技术/管理能力词；风险词覆盖含糊与负面信号），可后续增补，不属架构决策。

### 2. 渲染组件 `HighlightedText`（web）

文件：`interview-detail/keyword-highlight/highlighted-text.tsx`

- props：`text: string`、`enabledCategories: Set<KeywordCategory>`、`extraSkills?: string[]`
- 用 `useMemo` 按 `text`（+ `extraSkills`）调 `extractAnswerKeywords` 得全部 spans；渲染时按 `enabledCategories` 过滤——**切换分类只重过滤，不重算提取**。
- 将 text 按 spans 切成「纯文本段 / 命中段」序列，命中段渲染 `<mark data-category={c} className={…}>`，其余为纯文本；外层保留 `whitespace-pre-wrap`。
- 类别配色（主题感知，走 Tailwind + CSS 变量）：技能=蓝、数字=绿、风险=琥珀/红。`<mark>` 背景透明度低、保证浅/深色下文字可读。

### 3. 共享状态与图例

- `keyword-highlight/context.tsx`：`KeywordHighlightProvider` 持有 `enabledCategories: Set<KeywordCategory>`（默认三类全开）与 `toggleCategory`；`useKeywordHighlight()` 读取。`toggleCategory` 以**不可变方式**更新（`new Set(prev)` 后增删再 `setState`），保证 React 正确重渲染。
- `keyword-highlight/legend.tsx`：`KeywordHighlightLegend` 渲染三个带颜色的可点 chip，点击切换对应类别的显隐。

**Provider 作用域（同步的关键约束）**：经代码确认，`studio-person-detail-panel.tsx` 里**问答记录（`ConversationTranscript`）与评估报告（`EvaluationResults`）同处一个 `<TabsContent value="reports">` 子树内**——它们是同一「面试报告」Tab 下并排渲染的两块，不是两个独立 Tab。因此 `KeywordHighlightProvider` 只需包裹该 reports 内容区，两块即在同一 Provider 子树、读到同一份 `enabledCategories`，两者始终一起渲染，「同步」天然成立。`<KeywordHighlightLegend>` 渲染在该内容区顶部（汇总卡下方），报告有数据时显示。

### 4. 接入点（外科式改动）

- `conversation-transcript.tsx`：候选人（`user`）气泡的 `{turn.message}` 改用 `<HighlightedText>`；面试官（`assistant`）气泡**不变**（仍为 Markdown、不高亮——不高亮提问方发言）。
- `evaluation-results.tsx`：`overallAssessment`、逐题 `assessment`、证据 `quote` 文本包 `<HighlightedText>`（见「背景」高亮文本范围）。这三处当前均为纯文本渲染，无需 Markdown 解析。
- `studio-person-detail-panel.tsx`：用 `KeywordHighlightProvider` 包住 `<TabsContent value="reports">` 的内容区（见「Provider 作用域」），并在其顶部渲染 `<KeywordHighlightLegend>`。`extraSkills` 当前传空/不传（基线用内置词典）；未来接结构化技能时从此处注入。

## 数据流

候选人文本 / 证据 quote / AI 评价文本
→ `extractAnswerKeywords(text, { extraSkills })`（memo，返回全部 spans）
→ 渲染层按 `enabledCategories` 过滤
→ 切段渲染 `<mark>` / 纯文本。

## 边界与错误处理

- 空 / 无命中文本：原样返回纯文本，零额外开销。
- 重叠命中：按上述优先级确定性消解，输出稳定。
- 长文本：按词表规模逐项扫描，词表常量级，开销可接受。
- 分类全关：渲染为纯文本。

**已知局限（本期接受，写明以免误判为遗漏）**：

- 风险词否定判定为轻量启发式（命中前 3 字内 `不`/`没` 即丢弃）：覆盖「从没想过离职」类常见否定，但对 `不过`/`差不多`/`未来` 等复合词可能偶发误伤；更完整的语境判定留待后续。
- metric 已支持负号与 K/M（`-30%`、`30K`）；仍不处理全角负号与 `w` 等口语后缀。
- AI 评价文本为模型转述、非候选人原话，其高亮仅供扫读；视觉上 `<mark>` 与候选人原话同色，不做来源区分（如需区分留待后续）。
- 无障碍：本期高亮以颜色为主，未额外提供非颜色标识（色弱/读屏优化留待后续）。

## 测试（TDD 先行）

- Vitest 单测 `extractAnswerKeywords`：
  - 各类别命中（skill / metric / risk）
  - 重叠消解优先级与最长优先
  - skill 边界：拉丁词边界（`java` 不命中 `javascript` 内部）、含符号技能整体命中（`C++`、`Node.js`）、中文子串
  - metric 边界：`30%`/`500万`/`10人`/`3.5年` 命中；裸数字 `2024`/`第3题`/年龄 不命中
  - 同一段候选人原话在两处输入下产出完全一致的 spans（对应「验收口径」）
  - 空串、`extraSkills` 合并与去重生效
- 组件轻测 `HighlightedText`：已知关键词产生 `<mark>`；`enabledCategories` 过滤生效（关某类则该类不出 `<mark>`）。

## 明确不做（YAGNI）

- 项目名类别（本期不实现；`KeywordCategory` 为字符串字面量 union，未来加类别即在 union 追加一项，扩展成本低）
- 组织级自定义风险词（本期内置固定词表）
- 任何持久化 / 数据库 / 后端改动
- LLM 调用
- 高亮面试官（assistant）发言

## 开放点（已定）

技能来源：本期用**内置技能词典**作为可靠基线；`extraSkills` 接口预留，未来可接 JD 结构化技能（该视图当前未现成加载结构化技能，故不在本期接入）。
