# 邮件入库日志 UI（Plan B）设计

> 承接 Plan A（`2026-07-09-mail-ingest-observability-design.md`，后端观测数据已落库并有查询接口 `GET /w/:slug/studio/mail-ingest-accounts/:id/messages`）。本设计是其前端消费面：让运营在工作区账号页直接看到每个邮箱的入库健康度与逐封邮件的全链路状态/失败原因。

## 目标

在工作区 `mail-ingest-accounts` 页，为每个邮箱账号提供一个**邮件入库日志抽屉**入口：账号行尾一个可点击的邮件数徽章（总数 + 问题数高亮），点开右侧抽屉，顶部展示该账号**上一轮轮询小结**，下方是可筛选、可分页的**逐封邮件记录表**（收到 → 标题匹配 → 附件 → JD 绑定 → 解析 → 入池），并暴露被跳过/失败的原因。

## 范围边界（YAGNI）

- **仅工作区端**（`w.$slug.studio.mail-ingest-accounts.tsx`）。平台端（`platform.mail-ingest-accounts.tsx`）本期不做，后续可复用同构件。
- 不含 CSV 导出、不含实时刷新/轮询（抽屉打开即拉取，提供手动刷新）。
- 不回填历史邮件的观测字段——Plan A 的写入侧字段只对改造后 worker 处理的新邮件生效；历史行相关字段为 `null`，UI 用 `—` 兜底。

## 后端改动（单处：工作区账号列表）

扩展工作区账号列表 DAO `listWorkspaceMailIngestAccountRows`（`.../mail-ingest/dao.ts`）的投影，及其行类型 `WorkspaceMailIngestAccountRow` 与出参 DTO：

新增每行字段：

- `messageCount: number` — 该账号 `mail_ingest_message` 总数。以**关联标量子查询**实现，避免对现有 `member innerJoin user leftJoin account` 查询引入 `GROUP BY`：
  `sql\`(select count(\*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})\``账号为空（member 无账号，左连接为 null）时子查询自然得`0`。
- `problemCount: number` — 同上，附加 `and status in ('failed','skipped')`。
- 透传已有账号列（`mailIngestAccount` 上已存在，Plan A 已加）：`lastRunReceived / lastRunSubjectSkipped / lastRunMatched / lastRunQueued / lastRunFailed`。列表投影当前已含 `accountLastCheckedAt`、`accountLastError`，本次补上这 5 个 `lastRun*`。

`GET /w/:slug/studio/mail-ingest-accounts/`（自助列表）与其 DTO 映射相应带出上述字段。**`GET /:id/messages`（Plan A / Task 6）不改。** 平台列表 DAO `listPlatformMailIngestAccountRows` 本期不改。

> 权限/作用域不变：列表仍按 `member`（当前用户在本 org 的成员行）返回；徽章与抽屉均只面向账号归属者，沿用现有列表可见性。抽屉内的 messages 拉取走 owner-gated 的 `GET /:id/messages`（Task 6 已保证跨用户 404）。

## 前端组件

页面：`apps/ai-recruitment-copilot/src/routes/w.$slug.studio.mail-ingest-accounts.tsx` 及其下账号列表组件。

### 1. 邮件数徽章（账号行）

- 渲染 `messageCount`；当 `problemCount > 0` 时其后附红色 `·{problemCount}`。
- 可点击（badge/链接样式 + hover 态 + 键盘可达），`aria-label="查看 {emailAddress} 的入库记录"`。点击设置 `selectedAccount` 并打开抽屉。
- `messageCount === 0` 时徽章显示 `0` 且禁用点击（无记录）。

### 2. 抽屉（shadcn `Sheet`，右侧）

打开时以选中账号 id 承载；内容分两区：

- **顶部 上轮小结**（复用列表行数据，零额外请求）：
  一行计数 `上轮 收到{lastRunReceived} · 标题不符{lastRunSubjectSkipped} · 入队{lastRunQueued} · 失败{lastRunFailed} · 跳过{lastRunMatched - lastRunQueued - lastRunFailed}`（跳过数 = `matched - queued - failed`；也可直接展示 matched），加 `lastCheckedAt` 相对时间。`lastError` 非空时其下红色横幅显示错误摘要。
  说明：`lastCheckedAt` 为 null（从未轮询）时显示"尚未轮询"。
- **逐封邮件区**：
  - **筛选栏**：状态**单选**（全部 / `queued` / `skipped` / `failed` / `processing`）、关键词（匹配主题或发件人）、收到时间范围（`receivedFrom` / `receivedTo`）。映射到 `GET /:id/messages` 查询参数 `status / keyword / receivedFrom / receivedTo`。状态单选是刻意选择——现有 messages 端点 `status` 为单值枚举（Task 6 已定型且有测试），本期不改该端点；一次筛出"全部问题（failed+skipped 合并）"留作后续增强（需端点支持多状态或 `problemsOnly`）。（`skipReason`/`jdBindStatus` 同样不做独立筛选项，仅作表格列展示。）
  - **邮件表**：列 `收到时间 | 状态 | JD绑定 | 附件 | 主题 | 发件人`。
    - 状态：badge（queued 中性 / skipped 警示 / failed 危险 / processing 进行中）。
    - JD绑定：`boundJobDescriptionName ?? '—'`，配合 `jdBindStatus`（bound/unmatched/ambiguous/fallback）小标；`jdBindStatus` 为 null 显示 `—`。
    - 附件：`{resumeAttachmentCount ?? '—'} · {poolSummary}`（如 `1 · all_pooled`）；`poolSummary` 为 null（无 batch/skipped 行）显示 `—`。行可展开，展示 `attachments[]` 每项：文件名、`resumeParseStatus`、`resumeParseError`（有则红）、`hasDuplicate`（疑似重复标记）。
  - **分页**：`page` / `pageSize`（默认 20），`total` 取响应；上一页/下一页 + 总数展示。

### 3. 数据流

- 徽章计数与上轮小结：随**账号列表查询**一次性获得（后端方案已含），抽屉顶部直接读选中行对象，无额外请求。
- 邮件表：TanStack Query，queryKey = `['mail-ingest-messages', slug, accountId, filters, page]`，经 `rpcFetch(rpc.api.w[':slug'].studio['mail-ingest-accounts'][':id'].messages.$get({ param, query }))`（`@/lib/client/rpc` + `@/lib/client/api`）。切换筛选/翻页触发 refetch；抽屉内提供手动刷新（invalidate）。

## 状态与错误

- 加载：抽屉邮件区骨架行。
- 空：`该邮箱暂无入库记录`（`total === 0`）。
- 历史 null 字段（`jdBindStatus` / `boundJobDescriptionName` / `attachmentCount` / `resumeAttachmentCount` / `poolSummary`）：渲染 `—`，hover tooltip「改造前邮件未采集该字段」。`status`、`receivedAt`、`subject`、`fromAddress` 与附件解析态照常显示。
- 错误：`rpcFetch` 抛 `ApiError` → toast（中文兜底信息）+ 抽屉内联重试按钮。

## 测试

- **后端**（`.../mail-ingest/__tests__/dao.test.ts`，真实 PG）：为 `listWorkspaceMailIngestAccountRows`/其分页查询新增用例——建 1 账号 + 若干 message（含 1 failed、1 skipped、其余 queued），断言 `messageCount` = 总数、`problemCount` = failed+skipped 数；断言 `lastRun*` 透传（先 `finishMailIngestAccountRun` 写入再查）。另断言 member 无账号时计数为 0。
- **前端**（沿用 web 现有组件测试范式）：徽章渲染（`problemCount>0` 显示红色子计数、=0 时不显示、`messageCount===0` 禁用）；点击徽章打开抽屉且顶部小结取自行数据；筛选变更→查询参数联动（mock rpc 断言入参）；null 字段渲染为 `—`；分页交互（total 独立于页大小）。

## 交付验收

运营在工作区账号页：一眼从徽章红色子计数发现"有问题的邮箱"；点开抽屉看到该账号上轮轮询小结与（若有）错误；在逐封表中按状态/关键词/时间筛出被跳过或失败的邮件，展开看具体是哪份附件、为何未入池。历史邮件不致因字段缺失显示为坏页（`—` 兜底）。
