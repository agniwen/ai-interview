# 候选人收集信息 → 表单/面试题分区展示

- **日期**: 2026-07-07
- **需求编号**: S16「AI 面试内容分区域展示」
- **状态**: 设计已确认,待实现

## 背景

AI 面试详情结果页(`overview` tab)有一个「候选人收集信息」区块,当前把两种来源的信息**合并成一条扁平列表**顺序展示:

1. 候选人面试前填写的**表单答复**(`kind: "form"`,来自 `CandidateFormSubmissionWithSnapshot`)
2. AI 面试对**面试题**的评估(`kind: "interview"`,来自 `latestReport.evaluationCriteriaResults.questions`,含 evidence 引用)

两者共用一个全局连续序号,靠每条上的 `[表单]/[面试]` badge 区分。副标题写死「按表单、面试题顺序展示候选人提供的信息」。

**"表单"澄清**:这里的表单是招聘方(HR)预设、候选人在进 AI 语音面试**之前**必须填写的结构化问卷(单选/多选/自由填写),是进语音面试房间的硬门槛(未填完返回 `forms_required` 409)。它与 AI 语音面试问的题目是**两套独立数据**。本区块的"面试题"指的是 `evaluation.questions`(AI 对面试题的评估 + evidence),**不是**原始逐字稿 `report.turns`。

## 目标

把这一条合并列表**按来源拆成两个分区**:左「表单答复」区、右「面试题」区。

## 改动范围

全部集中在**单个组件文件 + 其守卫测试**,无 schema、无后端、无其他文件:

- `apps/web/src/components/features/studio/studio-person-detail-panel.tsx`
- `apps/web/src/components/features/studio/studio-person-detail-panel.test.ts`

所有相关符号(`getCollectedCandidateInfoItems`、`collectedCandidateInfoItems`、`CollectedCandidateInfoList`)的引用均锁在该组件文件内,无跨文件消费。

## 已确认的交互决策

| #   | 决策点         | 选择                                                   |
| --- | -------------- | ------------------------------------------------------ |
| ①   | 版式           | **左右并排**(`md:grid-cols-2`;`<md` 退化为上下堆叠)    |
| ②   | 编号           | **每栏从 1 重编**                                      |
| ③   | 来源 badge     | **去掉每条的 `[表单]/[面试]` badge**(栏标题已标明来源) |
| ④   | 单栏空态       | **显示占位提示**(两栏始终对称)                         |
| ⑤   | 副标题         | **去掉**「按表单、面试题顺序展示…」那句                |
| 附  | 顶部总数 badge | **去掉**(每栏已各有计数)                               |

## 详细设计

### 1. 数据层 —— `getCollectedCandidateInfoItems`(约 :306)

返回类型从 `CollectedCandidateInfoItem[]` 改为:

```ts
{ formItems: CollectedCandidateInfoItem[]; interviewItems: CollectedCandidateInfoItem[] }
```

- 表单循环 push 到 `formItems`,`sequence = formItems.length + 1`
- 面试循环 push 到 `interviewItems`,`sequence = interviewItems.length + 1`
- 两组各自从 1 编号(决策②)
- **栏内顺序沿用现状,不变**:表单栏按 `formSubmissions` → 每份 `snapshot.questions` 的顺序;面试栏按 `evaluation.questions` 数组顺序。拆分只是把原扁平列表按 `kind` 分组,不引入任何新的排序规则。
- `CollectedCandidateInfoItem` 接口**删掉 `sourceLabel` 字段**(去掉 badge 后成为孤儿);`kind` 保留(面试条目靠它渲染「AI 分析」与「候选人回答」文案差异)

### 2. 展示层 —— `CollectedCandidateInfoList`(约 :371)

- **删掉** `sourceLabel` badge 块(约 :392-399 的 `<Badge>…{item.sourceLabel}…</Badge>`);`meta`(问卷标题)这行**保留**
- **新增 prop `emptyLabel: string`**:`items.length === 0` 时渲染该占位文案,替代原来写死的「暂无可展示的收集信息」
- 单栏内部仍是单列渲染(不引入 `lg:grid-cols-2` 等多列样式,守卫测试对此有断言)

### 3. section JSX(约 :2037-2054)

- `<h3>候选人收集信息</h3>` 保留(守卫测试依赖)
- **删掉**副标题 `<p>`(决策⑤)与顶部 `{总数} 条信息` badge(附加决策)
- **section 本身无条件渲染,不受列表长度门控**:现状唯一的长度条件是 `:2045` 的 `collectedCandidateInfoItems.length > 0 ? <Badge/> : null`,它只包住那个顶部 badge。badge 删除后该条件一并移除;拆分后不再存在 `collectedCandidateInfoItems` 变量(见 §4 改为解构)。因此两栏皆空时 section 仍渲染、两个占位正常显示,不会落空。
- **栏标题样式**:两栏标题沿用 section 主标题 `<h3>` 的 `font-medium text-sm`(用 `<h4>` 同 class),计数 `Badge variant="outline"` 内联在标题右侧;具体间距/像素按实现时匹配现有风格,无需在 spec 固化。
- 单列表替换为两栏 grid:

```tsx
<div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
  <div>
    <div>
      表单答复 <Badge>{formItems.length}</Badge>
    </div>
    <CollectedCandidateInfoList items={formItems} emptyLabel="暂无表单答复" />
  </div>
  <div>
    <div>
      面试题 <Badge>{interviewItems.length}</Badge>
    </div>
    <CollectedCandidateInfoList items={interviewItems} emptyLabel="暂无面试题" />
  </div>
</div>
```

- **栏标题计数口径 = 条目数(题数),与旧「N 条信息」一致**:`formItems.length` 是所有问卷的题目总数(非表单份数),`interviewItems.length` 是面试题数。
- `md:grid-cols-2` → 桌面左右并排(决策①),`<md` 自动上下堆叠(移动端退化)
- 两栏结构始终对称,空栏各显示自己的占位(决策④)
- loading 分支 `isFormSubmissionsLoading || isReportsLoading ? <FormsSkeleton /> : …` 保持;grid 放在非 loading 分支
- section 外层 `xl:col-span-2` 保留(守卫测试依赖)

### 4. 调用处(约 :1602)

```ts
const { formItems, interviewItems } = getCollectedCandidateInfoItems({
  evaluation: latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
  formSubmissions,
});
```

> **数据路径口径(全文统一)**:本文中的 `evaluation` 形参 **就是** `latestReport.evaluationCriteriaResults`;builder 内读取的 `evaluation.questions` 即 `latestReport.evaluationCriteriaResults.questions`。背景段出现的 `latestReport.evaluationCriteriaResults.questions` 与详细设计里的 `evaluation.questions` 指同一条路径,仅书写位置不同,不是两个来源。此调用与传参逻辑**保持现状不变**,本次改动只改返回值的解构方式。

### 5. 守卫测试更新(`studio-person-detail-panel.test.ts`)

该文件是**源码结构守卫测试**(读 `.tsx` 文本做断言),编码的是旧的单列表设计,需同步更新失效断言:

- `:72` `items={collectedCandidateInfoItems}` → 改为断言两栏 `items={formItems}` / `items={interviewItems}`
- `:91` `sequence: items.length + 1` → 改为分组计数 `sequence: formItems.length + 1`(及/或 interviewItems)
- `:97` `sourceLabel` → 删除(badge 已移除)

保持不变的断言:`xl:col-span-2`、`<CollectedCandidateInfoList`、`{item.sequence}.`、`问题` / `AI 分析` 顺序、`item.kind === "interview"` 相关、tooltip/clamp 相关、`function getCollectedCandidateInfoItems` 存在等。

> 说明:该组件现有测试全部是源码结构守卫,无真实渲染测试。按"匹配现有风格"沿用同一套守卫测试、只更新失效断言,不引入新的渲染测试范式。

## 验证标准

1. `pnpm --filter @app/web test` 通过(更新后的守卫测试)
2. `pnpm --filter @app/web typecheck` 通过
3. 手工验证:
   - 桌面端两栏左右并排,移动端上下堆叠
   - 每栏序号各自从 1 开始
   - 某栏无数据时显示对应占位(「暂无表单答复」/「暂无面试题」),另一栏正常
   - 两栏都空时:两个占位同时显示,不再有单独的整体空态文案

## 已定行为说明

- **两栏皆空的整体空态(已定)**:原实现有一句「暂无可展示的收集信息」。拆分后此整体空态**去掉**,由两栏各自的占位(「暂无表单答复」+「暂无面试题」)同时显示覆盖。这是本设计的确定行为,非待复核项。
