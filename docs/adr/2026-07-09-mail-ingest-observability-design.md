# 邮件入库可观测性 — 设计文档

日期：2026-07-09
状态：已批准，待实现

## 背景与目标

邮件入库链路当前所有失败/跳过都是**静默**的，运营无法排查「某候选人的简历为什么没进来」：

- **标题关键词不匹配**的邮件：`processor.ts` 直接 `return`，既不建 `mail_ingest_message` 行、连计数都不加 —— 完全无痕。
- `mail_ingest_message.status` 枚举很粗（`processing/queued/skipped/failed`），`skipped` **不说原因**（标题？附件？已处理？）。
- **JD 编码绑定结果**（命中/未命中/歧义/回退）**没有存**在任何地方。
- 前端只有**账号级**视图（`lastCheckedAt`/`lastError`），没有信件级。

目标：让运营能**自助排查单封信/单份简历**在链路中的状态与被跳过/失败的原因。

## 范围决策（来自澄清问答）

- **主消费者**：运营自助排查单封信（追踪/详情），**不是**聚合仪表盘。
- **记录范围**：命中标题关键词的邮件**逐封建行、全链路可追**；未命中关键词的**只记计数**（账号/本轮级），不逐封建行。
- **追踪边界**：止于「入池」（邮件→附件→去重→JD绑定→解析→入池 ready/failed）；入库/筛选/评价只给**下游跳转链接**，不在本视图重复展示。
- **展现入口**：现有**邮箱账号页下钻** + 筛选（一期），不做跨账号全局搜索。
- **方案**：就地增强 `mail_ingest_message`（不引入独立事件时间线表）。

## 架构总览

```
worker processor.ts（采集点改造）
        │  命中标题的邮件一律建 message 行 + 写终态/原因/JD绑定
        ▼
mail_ingest_message（加列：skipReason/jdBindStatus/boundJobDescriptionId/extractedJobCodes/resumeAttachmentCount）
        │  建批次的邮件：1 message=1 batch=N 附件；跳过/无附件 batchId 可空；batchId → batch item → pool item（各附件独立解析/入池状态）
        ▼
后端 messages 端点（工作区 /studio + 平台 /platform 各一，DAO JOIN 下游 + 过滤 + 作用域）
        ▼
前端 账号页下钻「信件日志」（邮件行 → 展开 N 个附件的解析/入池状态 + 跳转）
        +
mail_ingest_account 上轮小结计数（含「标题不符跳过 N 封」）
```

## 组件设计

### 1. 数据模型：`mail_ingest_message` 加列

现有列：`id, accountId, batchId(FK→resume_upload_batch, set null), createdAt, errorMessage, fromAddress, mailbox, messageId, processedAt, receivedAt, status<MailIngestMessageStatus>, subject, uid, uidValidity`。

新增列（全部 nullable，兼容存量；枚举一律用 `text().$type<Enum>()` + 应用层 union，**沿用现有 `MailIngestMessageStatus` 的落库方式，不加 DB check**，未知值兜底为 `null`）：

- `skipReason: text` —— `status=skipped` 时的原因，一期只有一个值：`no_supported_attachment`。配合下面两个附件计数，UI 可区分「无附件」（`attachmentCount=0`）与「有附件但格式不支持」（`attachmentCount>0 且 resumeAttachmentCount=0`）。
- `jdBindStatus: text` —— `bound` | `unmatched` | `ambiguous` | `fallback`（判定见 §2 决策表）。
- `boundJobDescriptionId: text`（FK→job_description, set null）—— **实际绑定的岗位**，各态取值：`bound`→命中的 JD；`fallback`→账号默认 JD；`ambiguous`→维持现状代码实际绑定的值（可能是默认 JD 或空）；`unmatched`→空。
- `extractedJobCodes: jsonb` —— 从标题抽到的候选码数组；**归一化后存**（`trim().toUpperCase()`、去重、顺序按标题出现先后），空则 `[]`。
- `attachmentCount: integer` —— **全部**附件数；`resumeAttachmentCount: integer` —— **受支持的简历**附件数（`selectSupportedResumeAttachments` 后）。

**基数（关键，注意 batchId 可空）**：只有**成功走到建批次**的邮件才有 batch —— `createBatchForMail` 给这类邮件建**一个** batch（附件逐个建池条目），`updateMailIngestMessageResult` 写**唯一** `batchId`。故「1 邮件 = 1 message = 1 batch = N 附件」**仅对「建了 batch 的邮件」成立**（`queued`；以及入队失败 `failed` —— batch 已建但交接失败）。**无受支持附件跳过（`skipped`）没有 batch**，`batchId` 为空。所以：message↔batch 是 **0/1 : 1**、batch↔附件是 **1:N**；**下游 JOIN 必须容忍 `batchId=null`**（该行只展示「入库前段」结果，无附件级展开）。

去重/解析/入池状态**不进 message 行**：由 UI 经 `message.batchId → resume_upload_batch_item → resume_pool_item`（`resumeParseStatus`/`resumeParseError`）与疑似重复标记 JOIN 得到。一封信的 N 个附件各自有独立的解析/入池状态（见 §4 展开）。message 行只负责「入库前段（邮件级）」。

**关于 `already_processed`**：不设该 skipReason。message 行按**复合唯一键 `(accountId, mailbox, uidValidity, uid)`**（现有 `mail_ingest_message_account_mail_uid_uq`）**只创建一次**，其 `status` 反映真实终态（`queued`/`skipped`/`failed`）；后续轮询再遇到同键（`claimMailIngestMessageForProcessing` 命中现有终态行）**直接 no-op、不覆盖**——重复处理不是一个独立结局，无需记录。

### 2. 采集点改造（`apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts`）

命中标题关键词、通过 `listenStart`、被 `claimMailIngestMessageForProcessing` **首次**认领的邮件 —— 建行，按路径写**入库前段终态**（注：`queued` 只表示「已交接解析队列」，不代表解析/入池完成；每份附件的最终 `ready/failed` 是**下游**状态，由 §4 的 JOIN 展开显示）：

| 路径         | status    | 附加字段                                                                              |
| ------------ | --------- | ------------------------------------------------------------------------------------- |
| 成功交接队列 | `queued`  | `resumeAttachmentCount`、`jdBindStatus`、`boundJobDescriptionId`、`extractedJobCodes` |
| 无受支持附件 | `skipped` | `skipReason=no_supported_attachment`（当前只加计数、行状态未落实，需补）              |
| 入队失败     | `failed`  | `errorMessage`                                                                        |

（无 `already_processed` 行：重复 uid 命中现有终态行时 no-op，见 §1。）

**JD 绑定判定（仅记录，不改绑定行为，无需重构抽码）**：`jdBindStatus` **直接由现有 `resolveMailJobBinding` 已经算出的中间值（抽到的码 + `fetchJobDescriptionsByCodes` 命中数 + 账号默认 JD）派生**——不新增抽取/匹配逻辑、不改变绑定动作本身（歧义时是否回退、正则是否加前缀约束都归 #2）。决策表：

| 抽码 `fetchJobDescriptionsByCodes` 命中 | 账号有默认 JD | jdBindStatus                                                         |
| --------------------------------------- | ------------- | -------------------------------------------------------------------- |
| 恰好 1 个                               | —             | `bound`                                                              |
| ≥ 2 个（不同 JD）                       | —             | `ambiguous`（**动作维持现状**：仍按当前代码回退/绑定，不因本期改变） |
| 0 个                                    | 有            | `fallback`                                                           |
| 0 个                                    | 无            | `unmatched`                                                          |

- **`listenStart` 之前的旧邮件仍只计数不建行**（有意忽略的历史邮件）。
- **标题不匹配的邮件仍不建行**，改为 `subjectSkipped++` 计入本轮小结（见 §3）——该类问题**只能定位到账号/本轮，无法定位到单封**（已批准的范围收缩）。

### 3. 计数：`mail_ingest_account` 上轮小结

给账号加列（在 `finishMailIngestAccountRun` 写）：`lastRunReceived`（本轮扫描到的邮件总数）| `lastRunSubjectSkipped`（标题不符）| `lastRunMatched`（命中标题、建了行的邮件 = `queued` + `skipped(no_attachment)` + `failed`）| `lastRunQueued` | `lastRunFailed`（均 integer，默认 0）。

**计数守恒（口径对账）**：本轮 SEARCH 返回的邮件按互斥归类，须满足
`lastRunReceived = lastRunSubjectSkipped + listenStartSkipped + duplicateNoop + lastRunMatched`，其中 `lastRunMatched = lastRunQueued + noAttachmentSkipped + lastRunFailed`。（`listenStartSkipped`/`duplicateNoop` 为内部量，页面不必展示，但计数实现必须让等式成立以便对账。）

用途：账号页头部展示「上轮：收 `lastRunReceived` · 标题不符跳过 `lastRunSubjectSkipped` · 入队 `lastRunQueued` · 失败 `lastRunFailed`」，让「关键词配太窄」可被发现。是**上轮快照**，非历史累计。本轮异常退出时 `lastError` 反映失败原因，页面小结即上一次成功完成轮次的值。

### 4. UI：账号页下钻「信件日志」

- 位置：现有邮箱账号页（工作区 `/w/:slug/studio/mail-ingest-accounts` 与平台 `/platform/mail-ingest-accounts`）每账号行 →「查看日志」→ 抽屉/子页。
- **邮件行（每封信一行）**：收件时间 · 发件人 · 标题 · 附件数（`resumeAttachmentCount`/`attachmentCount`）· JD绑定（状态 + 岗位名）· 前段终态（`queued` | `skipped`+原因 | `failed`+错误）· **入池汇总态**（由该信 N 个附件推出：`全部入池` / `部分失败` / `全部失败` / `解析中`；无 batch 的行显示「—」）。
- **附件级展开（1:N，关键）**：邮件行可展开出该信 `batchId` 下的 **N 个附件/池条目**，每个显示：文件名 · 解析·入池状态（`resumeParseStatus` + `resumeParseError`）· 疑似重复标记 · →跳转（该池条目 / 若已入库则简历详情）。这样才能定位「同一封信里某一份简历为什么没解析/没入池」。**疑似重复标记一期收敛为布尔**：该池条目**是否存在** duplicate-match 行（不拉取重复详情，缩小依赖面）。
- 筛选：前段终态、`skipReason`、`jdBindStatus`、标题/发件人关键词、时间范围（**按 `receivedAt`**）。排序 **`receivedAt DESC NULLS LAST, id DESC`**（稳定 tie-breaker，避免空值/同时刻行分页抖动）。
- 账号头部：§3 的上轮小结计数。
- 后端：**两个 surface 各有对应端点**，镜像现有账号端点的挂载与权限：
  - 工作区自助 `GET /w/:slug/studio/mail-ingest-accounts/:id/messages`
  - 平台管理 `GET /platform/mail-ingest-accounts/:id/messages`（复用现有 platform server function 层）
  - **DAO 分两步查询**（避免 1:N JOIN 后分页导致父行重复/漏行）：① 先按过滤/排序对 **message 行**分页；② 再按本页各行的 `batchId` **批量加载**对应 batch item/pool item 及入池汇总态。
- **权限/作用域**：账号是 `org+user` 维度。自助端只能看**自己创建（`createdBy=当前用户`）**账号的信件；平台端需 `mailIngestAccount` `manage` 权限、可看本 org 全部账号。**org 作用域须在所有涉及表（message / batch / pool item）上重复施加**，不能只校验账号行；共享邮箱 = 同一条 `mail_ingest_account` 行，可见性随该行的 `createdBy`。

### 5. 错误处理 / 边界

- 存量 message 行新列为空 → UI 显示「—」。
- **索引**：日志列表按 `(accountId, receivedAt desc)` 查，现有 `mail_ingest_message_account_status_created_idx` 不覆盖此排序 → **新增索引 `(accountId, receivedAt desc)`**。
- **中断态**：卡在 `processing` 的行（claim 后、终态写入前 worker 中断）UI 显示「处理中/可能中断」；既有 30min stale-reclaim 会重认领重跑，重跑成功后行落到真实终态。
- **中断重跑的下游幂等缺口（既有风险，本期只暴露不修）**：若 worker 在「建 batch/池条目后、写 message 终态前」中断，stale-reclaim 重跑可能**重复建批次/关联错批次**。这是**本观测期之前就存在**的风险，本期通过「中断态显示」把它**可见化**，但**不在本期修复**（属解析入库幂等专项）。spec 明确此边界以免误以为观测层已解决幂等。
- message 行随时间增长；**保留期/清理不在一期**。量级预估：行数 ≈ 命中标题的邮件数（远小于信箱总量），单账号日均通常十~百级；短期无性能压力，但表设计需为后续清理留约束：以 `receivedAt`/`createdAt` 为清理键，且清理不能破坏正在被引用的 `batchId` 关联（清理策略留待专项）。
- 下游 JOIN 只读，不改写业务状态。
- 「无附件」写行状态是**新增行为**，不改动既有幂等（uid 唯一键）、绑定动作与解析队列逻辑。

## 测试

- **worker（`processor` / `message-filter`）**：各路径 message 行的 `status`/`skipReason`/`jdBindStatus`/`attachmentCount`/`resumeAttachmentCount`/`boundJobDescriptionId` 正确 —— 成功入队、无附件跳过（`batchId=null`）、有附件但不受支持、入队失败（`batchId` 有值、status=failed）、JD `bound/unmatched/ambiguous/fallback`（且**绑定动作未变**、`extractedJobCodes` 归一化）；重复复合键命中现有终态行 no-op 不覆盖；标题不匹配只累加 `subjectSkipped` 不建行；**本轮小结计数满足守恒等式**（含 `lastRunReceived`）。
- **DAO**：`listAccountMailMessages` **两步分页**（先 message 分页、再按 batchId 批量取附件）—— 校验父行不重复/不漏；`batchId=null` 行正确显示无展开；入池汇总态（全部入池/部分失败/全部失败）推导；`receivedAt=null` 时 `NULLS LAST, id DESC` 排序稳定；过滤（前段终态/原因/JD状态/关键词/`receivedAt`）；**org 作用域施加到 message+batch+pool 各表**。
- **route**：工作区端与平台端两个端点的权限与作用域（自助只见自己创建账号的信件、平台 `manage` 见全部）。

## 明确不做（YAGNI / 一期外）

- 聚合仪表盘 / 历史趋势统计。
- 跨账号全局搜索（按候选人姓名全局查）。
- 标题不符邮件逐封建行。
- 独立事件时间线表 / 单封信重试时间线。
- message 行保留期清理。
- 一体展示到 studio_interview 筛选/评价（改为跳转链接）。

## 与其它工作项的关系

- **本期只观测、不改行为**：`jdBindStatus`/`extractedJobCodes` 只**记录并展示**当前绑定逻辑的结果，**不改变绑定动作**（歧义是否回退、正则加前缀约束、严格化都归 **#2**，是独立后续项）。这条边界是防止 spec 悄悄扩进 #2 的关键。
- 暴露出的 `dedupPolicy` 死配置、重复堆积等问题不在本期修，仅通过日志可见。
