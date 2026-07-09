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
        │  batchId 外键 → batch item → pool item（解析/入池状态）
        ▼
后端 GET /studio/mail-ingest-accounts/:id/messages（DAO JOIN 下游 + 过滤 + 作用域）
        ▼
前端 账号页下钻「信件日志」抽屉/子页（列表 + 筛选 + 下游跳转链接）
        +
mail_ingest_account 上轮小结计数（含「标题不符跳过 N 封」）
```

## 组件设计

### 1. 数据模型：`mail_ingest_message` 加列

现有列：`id, accountId, batchId(FK→resume_upload_batch, set null), createdAt, errorMessage, fromAddress, mailbox, messageId, processedAt, receivedAt, status<MailIngestMessageStatus>, subject, uid, uidValidity`。

新增列（全部 nullable，兼容存量）：

- `skipReason: text` —— `status=skipped` 时的原因枚举：`no_supported_attachment` | `already_processed`。
- `jdBindStatus: text` —— `bound` | `unmatched` | `ambiguous` | `fallback`。
- `boundJobDescriptionId: text`（FK→job_description, set null）—— 实际绑定的岗位。
- `extractedJobCodes: jsonb` —— 从标题抽到的候选码数组（便于 #2 排查）。
- `resumeAttachmentCount: integer` —— 受支持的简历附件数。

去重/解析/入池状态**不进 message 行**：由 UI 经 `batchId → resume_upload_batch_item → resume_pool_item`（`resumeParseStatus`/`resumeParseError`）与疑似重复表 JOIN 得到。message 行只负责「入库前段」。

### 2. 采集点改造（`apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts`）

命中标题关键词、且通过 `listenStart`、被 `claimMailIngestMessageForProcessing` 认领的邮件 —— 一律建行，按路径写终态：

| 路径                     | status    | 附加字段                                                                              |
| ------------------------ | --------- | ------------------------------------------------------------------------------------- |
| 成功交接队列             | `queued`  | `resumeAttachmentCount`、`jdBindStatus`、`boundJobDescriptionId`、`extractedJobCodes` |
| 无受支持附件             | `skipped` | `skipReason=no_supported_attachment`（当前只加计数、行状态未落实，需补）              |
| 已处理过（幂等命中终态） | `skipped` | `skipReason=already_processed`                                                        |
| 入队失败                 | `failed`  | `errorMessage`                                                                        |

- `resolveMailJobBinding` 里把绑定判定写回 message：抽到码 `fetchJobDescriptionsByCodes` 命中 0→`unmatched`、1→`bound`、≥2→`ambiguous`（不静默回退）；用账号默认 JD→`fallback`。
- **`listenStart` 之前的旧邮件仍只计数不建行**（有意忽略的历史邮件）。
- **标题不匹配的邮件仍不建行**，改为 `subjectSkipped++` 计入本轮小结（见 §3）。

### 3. 计数：`mail_ingest_account` 上轮小结

给账号加列（在 `finishMailIngestAccountRun` 写）：`lastRunSubjectSkipped` | `lastRunMatched` | `lastRunQueued` | `lastRunFailed`（均 integer，默认 0）。

用途：账号页头部展示「上轮：收 X · 标题不符跳过 Y · 入队 Z · 失败 W」，让「关键词配太窄」可被发现。是**上轮快照**，非历史累计。

### 4. UI：账号页下钻「信件日志」

- 位置：现有邮箱账号页（工作区 `/w/:slug/studio/mail-ingest-accounts` 与平台 `/platform/mail-ingest-accounts`）每账号行 →「查看日志」→ 抽屉/子页。
- 列：收件时间 · 发件人 · 标题 · 附件数 · JD绑定（状态 + 岗位名）· 终态（`queued` | `skipped`+原因 | `failed`+错误）· 解析·入池状态（下游 JOIN）· →跳转（池条目 / 简历详情）。
- 筛选：终态、`skipReason`、`jdBindStatus`、标题/发件人关键词、时间范围。
- 账号头部：§3 的上轮小结计数。
- 后端：新增 `GET /studio/mail-ingest-accounts/:id/messages?<filters>`，DAO 分页 + JOIN 下游（batch item → pool item）状态；权限沿用 `mailIngestAccount` read 与作用域（自助看自己账号、平台管理员看全部）。

### 5. 错误处理 / 边界

- 存量 message 行新列为空 → UI 显示「—」。
- message 行随时间增长；已有索引 `mail_ingest_message_account_status_created_idx` 支撑列表/过滤；**保留期/清理不在一期**。
- 下游 JOIN 只读，不改写业务状态。
- 「无附件/已处理」写行状态是**新增行为**，不改动既有幂等（uid 唯一键）与解析队列逻辑。

## 测试

- **worker（`processor` / `message-filter`）**：各路径 message 行的 `status`/`skipReason`/`jdBindStatus`/`resumeAttachmentCount` 正确 —— 成功入队、无附件、已处理、入队失败、JD `bound/unmatched/ambiguous/fallback`；标题不匹配只累加 `subjectSkipped` 不建行；本轮小结计数写回。
- **DAO**：`listAccountMailMessages` JOIN 下游状态、过滤（终态/原因/JD状态/关键词/时间）、分页、作用域。
- **route**：权限与作用域（自助只见自己账号的信件，平台管理员见全部）。

## 明确不做（YAGNI / 一期外）

- 聚合仪表盘 / 历史趋势统计。
- 跨账号全局搜索（按候选人姓名全局查）。
- 标题不符邮件逐封建行。
- 独立事件时间线表 / 单封信重试时间线。
- message 行保留期清理。
- 一体展示到 studio_interview 筛选/评价（改为跳转链接）。

## 与其它工作项的关系

- 顺带交付 **#2 JD 编码验证** 的「可观测」部分（`jdBindStatus`/`extractedJobCodes`/歧义显式化）；#2 剩余的「正则参数化 + 严格前缀」是独立后续项。
- 暴露出的 `dedupPolicy` 死配置、重复堆积等问题不在本期修，仅通过日志可见。
