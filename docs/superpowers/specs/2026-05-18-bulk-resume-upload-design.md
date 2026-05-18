# 简历库 — 批量上传 (Bulk Resume Upload) — Design

Status: Draft 2026-05-18
Owner: allen

## Goal

在简历库页面增加「批量上传」入口：用户一次选最多 100 份 PDF（每份 ≤ 20MB），
确认配置后由浏览器驱动逐份解析、查重、入库；进度持久化到数据库，关闭浏览器
后再次进入简历库可看到未完成批次并从中断处继续。

隔离粒度：**租户 + 用户**（`organizationId + createdBy`）。

Out of scope：

- 后台 worker（关浏览器后继续跑）—— 已显式排除
- 取消时回滚已入库记录
- 失败项自动重试（用户在 UI 手动重试）
- 批量发起面试 / 批量出题（批量入库只走"入库"，不出题）
- 通知 / 邮件 / 飞书提醒

## 决策摘要（来自 brainstorming）

| 维度         | 选择                                                           |
| ------------ | -------------------------------------------------------------- |
| 持久化语义   | 断点续传：item 行进 DB，关浏览器即暂停，下次回来手动继续       |
| 失败策略     | 跳过并继续（item 标 failed，循环不断）                         |
| JD 关联      | 确认 dialog 三选一：绑定到某 JD / 自动匹配 / 不绑定            |
| 查重策略     | 确认 dialog 全局开关：跳过 / 照样创建                          |
| 同用户并发   | 同一时间只能有一个活跃批次（DB 唯一约束兜底）                  |
| 取消语义     | 停在当前进度，已入库记录保留                                   |
| 列表刷新     | 每入库一份就 invalidate（节流 600ms）                          |
| 容量         | 单批 ≤ 100 份；单份 ≤ 20MB（与现有 `validateResumeFile` 一致） |
| 双标签页     | 不做产品级互斥；DB 锁保证不数据错，UI 一致由用户保证           |
| 孤儿复活阈值 | `processing` 状态 > 60s 视为孤儿，复活成 `pending`             |

## Data Model

新增两张表，迁移走 `pnpm db:generate`。

### `resume_upload_batch`

| 列                                        | 类型                                                 | 说明                                                     |
| ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| `id`                                      | text PK                                              | UUID                                                     |
| `organizationId`                          | text FK→organization on delete cascade               | 租户隔离                                                 |
| `createdBy`                               | text FK→user on delete cascade                       | 用户隔离                                                 |
| `status`                                  | text NOT NULL                                        | `pending` / `running` / `completed` / `cancelled`        |
| `jdMode`                                  | text NOT NULL                                        | `bind` / `auto` / `none`                                 |
| `jobDescriptionId`                        | text FK→job_description on delete set null, nullable | `jdMode=bind` 时非空                                     |
| `dedupPolicy`                             | text NOT NULL                                        | `skip` / `create`                                        |
| `totalCount`                              | int NOT NULL                                         | items 总数                                               |
| `processedCount`                          | int NOT NULL default 0                               | succeeded + failed + duplicate_skipped（不含 cancelled） |
| `succeededCount`                          | int NOT NULL default 0                               |                                                          |
| `failedCount`                             | int NOT NULL default 0                               |                                                          |
| `skippedCount`                            | int NOT NULL default 0                               | duplicate_skipped 累计                                   |
| `createdAt` / `updatedAt` / `completedAt` | timestamp                                            | `completedAt` 在 completed/cancelled 时写                |

**索引**：

- `(organizationId, createdBy, status)` —— 列表查询
- `(organizationId, createdBy, createdAt desc)` —— banner 取最新活跃
- **Partial unique** `ON (organizationId, createdBy) WHERE status IN ('pending','running')`
  —— 数据库层强制单用户单活跃批次

### `resume_upload_batch_item`

| 列                         | 类型                                                  | 说明                                                                                  |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `id`                       | text PK                                               | UUID                                                                                  |
| `batchId`                  | text FK→resume_upload_batch on delete cascade         |                                                                                       |
| `organizationId`           | text NOT NULL                                         | 冗余，方便走索引                                                                      |
| `orderIndex`               | int NOT NULL                                          | 用户选文件顺序，处理顺序                                                              |
| `originalFileName`         | text NOT NULL                                         |                                                                                       |
| `fileSize`                 | int NOT NULL                                          | 字节                                                                                  |
| `storageKey`               | text NOT NULL                                         | S3 key                                                                                |
| `status`                   | text NOT NULL                                         | `pending` / `processing` / `succeeded` / `failed` / `duplicate_skipped` / `cancelled` |
| `resumeRecordId`           | text FK→studio_interview on delete set null, nullable | 成功后回填                                                                            |
| `errorMessage`             | text, nullable                                        | 失败原因，截断 500 字                                                                 |
| `dedupMatchSnapshot`       | jsonb, nullable                                       | 查重命中时存简版                                                                      |
| `startedAt` / `finishedAt` | timestamp, nullable                                   |                                                                                       |

**索引**：

- `(batchId, orderIndex)` —— 顺序取 pending
- `(batchId, status)` —— 复活孤儿 / 计数核对

### 级联与隔离

- 删 batch → cascade 删 items，**不**动 `studio_interview`（保留已入库）
- 删 organization → cascade 删 batch（连带 items）
- 删 user → cascade 删 batch（用户被删，他的批次也无意义）
- 所有查询永远带 `organizationId = activeOrg.id AND createdBy = user.id`
- S3 key 前缀：`resume/bulk-upload-batches/{organizationId}/{userId}/{batchTempUuid}/{itemUuid}.pdf`
  确认 batch 时校验所有上传返回的 key 必须以本租户 + 本用户为前缀

## Backend

新路由文件夹：`src/server/routes/studio/routes/resume-upload-batches/`

```
resume-upload-batches/
├── route.ts
├── schema.ts
├── dao/
│   └── batches.ts
├── utils/
│   └── processor.ts        # process-next 的主体逻辑
└── __tests__/
    ├── batches.dao.test.ts
    ├── route.test.ts
    └── processor.test.ts
```

挂载到 `src/server/routes/studio/route.ts` 的 `/resume-upload-batches`。整个 router
内 `.use(requirePermission("resume", "create"))`，删除端点叠加 `delete` 权限。

### 端点

| 方法     | 路径                | 用途                                                                                                                                                                            |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/uploads`          | 单文件 multipart 上传。校验 PDF + 20MB。写 S3 到 `bulk-upload-batches/{org}/{user}/{tmpBatch}/{item}.pdf`。返回 `{ storageKey, originalFileName, fileSize }`。前端并发调 N 次。 |
| `POST`   | `/`                 | 用 N 个 storageKey + 配置创建 batch。事务内：检查活跃批次（捕获唯一约束）→ 插 batch（pending）→ 批量插 items（pending）。返回 batch + items。409 `已有进行中的批次`。           |
| `GET`    | `/`                 | 列当前用户在当前租户的批次，按 createdAt desc，limit 20。                                                                                                                       |
| `GET`    | `/active`           | 返回当前用户当前租户的活跃批次（status ∈ {pending, running}）及 items；没有返 200 + `null`。                                                                                    |
| `GET`    | `/:id`              | 单批次详情（含 items），404 不存在或非本人。                                                                                                                                    |
| `POST`   | `/:id/process-next` | **核心**。取 batch 内最小 orderIndex 的 pending item，跑解析+JD+查重+入库，返回 `{ item, batch, done: boolean }`。                                                              |
| `POST`   | `/:id/resume`       | 复活孤儿：`processing` 且 `startedAt < now() - interval '60 seconds'` 的 item 设回 pending，batch.status `running` → `pending`。返回更新后的 batch + items。                    |
| `POST`   | `/:id/cancel`       | batch 设 cancelled，`pending` / `processing` items 设 cancelled。**不动**已 succeeded / failed / duplicate_skipped 项与 `studio_interview` 行。                                 |
| `DELETE` | `/:id`              | 删批次（cascade items），仅当 batch.status ∈ {completed, cancelled}。需 `delete` 权限。                                                                                         |

### `process-next` 行为

事务内：

1. `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` 拿该 batch `status='pending'` 且最小 `orderIndex` 的 item。
   - 没拿到：检查是否还有 processing 项 → 有则返 `{ done: false, item: null, batch }` 让前端走 resume；
     都跑完则把 batch.status → `completed`、写 `completedAt`，返 `{ done: true, batch }`。
2. 把 item 标 `processing` + `startedAt = now()`，batch.status 若是 `pending` 推到 `running`。
3. **离开事务**，从 S3 拉 PDF（`getObjectStream(item.storageKey)`），调
   `parseResumeFastToProfile`。
4. 按 `batch.jdMode` 处理：
   - `bind` → 直接用 `batch.jobDescriptionId`
   - `auto` → 调现有 JD 匹配 agent
   - `none` → 不关联
5. 按 `batch.dedupPolicy` + `queryInterviewDedup` 处理：
   - 命中且 `skip` → 进入"标 duplicate_skipped"分支（不创建 studio_interview）
   - 命中且 `create`，或未命中 → 进入"创建"分支
6. **创建分支**：调抽出的 `createResumeRecordFromStorage(...)`（从现有
   `resumeLibraryRouter.post("/")` 抽核心装配代码到 `src/server/routes/studio/routes/resumes/utils/create-from-storage.ts`，POST 路由 refactor 成调它，避免代码分叉）。
7. 回写事务：
   - 创建分支成功 → item.status=`succeeded`, `resumeRecordId`, `finishedAt`
   - duplicate_skipped → item.status=`duplicate_skipped`, `dedupMatchSnapshot`, `finishedAt`
   - 创建分支抛错 → item.status=`failed`, `errorMessage` 截断 500 字, `finishedAt`
   - 更新 batch.{processedCount, succeededCount, failedCount, skippedCount}
   - 若 `processedCount === totalCount` → status=`completed`, `completedAt`
8. `invalidateStudioInterviewCaches(activeOrg.id)`。
9. 返 `{ item, batch, done: (processedCount === totalCount) }`。

并发保护：

- 多 tab 同时调 `process-next`：`FOR UPDATE SKIP LOCKED` 让第二个 tab 拿到下一条。
- 同一 item 不会被两个事务同时处理（行锁）。
- batch 活跃约束已由 partial unique index 保证创建期不重复。

### `/uploads` 校验

- `validateResumeFile`（PDF + 20MB）
- 文件名做基本 sanitize（去除控制字符），但保留原扩展名
- 单租户单用户对同一 `tmpBatchUuid` 不做软限制；客户端拿 UUID 后调用 `/`
  时如果不创建 batch，那些 S3 对象就成为孤儿（暂不清理，与现有简历库行为一致）

### `POST /` 校验

- `items.length ∈ [1, 100]`
- 每个 storageKey 必须以 `resume/bulk-upload-batches/{activeOrg.id}/{user.id}/` 开头
- `jdMode='bind'` 必须 `jobDescriptionId` 非空且属于本租户（查 `jobDescription`
  表 `WHERE id = ? AND organizationId = activeOrg.id`）
- `dedupPolicy ∈ {skip, create}`
- 唯一约束冲突 → 409 `{ error: "已有进行中的批次", activeBatchId }`

### `POST /:id/resume`

- 仅本租户本用户的 batch
- 只处理 `processing` 且 `startedAt < now() - interval '60 seconds'` 的 items（纯
  DB 时间表达式，不依赖应用时钟）
- batch.status `running` → `pending`

## Frontend

### 文件

```
src/app/(auth)/w/[slug]/studio/resumes/_components/
├── bulk-upload-button.tsx
├── bulk-upload-confirm-dialog.tsx
├── bulk-upload-progress-dialog.tsx
├── active-batch-banner.tsx
└── use-bulk-upload.ts
```

简历库工具栏并排放「新建简历记录」+「批量上传」两个按钮（不合并下拉）。

### 用户旅程

```
[简历库页]
   │
   ├─ 顶部 banner：GET /active 命中时渲染
   │      ├─ 「查看进度」→ 打开 progress dialog（resume 流程）
   │      └─ 「放弃此批次」→ confirm → POST /:id/cancel
   │
   └─ 工具栏：「批量上传」按钮（active batch 存在时 disabled + tooltip）
          │
          ▼ 选文件 <input type=file multiple accept=".pdf">
          │ 前端校验：每份 ≤ 20MB / PDF / 总数 ≤ 100
          │
          ▼ confirm dialog
          │   - 文件清单（单条移除，至少 1 份）
          │   - JD 模式 RadioGroup（绑定 / 自动匹配 / 不绑定）
          │     · 绑定 → 下方出现 JD Combobox 必填
          │   - 查重策略 RadioGroup（跳过 / 照样创建）
          │   - 「开始上传」按钮
          │
          ▼ 阶段 1：并发度 4 上传到 S3 经 POST /uploads
          │   - 单条失败 → 清单标红 + toast，可移除/重试
          │   - 全部成功 → POST /resume-upload-batches 建 batch
          │   - 409 → 提示 + 跳转那个批次的 progress dialog
          │   - 关 confirm dialog，打开 progress dialog
          │
          ▼ 阶段 2：串行循环
          │   while (!done) {
          │     const res = await POST /:id/process-next
          │     setItemState(res.item)
          │     setBatchCounters(res.batch)
          │     invalidateStudioResumes()  // 节流 600ms
          │     if (res.done) break
          │   }
          │
          ▼ 完成：dialog 顶部出现「成功 X / 失败 Y / 重复 Z」汇总条
              失败项一行有「查看错误」+「重试此项」
```

### 「继续未完成批次」

1. 简历库页 mount → `useQuery(['active-batch'])` → `GET /active`
2. 命中 → 渲染 banner（X/N 进度、最后更新时间、继续/放弃按钮）
3. 「继续」：先 `POST /:id/resume`（复活孤儿）→ 打开 progress dialog → 进入
   process-next 循环

### `use-bulk-upload.ts`

```ts
type Phase =
  | "idle"
  | "selecting"
  | "uploading"
  | "processing"
  | "paused" // 网络中断时
  | "completed"
  | "cancelled";

interface BulkUploadState {
  phase: Phase;
  batch: ResumeUploadBatch | null;
  items: ResumeUploadBatchItem[];
  uploadProgress: Record<string, "pending" | "uploaded" | "failed">;
  start: (files: File[], config: BatchConfig) => Promise<void>;
  resume: (batchId: string) => Promise<void>;
  cancel: () => Promise<void>;
  retryItem: (itemId: string) => Promise<void>;
  abort: () => void; // 只停前端循环，不动后端（关 dialog ≠ 取消）
}
```

`abort()` 把 phase 切到 `paused`，不调任何后端 API；用户下次进入简历库
banner 接管。`cancel()` 才调 `POST /:id/cancel`。

### 列表刷新节流

每完成一份调 `queryClient.invalidateQueries(['studio-resumes'])`，但用 ref +
`setTimeout` 节流，至少 600ms 一次。

### 与现有单份上传

两条路径并存，互不替换。批量场景不在上传时出题（与单份 POST 同源代码路径，
本来就不出题）；不提供「保存并发起面试」（批量只入库）。

## 错误矩阵

| 失败点                          | 行为                                                      |
| ------------------------------- | --------------------------------------------------------- |
| 阶段 1 S3 上传失败              | 该文件清单标红 + toast；可移除或重试                      |
| 阶段 1 建 batch 时 409          | 提示 + 跳转活跃批次的 progress dialog                     |
| `process-next` 解析/JD/OCR 报错 | item.status=failed, errorMessage 截断 500，循环继续       |
| `process-next` 期间事务失败     | rollback；item 留 `processing`；下次 resume 复活          |
| 循环网络中断                    | phase=`paused`，UI 出「继续」按钮，点 → 再调 process-next |
| 用户关浏览器                    | 同上；下次进入简历库由 banner 接管                        |
| 用户点 dialog 关闭              | abort，不取消；banner 后续接管                            |
| 用户点 cancel                   | cancel API，未处理 items 标 cancelled，已入库保留         |

## 权限

- 创建 / 查看 / process-next / resume / cancel：`requirePermission("resume", "create")`
- 列表 GET：`requirePermission("resume", "read")`
- DELETE：`requirePermission("resume", "delete")`

权限是组织级，但所有查询都额外用 `createdBy = user.id` 二次过滤——有 read
权限的用户依然看不到他人的批次。

## 测试

### Backend (Vitest + 真 PG)

`src/server/routes/studio/routes/resume-upload-batches/__tests__/`

**`batches.dao.test.ts`** — DAO 单元

- 创建 batch + items，按 orderIndex 取下一份 pending
- `claimNextPendingItem` 的 `FOR UPDATE SKIP LOCKED`：两个并发事务取同一 batch 时只一个拿到行
- 复活孤儿：startedAt 早于 60s 设回 pending，新鲜的不动
- 唯一约束：同 user+org 已有 running batch 时第二个抛冲突
- 租户隔离 + 用户隔离：B 看不到 A 的 batch

**`route.test.ts`** — HTTP

- `POST /uploads`：非 PDF 拒 / >20MB 拒 / 成功返回带组织+用户前缀的 storageKey
- `POST /`：100 份上限 / `jdMode=bind` 缺 JD 拒 / 跨租户 storageKey 拒 / 活跃批次冲突 409
- `POST /:id/process-next`：
  - pending → succeeded（断言 studio_interview 创建、resumeRecordId 回填、counter +1）
  - `dedupPolicy=skip` 命中 → `duplicate_skipped`（断言**不**创建 studio_interview）
  - `dedupPolicy=create` 命中 → succeeded（断言创建）
  - `jdMode=bind` → studio_interview.jobDescriptionId 取自 batch
  - `jdMode=auto` → 调 JD agent（mock 返回固定 id）
  - 解析抛错 → item failed，循环可继续
  - 最后一份 → `{ done: true }`，batch.status=completed
  - 跨用户/跨租户 → 404
- `POST /:id/resume`：60s 内 processing 不动，超期设回 pending
- `POST /:id/cancel`：未处理 → cancelled，已 succeeded 不动，studio_interview 保留
- `DELETE /:id`：仅 completed/cancelled，cascade items，不删 studio_interview

**`processor.test.ts`** — `createResumeRecordFromStorage` 抽出函数

- 字段映射 (resumeProfile → candidateName/phone/targetRole) 与原 POST 一致
- 现有 `studio/resumes` POST 测试不回归

### Frontend (RTL)

`src/app/(auth)/w/[slug]/studio/resumes/_components/__tests__/`

- `use-bulk-upload.test.ts`：phase 流转、单项失败不中断、`abort()` vs `cancel()`
  语义、`retryItem()` 重置后再 process-next
- `bulk-upload-confirm-dialog.test.tsx`：`jdMode=bind` 时 JD 必填校验、文件清单
  移除至少留 1 份、>100 份禁用开始
- `active-batch-banner.test.tsx`：active 时渲染、继续按钮调 resume + 打开 progress

### Smoke checklist（手测）

1. 选 3 份 PDF，jdMode=bind + 跳过重复 → 全部成功，列表实时刷新
2. 选 3 份混合（image PDF / 正常 / 重复邮箱） → 1 跳过 / 1 succeeded / 1 succeeded
3. 处理到第 2 份时刷新页面 → banner 出现 → 继续 → 接着跑
4. 处理中点取消 → 已入库保留，未跑标 cancelled
5. 两 tab 同时打开同一 batch 的 progress dialog → 不数据错（断言计数不超 totalCount）

### 不写的测试

- S3 实际 PUT/GET 集成（mock client）
- Drizzle migration smoke（CI 跑 `pnpm db:migrate`）
- 视觉回归（项目无此栈）
- 双 tab UI 一致性（仅断数据正确）

## YAGNI 排除清单（显式记录，避免后续 scope creep）

- ❌ 取消时回滚已入库
- ❌ 失败项自动重试 / `attempts` 字段
- ❌ 跨会话推送通知（push / email / 飞书）
- ❌ 进度 SSE / WebSocket（单 tab 自驱循环够用）
- ❌ S3 孤儿清理 cron（与现有简历库一致）
- ❌ 全后台 worker
- ❌ 同用户多批次并行
- ❌ 批次级别"批量发起面试"
- ❌ 批量场景的"保存并发起面试"
- ❌ 双标签页应用层互斥

## 风险与缓解

| 风险                                                   | 缓解                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 100 份 × 解析 + 入库 × LLM 调用费用激增                | jdMode 默认推荐用 `bind`（不跑 JD 自动匹配 agent）；UI 在 confirm dialog 上提示 "自动匹配会逐份调模型" |
| 长批次浏览器开着撑久                                   | 浏览器驱动天然限制——用户会关；banner 是设计补丁                                                        |
| 大量 invalidateQueries 抖动列表                        | 600ms 节流                                                                                             |
| 双 tab 计数对不上                                      | DB 计数事务内更新，不会超过 totalCount；UI 不一致由用户自己看                                          |
| 60s 孤儿阈值误杀活跃 tab 的 processing                 | 单 tab 的 process-next 在 <60s 内就会返回更新 item；只有真正崩溃的 tab 才会到 60s                      |
| `processedCount` / `totalCount` 与实际 item 状态对不上 | 测试覆盖 cancel / failed / duplicate_skipped 三类对 counter 的贡献                                     |
