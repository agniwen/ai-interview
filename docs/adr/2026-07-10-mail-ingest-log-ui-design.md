# 邮件入库日志 UI（Plan B）设计

> 承接 Plan A（`2026-07-09-mail-ingest-observability-design.md`，后端观测数据已落库并有查询接口 `GET /w/:slug/studio/mail-ingest-accounts/:id/messages`）。本设计是其前端消费面：让运营在工作区账号页直接看到每个邮箱的入库健康度与逐封邮件的全链路状态/失败原因。

## 目标

在工作区 `mail-ingest-accounts` 页，为每个邮箱账号提供一个**邮件入库日志抽屉**入口：账号行尾一个可点击的邮件数徽章（总数 + 问题数高亮），点开右侧抽屉，顶部展示该账号**上一轮轮询小结**，下方是可筛选、可分页的**逐封邮件记录表**（收到 → 标题匹配 → 附件 → JD 绑定 → 解析 → 入池），并暴露被跳过/失败的原因。

## 范围边界（YAGNI）

- **仅工作区端**（`w.$slug.studio.mail-ingest-accounts.tsx`）。平台端（`platform.mail-ingest-accounts.tsx`）本期不做，后续可复用同构件。
- 不含 CSV 导出、不含实时刷新/轮询（抽屉打开即拉取，提供手动刷新）。
- 不回填历史邮件的观测字段——Plan A 的写入侧字段只对改造后 worker 处理的新邮件生效；历史行相关字段为 `null`，UI 用 `—` 兜底。
- **标题不匹配的邮件不进逐封表**：worker（`processor.ts`）在标题不匹配时 `subjectSkipped +1` 后**直接 return，不写 `mail_ingest_message` 行**。因此"收到→标题匹配"这段链路**只在顶部小结以聚合数 `lastRunSubjectSkipped` 呈现**，逐封表无法逐封展示标题不符邮件。逐封表的 `skipped` 状态仅涵盖"有行但被后续环节跳过"（无附件/监听起点之前等）。逐封化标题不符留作后续增强（需 Plan A 侧为其建行），本期不做。

## 后端改动（两处：账号列表投影 + 新增 managed messages 路由）

### 改动一：账号列表行投影（列表徽章 + 上轮小结数据源）

页面唯一数据源是 `GET /w/:slug/studio/mail-ingest-accounts/managed`（`queryPaginatedWorkspaceMailIngestAccounts` → `listWorkspaceMailIngestAccountRows` → mapper `toWorkspaceMailIngestAccountRow`）。**只扩展这条 managed 路径**：给 `listWorkspaceMailIngestAccountRows` 投影加下列字段，并在行类型 `WorkspaceMailIngestAccountRow` 与 mapper `toWorkspaceMailIngestAccountRow` 中带出。

- **自助列表 `GET /` 不动**：它走的是**另一套 DAO** `listMailIngestAccounts → toDto`（`{ accounts }` 形状），与本改动无关，本期也无消费者，不扩展其契约。
- **平台 mapper 耦合须一并处理（否则 TS 断裂）**：`toPlatformMailIngestAccountRow` 内部 `...toWorkspaceMailIngestAccountRow(row)` 复用了共享 mapper。共享 mapper 一旦读取新增投影字段，平台行必须也提供这些字段，否则类型错误/运行时 undefined。**因此 `listPlatformMailIngestAccountRows` 的投影同样补上这几列**（相同的标量子查询与 `lastRun*` 透传）；平台端 UI 本期不渲染这些字段，仅为共享 mapper 的类型自洽而补列。

新增每行字段：

字段位置与类型（明确契约）：managed 响应现状是 `{ records: [{ account, user }], ... }`。新增字段一律放在 **record 顶层**（与 `account`/`user` 平级），不塞进 `account` 子对象，避免前后端对"计数在哪一层"产生分歧。

- `messageCount: number` — 该账号 `mail_ingest_message` 总数。以**关联标量子查询**实现，避免对现有 `member innerJoin user leftJoin account` 查询引入 `GROUP BY`：
  `sql<number>\`(select count(\*)::int from mail_ingest_message where account_id = ${mailIngestAccount.id})\``（**必须用 `sql<number>` 显式标注 TS 类型**，`::int`只约束 DB 返回值，不写泛型会推断成`unknown`，落实不了 `messageCount: number`）。**member 无账号（左连接 `account`为 null）的行会照常出现在`/managed`（成员主表），此时 `mailIngestAccount.id`为 null，子查询`account_id = null`自然得`0`** —— 即 `messageCount = 0`；前端对这类行不渲染徽章（见前端徽章节）。
- `problemCount: number` — 同上，附加 `and status in ('failed','skipped')`。**语义为「历史累计的邮件级问题数」**（failed + skipped 邮件总数）：终态记录不会自愈，账号出现过问题后徽章会持续红标，直到这些邮件被清理——本期接受该口径（"发现过问题的邮箱"本就该保留提示）。**不纳入** `queued` 邮件下游的附件解析/入池失败（那属于附件级、不在邮件级 `status` 上）——这类邮件仍是 `queued`，逐封表需展开行才见附件级失败；本期作为**已知范围边界**接受，附件级健康度的聚合留作后续增强。
- 透传已有账号列（`mailIngestAccount` 上已存在，Plan A 已加）：`lastRunReceived / lastRunSubjectSkipped / lastRunMatched / lastRunQueued / lastRunFailed`（DB 侧 `notNull default 0`）。**类型注意**：这些列取自左连接的 `account`，若某记录 account 为 null 则映射结果为 `number | null`；行类型 `WorkspaceMailIngestAccountRow` 顶层应声明为 `number | null`，前端按 null 走"尚未轮询"分支（见前端小结）。列表投影当前已含 `accountLastCheckedAt`、`accountLastError`，本次补上这 5 个 `lastRun*`。

**性能验收**：每行两个关联标量子查询（`messageCount`/`problemCount`）会随每页账号数放大。落地时确认 `mail_ingest_message.account_id` 有索引（Plan A 应已建），并在代表性数据量（如单账号数万 message）下对 `/managed` 列表跑一次 `EXPLAIN ANALYZE`，确保未退化为全表扫；若后续账号列表页很大，再评估"一次 `group by account_id` 聚合后 join"替代逐行子查询。本期不预优化，但把该门槛写进 DAO 测试/联调检查项。

### 改动二：新增 `GET /managed/:id/messages`（manage + org 作用域，补 `errorMessage`）

**不改既有 `GET /:id/messages`**：它是 Plan A（Task 6）定义的自助契约（`read` + owner-gated，用 `getMailIngestAccountLoginConfig({ userId })` 校验存在性），有 owner-scoping 回归测试，且本页并不消费它——原样保留，避免破坏性迁移。

**新增一条 managed 兄弟路由** `GET /managed/:id/messages`，与现有 `/managed`、`/managed/:id` 约定一致：

- **权限**：`requirePermission("mailIngestAccount", "manage")`，与 `/managed` 列表对齐——只有管理员能下钻全组织日志（持 `read` 但无 `manage` 的角色被拦）。
- **作用域/存在性校验**：用**只查账号 id 的非凭证 DAO**，按 `id + organizationId` 查存在性（不带 `userId`、不解密密码）——既是 org 作用域（管理员点任意 org 账号不 404、**跨组织账号返回 404**），又不为一次日志请求触碰凭证解密面。
- **查询/分页/字段**：复用 `listAccountMailMessages`（含 `status/keyword/receivedFrom/receivedTo/page/pageSize`），给其 `.select()` 与 DTO record **补 `errorMessage`**（`mail_ingest_message.errorMessage` 列 Plan A 已落库，当前未投影）；`skipReason`/`jdBindStatus`/`attachmentCount`/`poolSummary` 已在 DTO，不动。**该 DAO 为共享**：既有自助 `/:id/messages` 也走它，因此 `errorMessage` 会**同时出现在两个端点的响应**——这是对 messages 响应面的加法变更（非破坏，但两端响应都变，非"只动 managed"）。
- **`errorMessage` 脱敏在后端（非仅前端）**：原始列可能含底层 `error.message`/`responseText`（写入侧 `truncateError`）。因该字段经**共享 DTO** 返回、其他客户端/日志/调试工具都能取到，脱敏必须在 **DAO 投影层**完成，前端清洗挡不住 API 泄露。本期口径：**后端截断到 ~300 字 + 单行化**（去换行，避免整段堆栈），两端返回同一截断值。**深度正则清洗（连接串/令牌/响应体）不在本期**——该字段是已 `truncateError` 过的 IMAP/解析错误，本期只做截断+单行化，**残留风险如实声明**（截断后仍可能含少量内部错误文本），深度脱敏留作独立加固。

> 权限/作用域：列表 `/managed` 与日志 `/managed/:id/messages` 均按 `requirePermission("mailIngestAccount", "manage")` 门禁；管理员点任意本 org 账号均可开抽屉、拉日志，非本人账号**不再 404**，跨组织账号仍 404；无 `manage` 的成员被权限中间件拦截。自助 owner-gated 路由不受影响。

## 前端组件

页面：`apps/ai-recruitment-copilot/src/routes/w.$slug.studio.mail-ingest-accounts.tsx` 及其下账号列表组件。

### 1. 邮件数徽章（账号行）

- **`account === null` 的未配置成员行**：`/managed` 是成员主表左连账号，会返回**尚未配置邮箱的成员行**（`account` 为 null）。这类行**不渲染可点徽章**，改显示 `—`（无账号即无入库记录、也无有效账号 id 可下钻）。徽章与抽屉入口只对 `account !== null` 的行出现。
- 有账号的行：渲染 `messageCount`；当 `problemCount > 0` 时其后附红色 `·{problemCount}`。
- **可点击**（badge/链接样式 + hover 态 + 键盘可达：`<button>`，Enter/Space 触发 + focus 态），`aria-label="查看 {emailAddress} 的入库记录"`。点击以 `account.id` 设置 `selectedAccountId` 并打开抽屉（**用 `account.id`，绝不用 `user.id` 兜底**）。
- **`messageCount === 0` 不禁用点击**（前提是有账号）：抽屉顶部的上轮小结与 `lastError` 仍有诊断价值——"全部标题不符 / 仅监听起点前 / 首轮即失败"的账号往往没有逐封行(`messageCount=0`)却正是需要排查的异常账号。此时抽屉照常打开，逐封表走空态（见「状态与错误」），小结/错误照常展示。

### 2. 抽屉（shadcn `Sheet`，右侧）

打开时以选中账号 id 承载；内容分两区：

- **顶部 上轮小结**（复用列表行数据，零额外请求）：
  一行计数 `收到{lastRunReceived} · 标题不符{lastRunSubjectSkipped} · 命中{lastRunMatched} · 入队{lastRunQueued} · 失败{lastRunFailed}`（口径已定：直接展示 `lastRunMatched`，不再用 `matched - queued - failed` 派生"跳过数"，避免两种实现显示不同指标）。计数与时间/错误须**分行**呈现（计数一行、"最近检查 {lastCheckedAt 相对时间}"一行）。
  **背景**：`lastRun*` 是上一次**成功**轮询的保留快照，`lastCheckedAt`/`lastError` 是**最近一次尝试**（失败轮询只更新后者、保留上次成功的 `lastRun*`，见 commit「失败不清零 lastRun 计数」）。但表里**没有成功轮询时间戳/标记**,`lastRun*` 默认全 0——"首轮即失败"与"成功处理 0 封"无法区分,故 **UI 不武断标"上轮成功"**,改用如下启发式措辞：
  - `lastCheckedAt == null` → "尚未轮询",不显示计数。
  - `lastError != null 且 lastRun* 全为 0/ null` → "最近轮询失败,暂无成功快照" + 红色错误横幅(`lastError` 摘要),不展示计数(避免把全 0 读成"成功收到 0")。
  - 其余 → 展示计数(标"上轮快照"),`lastError` 非空时其下附红色横幅。
    说明:该启发式是无成功标记下的折中;若日后 Plan A 补 `lastSucceededAt` 时间戳,可精确区分,届时改此分支。`lastRun*` 顶层类型为 `number | null`,null 与 0 一并按上述处理。
- **逐封邮件区**：
  - **筛选栏**：状态**单选**（全部 / `queued` / `skipped` / `failed` / `processing`）、关键词（匹配主题或发件人）、收到时间范围（`receivedFrom` / `receivedTo`）。映射到 `GET /managed/:id/messages` 查询参数 `status / keyword / receivedFrom / receivedTo`。状态单选是刻意的**范围选择**——messages 端点 `status` 为单值枚举（Task 6 已定型且有测试）；本期只做加法（`errorMessage` 字段 + 新增 managed 路由），**不引入多状态筛选**；一次筛出"全部问题（failed+skipped 合并）"留作后续增强（需端点支持多状态或 `problemsOnly`）。（`skipReason`/`jdBindStatus` 同样不做独立筛选项，仅作表格列展示。）
  - **时间范围语义**：`receivedFrom` / `receivedTo` 为**闭区间**，控件粒度到日，时区以浏览器本地为准。序列化：`receivedFrom` 取**本地当日 `00:00:00.000`**、`receivedTo` 取**本地当日 `23:59:59.999`**，再转 UTC ISO 传参（现有 DAO 用 `receivedAt >= receivedFrom AND receivedAt <= receivedTo`；不要直接把 `YYYY-MM-DD` 交给端点按 UTC 零点解析，否则本地时区下会漏掉边界当日记录，`receivedTo` 也切忌传"次日零点"以免误纳入次日零点整记录）。**校验**：`receivedFrom > receivedTo` 时前端拦截并提示，不发请求（避免静默空结果）。
  - **邮件表**：列 `收到时间 | 状态 | JD绑定 | 附件 | 主题 | 发件人`。
    - 状态：badge（queued 中性 / skipped 警示 / failed 危险 / processing 进行中）。`status='failed'` 且 `errorMessage` 非空时，行内/展开区展示 `errorMessage`（危险色）；`skipped` 行展示 `skipReason`。
    - JD绑定：`boundJobDescriptionName ?? '—'`，配合 `jdBindStatus`（bound/unmatched/ambiguous/fallback）小标；`jdBindStatus` 为 null 显示 `—`。
    - 附件：`{resumeAttachmentCount ?? '—'}/{attachmentCount ?? '—'} · {poolSummary}`（简历附件数/总附件数，如 `1/2 · all_pooled`）——同时展示两者以区分"完全无附件"（`attachmentCount=0`）与"有附件但无可用简历/格式不支持"（`attachmentCount>0` 而 `resumeAttachmentCount=0`）；`poolSummary` 为 null（无 batch/skipped 行）显示 `—`。行可展开，展示 `attachments[]` 每项：文件名、`resumeParseStatus`、`resumeParseError`（有则红）、`hasDuplicate`（疑似重复标记）。
  - **分页**：`page` / `pageSize`（默认 20），`total` 取响应；上一页/下一页 + 总数展示。**切换任一筛选条件或切换账号时重置 `page` 回第 1 页**（避免旧页码把实际有结果的筛选误显示为空）。

### 3. 数据流

- 徽章计数与上轮小结：随**账号列表查询**（`['managed-mail-ingest-accounts', slug]`）一次性获得（后端方案已含），无额外请求。抽屉顶部**只存选中账号 id**，小结数据每次渲染时从**当前列表查询结果**按 id 派生（`accounts.find(a => a.id === selectedAccountId)`），**不缓存点击时的行对象**——否则列表刷新后顶部仍显示旧快照。
- 邮件表：TanStack Query，queryKey = `['mail-ingest-messages', slug, accountId, filters, page]`，经 `rpcFetch(rpc.api.w[':slug'].studio['mail-ingest-accounts'].managed[':id'].messages.$get({ param, query }))`（新增 managed 路由，`@/lib/client/rpc` + `@/lib/client/api`）。查询 `enabled` 仅在抽屉打开且有选中账号时为真（关闭后不请求，再次打开按缓存新鲜度决定是否 refetch）；切换筛选/翻页触发 refetch。
- 手动刷新：**同时 invalidate 邮件表查询与账号列表查询**（`['managed-mail-ingest-accounts', slug]`），否则顶部小结/徽章仍读旧列表缓存，会与刷新后的邮件记录不一致；因顶部从列表结果派生（上一条），列表刷新后小结自动更新。

## 状态与错误

- 加载：抽屉邮件区骨架行。
- 空态区分两种：
  - **账号确无记录**（无任何筛选条件且 `total === 0`）：`该邮箱暂无入库记录`。
  - **筛选未命中**（存在筛选条件且 `total === 0`）：`当前筛选条件下无匹配邮件`，并提供"清除筛选"入口。
- null 字段（`jdBindStatus` / `boundJobDescriptionName` / `attachmentCount` / `resumeAttachmentCount` / `poolSummary`）：渲染 `—`。tooltip 文案不武断归因为"改造前未采集"——因为 `unmatched`/`skipped`/无 batch 等**新邮件也可能合法为 null**；统一用中性文案「无该字段数据」。
- `receivedAt` / `subject` / `fromAddress` 在 DB 与 DTO 中同样可为 null（历史/处理中记录）：`receivedAt` 为 null 时时间列显示 `—`（不做相对时间格式化，避免 Invalid Date）；`subject` 为 null 显示 `（无主题）`、`fromAddress` 为 null 显示 `—`。`status` 恒有值，照常渲染 badge。
- 错误：`rpcFetch` 抛 `ApiError` → toast（中文兜底信息）+ 抽屉内联重试按钮。

## 测试

- **后端 DAO**（`.../mail-ingest/__tests__/dao.test.ts`，真实 PG）：
  - 为 `listWorkspaceMailIngestAccountRows`/其分页查询新增用例——建 1 账号 + 若干 message（含 1 failed、1 skipped、其余 queued），断言 `messageCount` = 总数、`problemCount` = failed+skipped 数；断言 `lastRun*` 透传（先 `finishMailIngestAccountRun` 写入再查）。另断言 member 无账号时计数为 0。
  - 为 `listAccountMailMessages` 断言 `errorMessage` 随 `status='failed'` 行投影出（此前未 select）。
  - 平台路径：`listPlatformMailIngestAccountRows` 补列后，断言其行同样带出 `messageCount`/`problemCount`/`lastRun*`（哪怕平台 UI 不渲染），以守住共享 mapper `toPlatformMailIngestAccountRow` 的类型自洽——防止后续有人删平台投影列导致 mapper 断裂。
- **后端路由**（`.../mail-ingest/__tests__/route.test.ts`）：新增 `GET /managed/:id/messages` 需**三态权限闭环**——① 同组织 `manage` 下钻非本人账号取到日志（不 404）；② 持 `read` 无 `manage` 被拒；③ 跨组织 `manage` 访问他组织账号仍 404。**关键**：现有测试文件在模块级把 `requirePermission` **无条件 mock 放行**,而真实中间件是走 `auth.api.hasPermission` 判定——沿用该 mock 则 ②③ 是假验证。因此这三态用例**必须装载真实 `requirePermission` 中间件 + 真实 RBAC 上下文**（按角色授予/不授予 `manage`），不能拿"删断言"当备选。另确认既有自助 `/:id/messages` 的 owner-scoping 回归测试原样保持通过（本改动不碰它）。
- **前端**（沿用 web 现有组件测试范式）：徽章渲染（`problemCount>0` 显示红色子计数、=0 时不显示、**`messageCount===0` 仍可点击开抽屉**）；点击徽章打开抽屉且顶部小结**从当前列表结果按 id 派生**；上轮小结启发式分支（尚未轮询 / 最近失败暂无成功快照 / 正常展示计数）；筛选变更→查询参数联动（mock rpc 断言入参，含 `receivedFrom` 本地日初 / `receivedTo` 本地日末的序列化、`from>to` 被拦不发请求）+ 切筛选/换账号重置 `page`；`errorMessage` 在 failed 行展示；空态区分"无记录" vs "筛选未命中"；null 字段（含 `receivedAt`/`subject`/`fromAddress`）渲染兜底；**手动刷新同时失效邮件表与列表查询**；徽章**键盘可达**（Enter/Space 触发、focus 态）；分页交互（total 独立于页大小）。

## 交付验收

运营在工作区账号页：一眼从徽章红色子计数发现"有问题的邮箱"；点开抽屉看到该账号上轮轮询小结与（若有）错误；在逐封表中按状态/关键词/时间筛出被跳过或失败的邮件，展开看具体是哪份附件、为何未入池。历史邮件不致因字段缺失显示为坏页（`—` 兜底）。
