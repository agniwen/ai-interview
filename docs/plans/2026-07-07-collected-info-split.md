# 候选人收集信息分区展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 AI 面试详情 `overview` tab 的「候选人收集信息」从一条合并列表拆成「表单答复」「面试题」两个左右并排分区。

**Architecture:** 纯前端改造,全部集中在 `studio-person-detail-panel.tsx` 一个组件文件 + 其源码结构守卫测试。数据层 builder 从返回扁平数组改为返回 `{ formItems, interviewItems }`(每组独立从 1 编号);展示层列表组件去掉来源 badge、新增 `emptyLabel` 空态 prop;section 用 `md:grid-cols-2` 两栏渲染。无 schema、无后端、无跨文件消费。

**Tech Stack:** TanStack Start + React 19、shadcn/ui(`Badge`)、Tailwind v4、Vitest(源码结构守卫测试)。

## Global Constraints

- 改动仅限 `apps/web/src/components/features/studio/studio-person-detail-panel.tsx` 与同目录 `studio-person-detail-panel.test.ts`,不碰其他文件。
- `<h3 className="font-medium text-sm">候选人收集信息</h3>` 的 className **保持逐字不变**(守卫测试 `:66` 依赖精确字符串)。
- section 外层 `xl:col-span-2` 保留(守卫测试 `:68` 依赖)。
- 栏内顺序沿用现状:表单栏按 `formSubmissions` → 每份 `snapshot.questions`;面试栏按 `evaluation.questions` 数组顺序。不引入新排序。
- 栏标题计数口径 = 条目数(题数):`formItems.length` 是所有问卷题目总数,`interviewItems.length` 是面试题数。
- 提交信息用 conventional commits;格式化**只针对本次改动的两个文件**(见 Step 9,用 `pnpm exec ultracite fix <两文件>`),不跑全仓 `pnpm fix`,避免误伤范围外文件。

---

### Task 1: 拆分「候选人收集信息」为表单/面试题两栏

**Files:**

- Modify: `apps/web/src/components/features/studio/studio-person-detail-panel.tsx`
  - 接口 `CollectedCandidateInfoItem`(约 `:254-263`)
  - builder `getCollectedCandidateInfoItems`(约 `:306-369`)
  - 展示组件 `CollectedCandidateInfoList`(约 `:371-447`)
  - 调用处(约 `:1602-1605`)
  - section JSX(约 `:2037-2054`)
- Test: `apps/web/src/components/features/studio/studio-person-detail-panel.test.ts`(断言 `:72`、`:91`、`:97`)

**Interfaces:**

- Produces:
  - `getCollectedCandidateInfoItems(args): { formItems: CollectedCandidateInfoItem[]; interviewItems: CollectedCandidateInfoItem[] }`
  - `CollectedCandidateInfoItem`(移除 `sourceLabel` 字段后):`{ analysis: string | null; answers: string[]; id: string; kind: "form" | "interview"; meta: string | null; question: string; sequence: number }`
  - `CollectedCandidateInfoList({ items, emptyLabel }: { items: CollectedCandidateInfoItem[]; emptyLabel: string }): JSX.Element`
- Consumes: `formatFormAnswer`、`isRecord`、`CandidateFormSubmissionWithSnapshot`、`Badge`、`FormsSkeleton`(均已存在于同文件/已导入)。

> 说明:本任务是**原子改动**。builder 返回类型一改,调用处解构与守卫测试断言必须同步更新才能让 TypeScript 编译与测试通过,中间不存在可独立提交的绿色状态,故合为一个任务、分步执行。

- [ ] **Step 1: 更新守卫测试断言(先写"失败的测试")**

在 `studio-person-detail-panel.test.ts` 改三处断言,编码新结构。

`:72` 原:

```ts
expect(collectedSource).toContain("items={collectedCandidateInfoItems}");
```

改为:

```ts
expect(collectedSource).toContain("items={formItems}");
expect(collectedSource).toContain("items={interviewItems}");
```

`:91` 原:

```ts
expect(collectedItemsSource).toContain("sequence: items.length + 1");
```

改为:

```ts
expect(collectedItemsSource).toContain("sequence: formItems.length + 1");
expect(collectedItemsSource).toContain("sequence: interviewItems.length + 1");
```

`:97` 原:

```ts
expect(answerListSource).toContain("sourceLabel");
```

改为(来源 badge 已移除,改为锁定新的 `emptyLabel` 空态 prop):

```ts
expect(answerListSource).toContain("emptyLabel");
```

此外,新增负向断言锁定几处「删除」行为(防止回归时被悄悄改回)。在 `"shows AI analysis and clamps..."` 测试块内(有 `answerListSource`、`collectedItemsSource` 两个切片)追加:

```ts
expect(collectedItemsSource).not.toContain("sourceLabel");
expect(answerListSource).not.toContain("sourceLabel");
```

在 `"shows collected candidate information..."` 测试块内(有 `overviewSource`、`collectedSource` 两个切片)追加负向断言:

```ts
expect(overviewSource).not.toContain("按表单、面试题顺序展示");
// 旧扁平变量整体消失,精确证明顶部总数 badge 及其数据源已删(比查 "条信息" 更不易误报)
expect(source).not.toContain("collectedCandidateInfoItems");
```

并在同一测试块追加正向断言,锁定两栏布局、标题、计数与**实际空态文案**(仅查 `emptyLabel` 标识符不足以防文案写错):

```ts
expect(collectedSource).toContain("md:grid-cols-2");
expect(collectedSource).toContain("表单答复");
expect(collectedSource).toContain("面试题");
expect(collectedSource).toContain("{formItems.length}");
expect(collectedSource).toContain("{interviewItems.length}");
expect(collectedSource).toContain('emptyLabel="暂无表单答复"');
expect(collectedSource).toContain('emptyLabel="暂无面试题"');
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `pnpm --filter @app/web test studio-person-detail-panel`
Expected: FAIL — 新断言在旧源码里找不到(如 `items={formItems}`、`sequence: formItems.length + 1`、`emptyLabel` 均不存在),原 `.tsx` 仍是旧的合并列表结构。

- [ ] **Step 3: 移除接口的 `sourceLabel` 字段**

在 `CollectedCandidateInfoItem` 接口(约 `:254-263`)删掉 `sourceLabel: string;` 一行。改后:

```ts
interface CollectedCandidateInfoItem {
  analysis: string | null;
  answers: string[];
  id: string;
  kind: "form" | "interview";
  meta: string | null;
  question: string;
  sequence: number;
}
```

- [ ] **Step 4: 重写 builder 返回两组、各自从 1 编号**

将 `getCollectedCandidateInfoItems`(约 `:306-369`)整体替换为:

```ts
function getCollectedCandidateInfoItems({
  evaluation,
  formSubmissions,
}: {
  evaluation: Record<string, unknown> | null | undefined;
  formSubmissions: CandidateFormSubmissionWithSnapshot[];
}) {
  const formItems: CollectedCandidateInfoItem[] = [];

  for (const submission of formSubmissions) {
    for (const question of submission.snapshot.questions) {
      const answer = formatFormAnswer(question, submission.answers[question.id]);
      formItems.push({
        analysis: null,
        answers: answer ? [answer] : [],
        id: `form-${submission.id}-${question.id}`,
        kind: "form",
        meta: submission.snapshot.title,
        question: question.label,
        sequence: formItems.length + 1,
      });
    }
  }

  const interviewItems: CollectedCandidateInfoItem[] = [];
  const questions = Array.isArray(evaluation?.questions) ? evaluation.questions : [];

  for (const [index, rawQuestion] of questions.entries()) {
    if (!isRecord(rawQuestion)) {
      continue;
    }

    const question =
      typeof rawQuestion.question === "string" && rawQuestion.question.trim()
        ? rawQuestion.question.trim()
        : "未知题目";
    const analysis =
      typeof rawQuestion.assessment === "string" && rawQuestion.assessment.trim()
        ? rawQuestion.assessment.trim()
        : null;
    const order = typeof rawQuestion.order === "number" ? rawQuestion.order : index + 1;
    const rawEvidence = Array.isArray(rawQuestion.evidence) ? rawQuestion.evidence : [];
    const answers = rawEvidence.flatMap((item) => {
      if (!isRecord(item) || typeof item.quote !== "string") {
        return [];
      }
      const quote = item.quote.trim();
      return quote ? [quote] : [];
    });

    interviewItems.push({
      analysis,
      answers,
      id: `interview-${order}-${question}`,
      kind: "interview",
      meta: null,
      question,
      sequence: interviewItems.length + 1,
    });
  }

  return { formItems, interviewItems };
}
```

改动要点:两个独立数组;`sequence` 用各自数组长度 → 每栏从 1;两处 push 均**删除 `sourceLabel`**;`order` 仍用于 `id`;循环体解析逻辑与原样一致。

- [ ] **Step 5: 展示组件加 `emptyLabel`、去掉来源 badge**

将 `CollectedCandidateInfoList` 的签名与空态分支、以及 badge 块修改。

签名(约 `:371`)改为:

```tsx
function CollectedCandidateInfoList({
  items,
  emptyLabel,
}: {
  items: CollectedCandidateInfoItem[];
  emptyLabel: string;
}) {
```

空态分支(约 `:372-378`)里写死的占位文案改用 `emptyLabel`:

```tsx
if (items.length === 0) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
      {emptyLabel}
    </div>
  );
}
```

来源 badge 块(约 `:392-399`)原:

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Badge className="h-5 px-1.5 font-normal text-[10px]" variant="outline">
    {item.sourceLabel}
  </Badge>
  {item.meta ? <span className="text-muted-foreground text-xs leading-5">{item.meta}</span> : null}
</div>
```

改为:**只删除 `<Badge>…{item.sourceLabel}…</Badge>` 这一个元素**,保留外层 `<div>` 与其中的 `{item.meta ? … : null}` 表达式原样不动。删除后该块为(整段是单个 `<div>` JSX 元素,可直接替换):

```tsx
<div className="flex flex-wrap items-center gap-2">
  {item.meta ? <span className="text-muted-foreground text-xs leading-5">{item.meta}</span> : null}
</div>
```

> 注意:表单条目 `meta` = 问卷标题会渲染;面试条目 `meta` 为 `null` 时该 `<div>` 为空容器,无可见输出,符合预期。此处**不要**把 `{item.meta ? … : null}` 单独抽成顶层代码块粘贴——JSX 子表达式必须保留在父元素内,单独成块会被格式化器加分号变成非法语句。

- [ ] **Step 6: 更新调用处解构**

调用处(约 `:1602-1605`)原:

```ts
const collectedCandidateInfoItems = getCollectedCandidateInfoItems({
  evaluation: latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
  formSubmissions,
});
```

改为:

```ts
const { formItems, interviewItems } = getCollectedCandidateInfoItems({
  evaluation: latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
  formSubmissions,
});
```

- [ ] **Step 7: 替换 section JSX 为两栏 grid(去副标题 + 去总数 badge)**

section(约 `:2037-2054`)原:

```tsx
<section className="xl:col-span-2 border-border/50 border-t pt-6">
  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div>
      <h3 className="font-medium text-sm">候选人收集信息</h3>
      <p className="mt-1 text-muted-foreground text-xs">按表单、面试题顺序展示候选人提供的信息。</p>
    </div>
    {collectedCandidateInfoItems.length > 0 ? (
      <Badge variant="outline">{collectedCandidateInfoItems.length} 条信息</Badge>
    ) : null}
  </div>
  {isFormSubmissionsLoading || isReportsLoading ? (
    <FormsSkeleton />
  ) : (
    <CollectedCandidateInfoList items={collectedCandidateInfoItems} />
  )}
</section>
```

改为:

```tsx
<section className="xl:col-span-2 border-border/50 border-t pt-6">
  <div className="mb-4">
    <h3 className="font-medium text-sm">候选人收集信息</h3>
  </div>
  {isFormSubmissionsLoading || isReportsLoading ? (
    <FormsSkeleton />
  ) : (
    <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h4 className="font-medium text-sm">表单答复</h4>
          <Badge variant="outline">{formItems.length}</Badge>
        </div>
        <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
      </div>
      <div>
        <div className="mb-3 flex items-center gap-2">
          <h4 className="font-medium text-sm">面试题</h4>
          <Badge variant="outline">{interviewItems.length}</Badge>
        </div>
        <CollectedCandidateInfoList emptyLabel="暂无面试题" items={interviewItems} />
      </div>
    </div>
  )}
</section>
```

改动要点:`<h3>候选人收集信息</h3>` className 逐字不变(仅外层 wrapper 从 flex 简化为 `mb-4`);删除副标题 `<p>` 与顶部总数 badge 及其 `length > 0` 条件;`md:grid-cols-2` 桌面并排、`<md` 堆叠;两栏各带标题 + 计数 badge + 各自 `emptyLabel`。

- [ ] **Step 8: 定向运行守卫测试,确认转绿**

Run: `pnpm --filter @app/web test studio-person-detail-panel`
Expected: PASS — Step 1 的新断言全部命中(`items={formItems}`、`items={interviewItems}`、两个 `sequence:` 表达式、`emptyLabel`,以及四条负向断言),且保留的断言(`xl:col-span-2`、`<CollectedCandidateInfoList`、`{item.sequence}.`、`问题`/`AI 分析` 顺序、tooltip/clamp、`function getCollectedCandidateInfoItems` 等)仍绿。此定向跑仅为快速反馈。

- [ ] **Step 9: 格式化(仅限本次改动的两个文件)**

只格式化改动文件,避免 `pnpm fix` 全仓扫描顺带改动无关文件、超出 spec 范围:

用仓库已安装的锁定版本(`pnpm exec`,非 `dlx` 临时下载,避免与 CI/团队版本漂移):

Run: `pnpm exec ultracite fix apps/web/src/components/features/studio/studio-person-detail-panel.tsx apps/web/src/components/features/studio/studio-person-detail-panel.test.ts`
Expected: 两个文件通过格式化(无报错;如有自动改动,后续步骤会重跑验证闭环)。

- [ ] **Step 10: 运行完整包测试(对齐 spec 验证标准)**

格式化后重跑完整测试套件,确保未被格式化破坏、且不遗漏同包内受影响的用例:

Run: `pnpm --filter @app/web test`
Expected: PASS — 全部用例通过(spec 验证标准 1)。

- [ ] **Step 11: 类型检查**

Run: `pnpm --filter @app/web typecheck`
Expected: PASS — builder 新返回类型与调用处解构一致;`CollectedCandidateInfoList` 的 `emptyLabel` 必填 prop 在两处调用均已提供;移除 `sourceLabel` 后无残留引用(spec 验证标准 2)。

- [ ] **Step 12: 手工验证(spec 验证标准 3)**

启动 dev 服务器(`pnpm --filter @app/web dev`),按终端打印的本地 URL 打开(TanStack Start dev 默认 `http://localhost:3000`),进入某候选人 AI 面试详情的 `overview` tab;验证完成后在该终端 `Ctrl-C` 结束进程。

如何构造四种数据状态(用现有候选人数据挑选,不改库):

- **两栏都有**:选一个已绑定「必填表单」且已完成 AI 面试的候选人。
- **仅表单(面试栏空)**:选已提交表单、但 AI 面试未完成/无评估报告(`evaluation.questions` 为空)的候选人。
- **仅面试(表单栏空)**:选无必填表单、但已完成 AI 面试的候选人。
- **两栏都空**:选既无表单提交、AI 面试也无评估的候选人。
- 若现成数据难以覆盖某状态:两栏各自独立地在其数组为空时渲染 `emptyLabel`,逻辑对称且简单(见 Step 5/7),可对该状态改由代码走查确认,不阻塞。

核对清单:

- 桌面宽度两栏「表单答复」「面试题」左右并排;窄屏(`<md`)上下堆叠
- 每栏条目序号各自从 `1.` 开始
- 仅一栏有数据时,另一栏显示对应占位(「暂无表单答复」/「暂无面试题」)
- 两栏皆空时两个占位并列显示,页面无单独的整体空态文案
- 条目上不再有 `[表单]/[面试]` badge;「候选人收集信息」下方不再有副标题与顶部「N 条信息」badge

任一项不符则回到对应 Step 修正后重跑 Step 8–11。全部符合再继续。

- [ ] **Step 13: 提交**

先确认工作区只含本次两文件改动,再仅 stage 这两个文件后提交:

```bash
git status --short
git add apps/web/src/components/features/studio/studio-person-detail-panel.tsx apps/web/src/components/features/studio/studio-person-detail-panel.test.ts
git commit -m "feat(studio): 候选人收集信息按表单/面试题分区展示"
```

若 `git status --short` 显示其他无关改动(如格式化误伤的文件),不要 `git add .`,只 stage 上面两个明确路径。

---

## Self-Review

**1. Spec coverage**（逐条对照 spec):

- 决策① 左右并排 `md:grid-cols-2` → Step 7 ✓
- 决策② 每栏从 1 重编 → Step 4(`formItems.length + 1` / `interviewItems.length + 1`)✓
- 决策③ 去掉来源 badge → Step 3(删字段)+ Step 5(删 badge 块)✓
- 决策④ 单栏空态占位 → Step 5(`emptyLabel`)+ Step 7(两栏各传占位文案)✓
- 决策⑤ 去掉副标题 → Step 7 ✓
- 附:去掉顶部总数 badge → Step 7 ✓
- 栏内顺序沿用现状 → Step 4 循环逻辑未改 ✓
- 计数口径 = 条目数 → Step 7 `formItems.length` / `interviewItems.length` ✓
- section 不受长度门控、旧长度条件随 badge 删除 → Step 7 移除 `length > 0` 条件 ✓
- 守卫测试更新 `:72`/`:91`/`:97` + 负向断言(sourceLabel/副标题/总数 badge 已删)→ Step 1 ✓
- 验证标准① 完整包 test → Step 10 ✓;验证标准② typecheck → Step 11 ✓;验证标准③ 手工验证 → Step 12 ✓

**2. Placeholder scan:** 无 TBD/TODO;每个代码步骤均给出完整前后代码与确切命令。

**3. Type consistency:** builder 返回 `{ formItems, interviewItems }` 与 Step 6 解构、Step 7 使用一致;`CollectedCandidateInfoItem` 去 `sourceLabel` 后,builder 两处 push 与接口一致;`emptyLabel` 在组件定义(Step 5)与两处调用(Step 7)签名一致。
