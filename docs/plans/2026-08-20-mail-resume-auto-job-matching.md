# 邮件简历自动选岗与招聘台评价衔接 Implementation Plan

> 日期：2026-08-20
> 状态：已实施
> 范围：新邮件简历进入人才库后的自动选岗、候选记录、HR 改绑，以及创建招聘记录后的既有评价调度衔接

## Goal

让上线后新收到的邮件简历在解析并进入人才库后，自动从当前发布岗位中选择并绑定 Top1，同时保存完整候选排序；HR 可以直接改绑且不需要填写原因。人才库阶段不触发正式 AI 评价，只有创建招聘记录并携带岗位后，才沿用现有招聘台评价调度。

## Architecture

新增一个深的“邮件简历自动选岗”模块，外部只暴露自动匹配绑定、读取最近匹配结果和 HR 改绑三个接口。模块内部依次处理邮件主题岗位编码、文件名岗位名称精准匹配、简历目标岗位强候选、无硬门槛向量召回、AI 精排、降级、候选持久化和并发保护。

`resume_pool_item.jobDescriptionId` 继续作为当前有效绑定；新增匹配运行和候选表保存算法过程；`resume_pool_event` 继续作为绑定历史和 HR 反馈事件账本。正式评价仍由人才库 `import` 创建 `studioInterview` 后的现有队列入口统一触发。

## Tech Stack

- TypeScript
- Drizzle ORM + PostgreSQL
- Hono
- BullMQ/现有简历解析与评价队列
- Qdrant + 现有三段式语义向量
- Mastra 结构化 AI 输出
- React 19 + TanStack Query
- Vitest

---

## 1. 已确认的业务合同

### 1.1 适用范围

- 只处理上线后新收到的邮件简历。
- 邮件简历默认进入 `resume_pool`。
- 不扫描、不回填、不重新匹配历史人才库记录。
- 不修改历史批次的 `jdMode`、历史岗位绑定和历史评价结果。
- 手工上传、内推和直接导入招聘台的既有模式不因本功能改变。

### 1.2 自动选岗顺序

```text
邮件主题岗位编码唯一精准命中（直接绑定）
  → 文件名岗位名称唯一精准命中（直接绑定）
  → 主题多命中 + 简历目标岗位 + 文件名岗位 + 向量召回（无 55 分硬门槛）
  → AI 精排
  → 绑定 Top1
```

### 1.3 候选岗位范围

只允许选择：

- 与简历属于同一组织；
- `lifecycleStatus = published`；
- 当前仍然存在的岗位。

草稿、停招、归档、已删除和其他组织的岗位不得进入候选或最终绑定。

### 1.4 Top1 绑定规则

- AI 匹配分只用于排序、解释和后续分析，不作为绑定门槛。
- AI 正常返回时，无论 Top1 分数高低，都绑定 Top1。
- AI 失败但存在向量候选时，降级绑定向量 Top1。
- 所有技术路径都失败时，不按字母顺序或创建时间随意绑定，任务进入可重试失败状态。
- 没有任何发布岗位时，记录 `no_candidates`，保持未绑定。

### 1.5 HR 改绑规则

- HR 可以从岗位 A 直接改为岗位 B。
- 不要求填写改绑原因。
- 必须记录操作人、原岗位、新岗位、对应匹配运行和候选排名。
- 改绑到相同岗位视为幂等成功，不重复写事件。
- HR 改绑不重新运行 AI，也不在人才库阶段触发正式评价。

### 1.6 评价调度边界

| 阶段                         | 自动选岗     | 正式 AI 评价 |
| ---------------------------- | ------------ | ------------ |
| 邮件收到                     | 否           | 否           |
| 简历解析完成并进入人才库     | 是           | 否           |
| HR 在人才库改绑              | 只改当前绑定 | 否           |
| 创建招聘记录并携带岗位       | 不重新选岗   | 是           |
| 创建招聘记录但选择不关联岗位 | 否           | 否           |

人才库现有 legacy JD 的 `notes` 分析可保持原行为，但它不是正式评价，失败不得影响选岗绑定结果。结构化岗位继续保持人才库阶段不生成该 legacy 文本。

---

## 2. 最终数据流

```text
IMAP 收到新邮件
  → 校验主题和附件
  → 解析主题岗位编码
  → 创建 resume_upload_batch
  → 解析简历
  → resume_pool_item 进入 ready
  → matchAndBindNewMailResume
      ├─ 主题编码唯一命中：直接选择
      ├─ 文件名岗位唯一精准命中：直接选择
      └─ 主题多命中、目标岗位、文件名和向量召回合并 → AI 精排
  → 保存 match run + candidates
  → 条件绑定 resume_pool_item.jobDescriptionId
  → 写 resume_pool_event
  → 人才库展示当前岗位和候选列表
  → HR 可改绑
  → 创建招聘记录对话框自动带入当前岗位
  → 创建 studioInterview
  → 现有正式评价队列按最终岗位入队
```

---

## 3. 数据设计

### 3.1 保留当前有效绑定

继续使用：

```text
resume_pool_item.job_description_id
```

该字段只表示“当前生效岗位”，不承担候选排序和历史审计职责。

新增 `resume_upload_batch.job_match_requested_at` 作为版本上线后的新邮件批次门禁：

- 只有邮件 worker 新建批次时写入；
- 列保持 nullable 且迁移不设置默认值、不回填；
- 历史邮件、历史批次和普通批量上传均为 null，不进入新自动选岗链路；
- 即使部署时仍有历史队列任务待消费，也不能修改历史岗位绑定。

### 3.2 新增 `resume_job_match_run`

建议字段：

| 字段                          | 类型/约束             | 含义                                                   |
| ----------------------------- | --------------------- | ------------------------------------------------------ |
| `id`                          | text PK               | 匹配运行 ID                                            |
| `organization_id`             | FK, not null          | 组织                                                   |
| `pool_item_id`                | FK, not null          | 人才库简历                                             |
| `mail_message_id`             | FK, nullable          | 来源邮件                                               |
| `batch_item_id`               | FK, nullable          | 来源解析批次项                                         |
| `matcher_version`             | text, not null        | 匹配实现版本                                           |
| `status`                      | text union            | `processing/succeeded/failed/no_candidates/superseded` |
| `selection_method`            | text union, nullable  | 最终选择方式                                           |
| `selected_job_description_id` | FK, nullable          | 最终 Top1                                              |
| `resume_input_hash`           | text, not null        | 本次简历输入版本                                       |
| `model`                       | text, nullable        | AI 模型                                                |
| `prompt_version`              | text, nullable        | 精排提示词版本                                         |
| `error_message`               | text, nullable        | 技术错误                                               |
| `created_at`                  | timestamptz           | 创建时间                                               |
| `completed_at`                | timestamptz, nullable | 完成时间                                               |

索引与约束：

- `(organization_id, pool_item_id, created_at)` 索引；
- `(pool_item_id, batch_item_id, matcher_version)` 唯一约束，用于队列幂等；
- `selected_job_description_id` 使用 `onDelete: set null`；
- 删除人才库记录时级联删除匹配运行。

### 3.3 新增 `resume_job_match_candidate`

建议字段：

| 字段                 | 类型/约束         | 含义                                        |
| -------------------- | ----------------- | ------------------------------------------- |
| `id`                 | text PK           | 候选记录 ID                                 |
| `run_id`             | FK, not null      | 所属匹配运行                                |
| `job_description_id` | FK, nullable      | 候选岗位                                    |
| `recall_source`      | text union        | `subject_code/filename/vector/ai_full_list` |
| `recall_rank`        | integer, nullable | 召回排名                                    |
| `vector_score`       | integer, nullable | 向量综合分                                  |
| `skill_role_score`   | real, nullable    | 技能与岗位分项                              |
| `work_project_score` | real, nullable    | 工作与项目分项                              |
| `overview_score`     | real, nullable    | 整体画像分项                                |
| `ai_rank`            | integer, nullable | AI 精排排名                                 |
| `ai_score`           | integer, nullable | AI 0～100 匹配分                            |
| `ai_reason`          | text, nullable    | 简短中文理由                                |
| `job_snapshot`       | jsonb, not null   | 岗位编码、名称、部门和内容 hash 快照        |

约束：

- `(run_id, job_description_id)` 唯一；
- `(run_id, ai_rank)` 在 `ai_rank` 非空时唯一；
- `ai_score` 应在 0～100；
- 岗位删除后保留 `job_snapshot`，保证历史结果仍可解释。

### 3.4 继续使用 `resume_pool_event`

不新增绑定历史表，继续使用 `type = "bound"`，统一 payload：

自动绑定：

```json
{
  "source": "auto_match",
  "fromJobDescriptionId": null,
  "toJobDescriptionId": "jd_1",
  "matchRunId": "run_1",
  "selectedCandidateRank": 1,
  "selectionMethod": "ai_rerank"
}
```

HR 改绑：

```json
{
  "source": "hr_rebind",
  "fromJobDescriptionId": "jd_1",
  "toJobDescriptionId": "jd_3",
  "matchRunId": "run_1",
  "selectedCandidateRank": 3
}
```

系统自动绑定 `actorId = null`；HR 改绑写实际用户 ID。

---

## 4. 匹配算法设计

### 4.1 第一层：邮件主题岗位编码

保留当前岗位编码提取与同组织发布岗位查询：

- 唯一岗位命中：直接选择，`selectionMethod = mail_subject_code_exact`；
- 多个编码命中不同岗位：不直接绑定，候选加入后续精排；
- 未命中：继续文件名匹配；
- 主题编码仍是单封邮件最强的岗位信号，优先于账号固定岗位和文件名。

### 4.2 第二层：文件名岗位名称精准匹配

新增纯函数模块，处理：

1. 去除文件扩展名；
2. Unicode NFKC 标准化；
3. 统一大小写、全角半角、连续空格和常见分隔符；
4. 对发布岗位名称做同样标准化；
5. 在文件名独立片段中匹配完整岗位名称；
6. 唯一命中才直接选择。

规则：

- 不使用普通 `includes` 作为直接绑定依据；
- `Java` 不得误命中 `JavaScript`；
- “前端工程师”不得作为“高级前端工程师”内部子串误命中；
- 多个部门存在同名岗位时不随机选择，全部进入 AI 精排；
- v1 不新增岗位别名配置，同义词交由向量和 AI 处理。

结果类型：

```ts
type FilenameJobMatchResult =
  | { status: "exact"; jobDescriptionId: string }
  | { status: "ambiguous"; jobDescriptionIds: string[] }
  | { status: "unmatched" };
```

### 4.3 第三层：无硬门槛向量召回

复用现有三个语义 chunk：

- `skill_role`；
- `work_project`；
- `resume_overview`。

保留权重：

```text
skillRole      45%
workProject    35%
resumeOverview 20%
```

调整：

- 自动选岗链路删除 `SCORE_THRESHOLD = 55` 过滤；
- 合并全部向量命中后按综合分降序排列；
- 同分按 JD ID 升序，保证结果稳定；
- 先按 DB 重新校验组织、发布状态和存在性，再截取 Top 10；
- 主题多命中、简历目标岗位、文件名岗位与向量 Top 10 取并集；
- 向量分只承担召回和初排，不决定“是否可绑定”。

### 4.4 第四层：AI 精排

AI 输入：

- 简历文件名；
- `targetRoles`；
- 工作年限；
- 技能和个人优势；
- 最近工作岗位；
- 最多五段工作经历；
- 最多五段项目经历和技术栈；
- 候选岗位的 ID、编码、名称、部门、描述和要求；
- 每个候选岗位的向量综合分和分项分。

AI 判断优先级：

1. 邮件主题岗位编码；
2. 简历目标岗位；
3. 文件名岗位名称；
4. 最近职位与岗位职责；
5. 技能、工作和项目经历；
6. 向量分、行业、工作年限、教育和职级协调程度。

单次最多向模型提交 20 个岗位，岗位描述最多保留 1200 字；超过 20 个岗位时分批精排，再对每批 Top1 进行决选，完整候选仍全部保存。

结构化输出：

```json
{
  "selectedJobDescriptionId": "jd_1",
  "candidates": [
    {
      "jobDescriptionId": "jd_1",
      "rank": 1,
      "matchScore": 86,
      "reason": "最近三年从事前端开发，React 技术栈与岗位要求高度一致"
    }
  ]
}
```

校验：

- 所有 ID 必须来自输入候选；
- 每个 ID 只能出现一次；
- 排名从 1 连续递增；
- `selectedJobDescriptionId` 必须等于 rank 1；
- `matchScore` 为 0～100；
- `reason` 为不超过 80 字的中文说明；
- 温度设为 0，非法输出重试一次。

### 4.5 降级顺序

| 场景                | 行为                         | 状态/方式                 |
| ------------------- | ---------------------------- | ------------------------- |
| 主题编码唯一命中    | 直接绑定                     | `mail_subject_code_exact` |
| 文件名唯一精准命中  | 直接绑定                     | `filename_exact`          |
| 向量 + AI 正常      | 绑定 AI Top1                 | `ai_rerank`               |
| AI 失败、有向量候选 | 绑定向量 Top1                | `vector_fallback`         |
| 向量不可用、AI 可用 | 使用当前全量发布岗位 AI 匹配 | `ai_full_list`            |
| 全部技术路径失败    | 不伪造绑定，进入重试         | `failed`                  |
| 无发布岗位          | 保持未绑定                   | `no_candidates`           |

---

## 5. 模块接口与并发合同

### 5.1 外部接口

```ts
async function matchAndBindNewMailResume(input: {
  batchItemId: string;
  mailMessageId?: string | null;
  organizationId: string;
  poolItemId: string;
}): Promise<JobMatchResult>;

async function getLatestJobMatchResult(input: {
  organizationId: string;
  poolItemId: string;
}): Promise<JobMatchResult | null>;

async function rebindResumePoolItemJob(input: {
  actorId: string;
  jobDescriptionId: string;
  organizationId: string;
  poolItemId: string;
}): Promise<RebindResult>;
```

调用者不需要知道向量、AI、候选表、提示词和降级细节。

### 5.2 自动绑定并发保护

自动绑定只更新当前未绑定记录：

```sql
WHERE id = ?
  AND organization_id = ?
  AND job_description_id IS NULL
```

因此：

- HR 先绑定时，自动任务不得覆盖；
- 两个自动任务并发时，第一写入者成功，第二个读取当前绑定后收敛；
- 匹配运行和候选仍可保存，但运行状态应标记为 `superseded` 或记录“未应用，因为已有人工绑定”。

### 5.3 HR 改绑事务

单个事务内：

1. 校验目标岗位属于当前组织且仍为发布状态；
2. 锁定并读取当前人才库记录；
3. 相同岗位则直接幂等返回；
4. 更新 `jobDescriptionId`；
5. 查询最新匹配运行中的候选排名；
6. 写 `resume_pool_event`；
7. 提交后返回更新后的详情。

---

## 6. 邮件 `jdMode` 合同

当前 DB 默认是 `none`，本计划调整为：

- 新邮箱账号默认 `jdMode = auto`；
- 新邮件批次的有效模式按以下顺序计算：

```text
主题编码唯一命中                   → bind(命中岗位)
账号明确配置 bind 且固定岗位有效    → bind(固定岗位)
其他邮件采集场景                   → auto
```

这意味着已有邮箱账号即使历史行仍为 legacy `none`，其上线后收到的新邮件也按有效默认 `auto` 创建新批次；不更新已有账号行、历史邮件、历史批次或历史简历。

手工批量上传和非邮件来源继续尊重各自显式的 `bind/auto/none`，不套用该邮件默认规则。

---

## 7. 创建招聘记录对话框合同

保持当前“自动带入但允许修改”的行为，不要求 HR 再次选择岗位。

已绑定岗位且仍在可选发布岗位中：

```text
创建招聘记录

绑定岗位
[ 前端工程师 ▼ ]  ← 自动带入人才库当前岗位

可直接创建，也可以修改岗位。

[取消] [创建招聘记录]
```

行为：

- 默认 `jobDescriptionMode = bind`；
- 默认选择人才库当前 `jobDescriptionId`；
- HR 直接点击创建即可；
- HR 在对话框改选其他岗位时，以提交值为最终岗位；
- 原绑定岗位已下架、删除或不可见时，选择框为空；
- HR 此时必须重新选择发布岗位，或者切换为不关联岗位；
- 不关联岗位创建时不启动岗位正式评价。

该阶段原则上只补回归测试和必要提示文案，不重写现有交互。

---

## 8. 文件结构

### 修改

- `packages/db-schema/src/schema.ts`
  - 邮箱账号默认 `auto`；
  - 新邮件批次增加不回填的 `job_match_requested_at` 门禁；
  - 新增匹配运行与候选表；
  - 新增相关 union 类型和索引。
- `packages/db-schema/src/relations.ts`
  - 增加匹配运行、候选、人才库和岗位关系。
- `packages/shared/src/job-descriptions.ts`
  - 扩展持久化候选结果 DTO，区分向量分和 AI 分。
- `packages/shared/src/resume-pool.ts`
  - 人才库详情增加最近匹配摘要或独立读取 DTO。
- `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts`
  - 计算邮件有效 `jdMode`；
  - 保留主题编码精准绑定；
  - 新批次默认进入 auto。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-worker.ts`
  - 在现有解析后异步任务中识别新邮件门禁并调用自动选岗；
  - 自动选岗完成后继续现有 optional legacy notes 行为。
- `apps/ai-recruitment-copilot-backend/src/server/agents/job-description-match-agent.ts`
  - 增加完整候选精排输出；
  - 保留现有只取 Top1 的兼容 wrapper。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/utils/jd-recommendations.ts`
  - 抽出无阈值召回内核；
  - 删除自动选岗硬门槛；
  - 保证排序稳定和发布岗位校验。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`
  - 自动绑定；
  - HR 改绑；
  - 匹配运行和候选持久化；
  - 统一事件 payload。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/route.ts`
  - `POST /:id/bind` 支持 HR 改绑；
  - 增加最近匹配结果读取端点；
  - 保持 import 评价调度不变。
- `apps/ai-recruitment-copilot/src/components/features/studio/resume-pool/resume-pool-recommendations-panel.tsx`
  - 已绑定时仍展示候选；
  - 展示当前岗位、AI Top1、分数和理由；
  - 支持改绑。

### 新增

- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/utils/job-match/service.ts`
  - 对外深模块接口、上下文加载、候选持久化和条件绑定。
- `.../job-match/filename-match.ts`
  - 文件名精准匹配纯逻辑。
- `.../job-match/orchestrator.ts`
  - 选岗、候选合并和降级编排。
- 对应测试文件。
- Drizzle 自动生成迁移文件。

路由目录只保留薄路由，所有选岗实现放在 `resume-pool/utils/job-match/`，符合当前后端 route-owned 模块布局。

---

## 9. 实施任务

### Task 1：Schema、关系和迁移

- [ ] 在 `schema.ts` 增加匹配运行状态、选择方式和召回来源 union。
- [ ] 新增 `resume_job_match_run`。
- [ ] 新增 `resume_job_match_candidate`。
- [ ] 增加必要唯一约束和索引。
- [ ] 在 `relations.ts` 增加关系。
- [ ] 将 `mail_ingest_account.jdMode` 默认值改为 `auto`。
- [ ] 使用 `pnpm db:generate` 生成迁移，不手写迁移 SQL。
- [ ] 审核迁移，确认没有历史 UPDATE、回填或全表重写。
- [ ] 运行 schema typecheck 和迁移测试。

验证：

```bash
pnpm db:generate
pnpm --filter @arc/db-schema typecheck
```

### Task 2：文件名精准匹配（测试先行）

- [ ] 先写唯一命中、多命中、子串冲突、大小写和分隔符测试。
- [ ] 实现标准化函数。
- [ ] 实现边界完整岗位名称匹配。
- [ ] 保证多命中返回全部候选而不自行选择。

### Task 3：无门槛向量召回内核

- [ ] 为低于旧 55 分但仍应返回的候选写失败测试。
- [ ] 从现有推荐函数抽出原始召回和加权排序。
- [ ] 去掉自动选岗链路阈值过滤。
- [ ] 在 Top-N 截断前进行组织、发布状态和存在性校验。
- [ ] 合并文件名多命中候选。
- [ ] 保留同分稳定排序。

### Task 4：AI 精排

- [ ] 定义完整排名 Zod schema。
- [ ] 写非法 ID、重复 ID、排名断层、Top1 不一致测试。
- [ ] 实现精排提示词和结构化生成。
- [ ] 保留 prompt injection 防护。
- [ ] 非法输出重试一次。
- [ ] 保留现有 `matchJobDescriptionForResume` Top1 wrapper，避免直接招聘台上传链路回归。

### Task 5：匹配运行和候选持久化

- [ ] 实现创建/领取幂等匹配运行。
- [ ] 保存全部候选和岗位快照。
- [ ] 保存最终选择方式、模型、prompt 版本和输入 hash。
- [ ] 实现 succeeded、failed、no_candidates、superseded 状态收敛。
- [ ] 测试重复队列投递只形成一个有效运行。

### Task 6：自动绑定编排

- [ ] 实现 `matchAndBindNewMailResume`。
- [ ] 主题编码唯一命中时记录候选和直接绑定。
- [ ] 文件名唯一命中时记录候选和直接绑定。
- [ ] 其余情况执行向量召回和 AI 精排。
- [ ] AI 失败时按合同降级。
- [ ] 使用 `jobDescriptionId IS NULL` 防止覆盖 HR。
- [ ] 在同一事务中完成绑定和事件写入。

### Task 7：接入新邮件解析完成事件

- [ ] 邮件 worker 对新消息计算有效 `jdMode`。
- [ ] 保留主题编码唯一命中覆盖为 `bind`。
- [ ] `sourceChannel=mail_ingest`、`target=resume_pool`、解析 `ready` 后调用选岗模块。
- [ ] 历史重试任务只在属于本版本新批次时允许继续本次匹配，不扫描旧数据。
- [ ] 自动选岗成功后再继续现有 optional legacy notes 生成。
- [ ] legacy notes 失败不回滚岗位绑定。

### Task 8：HR 改绑接口

- [ ] 调整 `POST /:id/bind` 允许从已有岗位改到新岗位。
- [ ] 目标岗位必须是同组织发布岗位。
- [ ] 相同岗位幂等成功。
- [ ] 写原岗位、新岗位、actor、matchRunId 和候选排名。
- [ ] 不要求 reason 字段。
- [ ] 不调用正式评价队列。

### Task 9：读取匹配结果和人才库 UI

- [ ] 增加最近匹配结果读取接口。
- [ ] 已绑定简历仍展示匹配候选。
- [ ] 标识当前岗位和 AI Top1。
- [ ] 展示 AI 排名、AI 分数和理由；向量分作为诊断信息，不混充 AI 分数。
- [ ] 支持点击候选岗位改绑。
- [ ] 改绑后刷新人才库详情和列表。
- [ ] 无持久化候选的历史简历保持当前展示，不触发后台自动匹配。

### Task 10：创建招聘记录对话框回归

- [ ] 已绑定且岗位有效时自动预选当前岗位。
- [ ] HR 不重新选择即可创建。
- [ ] HR 可在对话框改选其他岗位。
- [ ] 岗位已下架时不自动选入。
- [ ] 可选择不关联岗位。
- [ ] 不重写当前对话框状态模型，只补必要提示和测试。

### Task 11：正式评价调度回归

- [ ] 人才库自动绑定不入正式评价队列。
- [ ] HR 人才库改绑不入正式评价队列。
- [ ] 创建招聘记录且有岗位时正式评价只入队一次。
- [ ] 对话框改选岗位后按最终岗位评价。
- [ ] 不关联岗位时不启动评价。
- [ ] legacy/structured 两种招聘台评价模式继续走现有生命周期。

---

## 10. 测试矩阵

### 10.1 邮件主题

- [ ] 一个岗位编码命中一个发布岗位。
- [ ] 同一编码重复出现仍只产生一个候选。
- [ ] 多个编码命中不同岗位时不直接绑定。
- [ ] 编码命中下架岗位时视为未命中。
- [ ] 他组织相同编码不可命中。

### 10.2 文件名

- [ ] `张三-高级前端工程师-5年.pdf` 唯一命中。
- [ ] “前端工程师”不从“高级前端工程师”内部误命中。
- [ ] `Java` 不误命中 `JavaScript`。
- [ ] 空格、下划线、横线、括号和全角字符标准化。
- [ ] 同名岗位返回 ambiguous。
- [ ] 无岗位信息返回 unmatched。

### 10.3 向量与 AI

- [ ] 旧阈值 55 以下岗位仍进入候选。
- [ ] 三个 chunk 正确合并和加权。
- [ ] 下架/已删岗位在 Top-N 前掉出。
- [ ] AI 完整返回候选排序。
- [ ] AI 返回非法岗位 ID 被拒绝。
- [ ] AI 重复 ID、漏排名、Top1 不一致被拒绝。
- [ ] AI 失败时使用向量 Top1。
- [ ] 向量不可用时使用全量发布岗位 AI 降级。

### 10.4 并发与幂等

- [ ] 同一 batch item 重复执行只产生一个有效 run。
- [ ] 两个自动任务并发时只绑定一次。
- [ ] HR 先绑定后，自动任务不覆盖。
- [ ] AI 完成前 HR 改绑，最终保留 HR 岗位。
- [ ] 岗位在匹配过程中下架时不被最终绑定。
- [ ] 同岗位重复改绑不重复写事件。

### 10.5 UI 与评价

- [ ] 已绑定后候选面板仍显示。
- [ ] HR 可以改绑候选岗位。
- [ ] 创建招聘记录对话框自动带入当前岗位。
- [ ] HR 可直接创建，无须重新选择。
- [ ] 对话框改选后按新岗位创建。
- [ ] 人才库绑定/改绑不触发正式评价。
- [ ] 创建招聘记录后正式评价只入队一次。

### 10.6 历史数据保护

- [ ] 上线前人才库记录不产生 match run。
- [ ] 上线前未绑定简历不会被后台扫描。
- [ ] 历史 `resume_upload_batch.jdMode` 不变化。
- [ ] 历史 `resume_pool_item.jobDescriptionId` 不变化。
- [ ] 历史评价结果和状态不变化。

---

## 11. 验证命令

按任务运行聚焦测试，最终执行：

```bash
pnpm --filter @arc/db-schema typecheck
pnpm --filter @arc/ai-recruitment-copilot-worker test
pnpm --filter @arc/ai-recruitment-copilot-worker typecheck
pnpm --filter @arc/ai-recruitment-copilot-backend test
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm check
```

涉及格式调整时按仓库约定运行 `pnpm fix`，但只提交本功能相关变化。

---

## 12. 发布顺序

1. 发布仅加法的数据库迁移。
2. 发布后端匹配模块、候选持久化和 HR 改绑接口。
3. 发布邮件 worker 的新消息触发逻辑。
4. 发布人才库候选展示和改绑界面。
5. 验证创建招聘记录对话框自动带入岗位。
6. 验证招聘台正式评价只在 import 后触发。
7. 直接对上线后新邮件启用，不做影子模式，不回放历史数据。

回滚：

- 可先停用新自动匹配任务或回滚 worker；
- 新增表保留，不执行破坏性降级；
- 已完成的新简历绑定作为正常业务结果保留；
- 原邮件解析、人才库和招聘台评价链路继续工作。

---

## 13. Definition of Done

- [ ] 新邮件默认进入人才库并自动选择岗位。
- [ ] 主题编码和文件名精准信号优先。
- [ ] 向量召回没有 55 分硬门槛。
- [ ] AI 对候选岗位完成结构化精排。
- [ ] 正常情况下绑定 Top1。
- [ ] 所有候选、分数、理由和岗位快照完整保存。
- [ ] HR 可以无理由改绑，并记录新旧岗位。
- [ ] 已绑定简历仍可查看候选并改绑。
- [ ] 创建招聘记录时自动带入当前岗位，HR 无须重新选择。
- [ ] 人才库阶段不启动正式评价。
- [ ] 创建招聘记录后按最终岗位执行现有正式评价。
- [ ] 历史简历、历史绑定、历史批次和历史评价保持不变。
