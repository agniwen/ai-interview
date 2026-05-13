# AI 面试列表与详情切换到「轮次（round）」视角

**Date:** 2026-05-13
**Status:** Design — pending user review

## 1. Goal

把 AI 面试列表 + 详情从「按候选人聚合」改为「按面试轮次（`studio_interview_schedule` 行）」展示，候选人信息通过 JOIN 带出。同一候选人有 N 轮就出现 N 次。同时把代码层的类型 / 模块 / DAO 命名按「管理记录（candidate）」与「面试轮次（round）」两类概念拆开。DB 表名不变。

## 2. Why

- 现状：`studio_interview` 既扛候选人身份 + 简历，又扛 status / interviewQuestions / JD 绑定。简历库刚刚（前几个 PR）把候选人侧拆出来用 `ResumeLibraryDetail`；AI 面试侧仍按候选人粒度展示，但产品语义其实关心的是「这一轮排得怎样了 / 这一轮的报告 / 这一轮的链接」。
- 新建入口已经只剩简历库的「保存并发起面试」，每次新建必然写 1 行 round —— 那 AI 面试列表的天然主键就该是 round。

## 3. Non-goals

- 不改 DB 表名（`studio_interview` / `studio_interview_schedule` 保留）
- 不做数据迁移；现有有 round 的候选人立刻出现在新列表，没 round 的候选人（早期 draft）不再出现在 AI 面试 list（语义正确：他们就还是简历库的人）
- 不把候选人 CRUD 搬到 `/studio/candidates/*` —— 候选人侧仍走 `/studio/resumes/*`（简历库已实现）
- 不删除 `studio_interview.status` 列（schema 不动；DAO 不再读写）
- 不去重列表中的同候选人多 round 行（按 scheduledAt 时间排即可）

## 4. Locked decisions

| 项 | 决议 |
|---|---|
| 列表行的 `id` | `roundId`（`studio_interview_schedule.id`）；候选人 ID 作为 `candidateId` 单独字段 |
| 列表列 | 候选人姓名 / JD 名 / 轮次（roundLabel）/ 排期时间 / round status / 是否有报告 / 是否允许文本输入 / 创建时间 / actions |
| status 过滤 | round status（`pending` / `in_progress` / `completed` / `interrupted`）|
| Summary 统计 | 按 round 统计：总轮数、已完成、进行中、待开始 |
| 详情弹窗顶部 | 新增「轮次概览」区块（roundLabel + scheduledAt + status + 链接 + allowTextInput toggle）|
| 详情 tabs | 概览 / 经历 / AI 题目 / Agent 提示词 / 表单答复 / 面试报告（数据源不变，只是按当前 round 取）|
| 详情弹窗 footer | resume 模式现状不变；interview 模式继续指向 `/studio/resumes?recordId=<candidateId>` 编辑候选人 |
| 简历库「保存并发起面试」 | 不变，仍走 POST `/studio/interviews` 创建 candidate + 默认 1 round |
| `studio_interview.status` 列 | schema 不动；保留 `src/server/routes/interview/utils.ts` 的 `archived` gate 读取（公共面试链接禁用机制依赖它）；POST `/studio/interviews` 仍写入（schema 要求，简历库传 `"ready"`）；AI 面试列表 / 详情 / 编辑都不再读写。彻底拆列是后续 PR |

## 5. Architecture

### 5.1 Code-level naming split

**`src/lib/shared/`** 重组：

- `studio-interviews.ts` 大幅瘦身，只保留**真正跨两侧共享的 schema/枚举**：
  - `studioInterviewStatusSchema` / `studioInterviewStatusMeta`（候选人侧 status，schema 可保留以备别处用，但 AI 面试不再消费）
  - `scheduleEntryStatusSchema` / `ScheduleEntryStatus` / `scheduleEntryStatusMeta`
  - `studioInterviewScheduleEntrySchema` / `studioInterviewBaseSchema` / `studioInterviewFormSchema` / `studioInterviewClientFormSchema`（POST handler 还需要）
  - `studioInterviewResumePayloadSchema`
  - `parseScheduleEntriesInput` / `parseResumePayloadInput` / `toNullableString` / `getScheduleEntryDateValue`
  - `createDefaultScheduleEntry`
  - `RECONNECT_GRACE_MS`
- **新增 `src/lib/shared/studio-candidates.ts`**：拥有候选人聚合视图
  - `interface StudioCandidateRecord`：原 `StudioInterviewRecord` 字段集合，但**去掉** `scheduleEntries` 与 `interviewLink`（这两个属于 round-级）
  - 用途：Agent 提示词构造、报告归档时取候选人快照；不直接被 AI 面试列表消费
- **新增 `src/lib/shared/studio-interview-rounds.ts`**：拥有 round 视图
  - `interface StudioInterviewRoundDetail`：单 round 字段（id/roundLabel/scheduledAt/status/allowTextInput/sortOrder/conversationId/sessionStartedAt/notes/interviewLink）+ 嵌套 `candidate: StudioCandidateRecord` 快照
  - `interface StudioInterviewRoundListRecord`：列表行精简投影 —— id（roundId）/ roundLabel / scheduledAt / status / allowTextInput / conversationId / hasReport / interviewLink / candidateId / candidateName / candidateEmail / candidatePhone / targetRole / jobDescriptionId / jobDescriptionName / resumeFileName / hasResumeFile / creatorName / creatorOrganizationName / createdAt / updatedAt
  - `interface PaginatedStudioInterviewRoundsResult`

被淘汰的旧符号（在 `studio-interviews.ts` 删除并迁移调用方）：
- `StudioInterviewRecord` → 改为 `StudioCandidateRecord`（已在 `studio-candidates.ts`）
- `StudioInterviewListRecord` → 删除（旧消费者全部切到 `StudioInterviewRoundListRecord`）
- `toStudioInterviewListRecord` → 删除

### 5.2 Server DAO split

- **`src/server/routes/studio/routes/interviews/dao/studio-interviews.ts`** 仍存在，但内容主要变为「候选人取数」工具：
  - `loadStudioCandidate(id, orgId)` —— 取 candidate row + JD + creator + scheduleEntries 数组（给 Agent 提示词、报告归档、PATCH 校验用）
  - `serializeCandidateRow(...)` / `parseScheduleRows(...)`
- **新增 `dao/interview-rounds.ts`**：
  - `queryPaginatedInterviewRounds(orgId, filters, pagination)` —— 主查询：`studio_interview_schedule` LEFT JOIN `studio_interview` LEFT JOIN `job_description` LEFT JOIN `user`(createdBy of candidate) LEFT JOIN `organization`(creator org) LEFT JOIN (interview_conversation 是否存在以填 `hasReport`)；返回 `StudioInterviewRoundListRecord[]`
  - `loadInterviewRoundDetail(roundId, orgId)` —— 单 round + candidate 快照
  - `summarizeInterviewRoundCounts(orgId)` —— 替代旧 `summarizeStudioInterviewCounts`，按 round status 聚合

旧 `queryPaginatedStudioInterviewRecords` / `loadStudioInterview` / `summarizeStudioInterviewCounts` 等候选人聚合 API 删除（被新函数取代）。

### 5.3 Routes (`src/server/routes/studio/routes/interviews/route.ts`)

URL 路径不变（`/api/w/:slug/studio/interviews/*`），但 `:id` 在大多数 handler 里改为 `roundId`：

| URL | 旧含义 | 新含义 |
|---|---|---|
| GET `/` | 候选人列表分页 | round 列表分页（来自 `queryPaginatedInterviewRounds`）|
| GET `/summary` | candidate-status 计数 | round-status 计数 |
| POST `/dedup-check` | 候选人查重（不变） | 候选人查重（不变，纯候选人字段输入，与 round 无关）|
| POST `/` | 创建 candidate + N rounds | **不变**：简历库「保存并发起面试」仍走这里；handler 内部仍写 1 行 studio_interview + N 行 studio_interview_schedule。返回结构由 `StudioInterviewRecord` 改为 `StudioInterviewRoundListRecord`（取新写入的第一轮，让简历库前端处理一致的列表行类型）|
| GET `/:id` | candidate 详情 | round 详情（含 candidate 快照）|
| GET `/:id/resume` | 候选人简历 PDF | 通过 round → candidate 取简历 PDF |
| GET `/:id/agent-instructions` | candidate-级 prompt | 通过 round → candidate 构造；候选人 + JD 信息不变；可附 round 的轮次提示（roundLabel）|
| GET `/:id/reports` | candidate 的全部 reports（多 round 汇总） | **仅本 round 的 reports**（按 scheduleEntryId 过滤）|
| GET `/:id/recordings/:conversationId` | 候选人下指定会话 | round 下指定会话（已经按 scheduleEntryId 校验过，逻辑不变）|
| GET `/:id/form-submissions` | candidate 的全部提交 | **仅本 round 的提交** |
| DELETE `/:id/form-submissions/:submissionId` | 删提交 | 不变 |
| PATCH `/:id` | candidate-级 PATCH（status / JD / notes 等，不含身份） | **改写**：round-级 PATCH（`allowTextInput` / `notes` / `scheduledAt` / round `status`）。candidate-级 PATCH 整体下线 —— 候选人字段的修改走 `/studio/resumes/:id` |
| GET `/:id/question-template-bindings` | candidate-级 | 通过 round → candidate 读取（候选人的题目模板绑定不变）|
| PUT `/:id/question-template-bindings` | candidate-级 | 同上（写也仍是候选人维度，因为 questions 是候选人级数据）|
| POST `/:id/rounds/:roundId/reset` | 嵌套路径 | **简化为** `POST /:id/reset`（`:id` = roundId）|
| PATCH `/:id/rounds/:roundId` | 嵌套调整 round | **简化为** `PATCH /:id`（已合并到上面 PATCH 描述）。原路径删除 |
| DELETE `/:id` | 删 candidate（cascade rounds）| **改写**：删 round 行（cascade reports/recordings via FK）；candidate 删除走简历库 |
| POST `/bulk-delete` | 候选人批量删除 | round 批量删除（payload 改 `roundIds`）|

> 端点签名变化清单（迁移调用方 + 客户端 typed RPC）：见 §6。

### 5.4 Client API (`src/lib/client/api/endpoints/studio-interviews.ts`)

按新签名重命名：

- `fetchStudioInterviews(slug, params)` → `fetchStudioInterviewRounds(slug, params)`，返回 `PaginatedStudioInterviewRoundsResult`
- `fetchStudioInterview(slug, id)` → `fetchStudioInterviewRound(slug, roundId)`，返回 `StudioInterviewRoundDetail`
- `updateStudioInterviewRound(slug, recordId, roundId, body)` → `updateStudioInterviewRound(slug, roundId, body)`（去掉 recordId）
- `resetStudioInterviewRound(slug, recordId, roundId)` → `resetStudioInterviewRound(slug, roundId)`
- `deleteStudioInterview` → `deleteStudioInterviewRound`
- `bulkDeleteStudioInterviews(slug, ids)` → `bulkDeleteStudioInterviewRounds(slug, roundIds)`
- `fetchStudioInterviewReports(slug, id)` → `fetchStudioInterviewRoundReports(slug, roundId)`
- `fetchStudioInterviewFormSubmissions(slug, id)` → `fetchStudioInterviewRoundFormSubmissions(slug, roundId)`

简历库侧 helper 不动（`fetchStudioResume` 等）。`fetchInterviewDedup` 不动。

### 5.5 Frontend (`src/app/(auth)/w/[slug]/studio/interviews/`)

- **`page.tsx`**（Server Component）：初始 fetch 改成调 `queryPaginatedInterviewRounds`/`summarizeInterviewRoundCounts`
- **`interview-management-page.tsx`**：
  - 表格行类型改为 `StudioInterviewRoundListRecord`
  - 列定义重写：
    - `候选人` —— `candidateName`，点击打开详情
    - `JD` —— `jobDescriptionName`
    - `轮次` —— `roundLabel` + 序号
    - `排期` —— `scheduledAt`（未排期显示「未排期」）
    - `状态` —— round `status`（用 `scheduleEntryStatusMeta`）
    - `报告` —— badge（有/无）
    - `创建于` —— `createdAt`
    - actions（查看 / 复制链接 / 重置（仅 last completed）/ 删除轮次）
  - Summary 卡片：用新 summarize 接口
  - 删除流程：单条删调 `deleteStudioInterviewRound`；批量 `bulkDeleteStudioInterviewRounds`
  - 详情弹窗触发：`recordId` 改名为 `roundId`，传 mode="interview"

- **`studio-person-detail-dialog.tsx`** mode="interview" 重塑：
  - 数据源换成 `fetchStudioInterviewRound`，得到 `StudioInterviewRoundDetail`
  - `UnifiedRecord` interview 分支：从 round + candidate 快照映射；`scheduleEntries` 字段去掉（只有当前这一轮）
  - 顶部 PageHeader 标题：候选人姓名 + roundLabel + round status badge
  - 概览 tab：移除「面试安排」list 区块；改加「轮次概览」单卡（roundLabel / scheduledAt / status / 完整面试链接 / allowTextInput 开关 / 重置轮次按钮 — 仅 last completed 时显示）
  - 其他 tab 数据源全部按 round id 取
  - footer：interview 模式继续显示「编辑候选人信息」跳转 resume 库

- **`studio-person-edit-dialog.tsx`** mode="interview" 重塑：
  - 编辑当前 round 的字段：`allowTextInput` / `notes` / `scheduledAt` / round `status`
  - 候选人身份字段不在这里编（提示用户去简历库）
  - 提交：`updateStudioInterviewRound(slug, roundId, body)`
  - 移除原本对 candidate fields 的 PATCH 路径

- **`StudioPersonDetailDialog` / `StudioPersonEditDialog` 接口**：把 `recordId` prop 改名为 `roundId`（interview 模式）/ `recordId` 保留（resume 模式）。或者统一为 `targetId` + mode 区分。**Spec 推荐**保留 prop 名 `recordId`（结构对称，由 mode 决定含义）以减少 churn；只在内部按 mode 解析含义。

- **`ResumeLibraryPage`**：调用 detail 弹窗的地方传 `recordId=candidateId, mode="resume"` 不变。「发起 AI 面试」按钮当前 push 到 `/studio/interviews?recordId=<candidateId>` —— 这个 deep-link 失效（candidate 不再有 1:1 round）。**改为**仅 push 到 `/studio/interviews`（去掉 query 参数；列表会按 scheduledAt 默认排，最新的轮次自然靠前）。

### 5.6 简历库的 detail 弹窗 footer 中的「发起 AI 面试」

`studio-person-detail-dialog.tsx` resume 模式 footer 现在是「发起 AI 面试」按钮：

```tsx
router.push(`/w/${slug}/studio/interviews?recordId=${record.id}`);
```

这个跳转的 query 参数原本期望列表页 detail 自动 open。本设计后 list 是 round-keyed，`recordId=candidateId` 不再能匹配某行。**改动**：

- 移除 query 参数 `?recordId=...`，按钮 push 到 `/studio/interviews` 列表（用户自行点想看的那轮）
- 或者更友好：使用 `?candidateId=...` query，list 页 mount 时按 candidateId 过滤当前 candidate 的所有 round
- **本次实现选**：移除 query 参数（YAGNI）。后续可加 candidateId filter。

## 6. API 迁移清单（前端要同步改）

| 旧 | 新 |
|---|---|
| `fetchStudioInterviews` returns `StudioInterviewListRecord[]` | `fetchStudioInterviewRounds` returns `StudioInterviewRoundListRecord[]` |
| `fetchStudioInterview(id)` returns `StudioInterviewRecord` (with scheduleEntries[]) | `fetchStudioInterviewRound(roundId)` returns `StudioInterviewRoundDetail` (round + candidate snapshot) |
| `updateStudioInterviewRound(slug, recordId, roundId, body)` | `updateStudioInterviewRound(slug, roundId, body)` |
| `resetStudioInterviewRound(slug, recordId, roundId)` | `resetStudioInterviewRound(slug, roundId)` |
| `deleteStudioInterview(slug, candidateId)` | `deleteStudioInterviewRound(slug, roundId)` |
| `bulkDeleteStudioInterviews(slug, candidateIds)` | `bulkDeleteStudioInterviewRounds(slug, roundIds)` |
| `fetchStudioInterviewReports(slug, candidateId)` | `fetchStudioInterviewRoundReports(slug, roundId)` |
| `fetchStudioInterviewFormSubmissions(slug, candidateId)` | `fetchStudioInterviewRoundFormSubmissions(slug, roundId)` |

## 7. Tests

- `dao/interview-rounds.test.ts`（新）：
  - 同 candidate 多 round 各自一行
  - hasReport / conversationId 字段映射正确
  - org scope 隔离
- `dao/studio-interviews.test.ts`（瘦身）：保留 `loadStudioCandidate` 行为测试
- `routes/interviews/__tests__/patch-whitelist.test.ts`：改写为 PATCH `/:id` 现在是 round-level；assert 不允许写 candidate 字段
- 新增 `routes/interviews/__tests__/round-detail.test.ts`：load by roundId 返回 candidate snapshot + 仅本 round 的 reports/forms
- AI 面试列表测试（如有）：转 round-keyed
- 简历库 POST 测试 (`route-resume-payload.test.ts`)：返回结构改成 `StudioInterviewRoundListRecord`，调整 assertion

## 8. Migration & rollout

- 单 PR 合入
- 无 DB migration
- 简历库「保存并发起面试」流程 onCreated 回调拿到的对象类型从 `StudioInterviewRecord` 改为 `StudioInterviewRoundListRecord` —— 影响 `resume-library-page.tsx` 的 `handleResumeRecordCreated`。该 handler 只调 `invalidateAll()`，无字段访问，类型 swap 安全。
- 旧 `recordId` 在 URL query 中的 deep-link（如 `/studio/interviews?recordId=...`）会失效（无人能匹配）—— 调用方就 `studio-person-detail-dialog.tsx` resume footer 那一处，本次同步改

## 9. Risks

1. **同候选人多 round 在列表里的阅读体验**：行多了。本次先按 scheduledAt desc 排即可，未来要做候选人合并视图再说。
2. **`studio_interview.status` 列变成半幽灵字段**：POST 写入 + interview resolver 的 archived gate 读取这两条路径保留；AI 面试侧（list/detail/edit）不再消费。明确写在 §4 决策表，避免后续误删。
3. **类型重命名 churn**：影响面包括 client、frontend dialog props、server DTO；分 task 增量改，每个 task 后跑 typecheck 防漏。

## 10. Open items

- `StudioPersonDetailDialog` 的 `recordId` prop 是否真的不改名 —— 推荐不改（mode 区分含义），但你要改也可以
- AI 面试列表的批量操作除了删除，是否需要「批量重置」「批量复制链接」？本次不实现
