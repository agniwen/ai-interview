# Resume Scoring Policy P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地「简历评分策略」P1：可配置六维启用与权重、唯一全局默认策略、岗位绑定互斥覆盖、生成时策略快照、综合分 1 位小数与可排序列、以及筛选/评分单口结论（nextStep 代码约束 + UI 主结论层级）。**不做**结构化扣分表与 LLM 扣项（P2）。

**Architecture:** 新增 workspace 实体 **Resume Scoring Policy**（global 种子 1 条 + 可选多条 job-scoped）。**策略解析在 workflow 入口之前完成**（DAO，有 org/JD 上下文）；快照作为 **Mastra `resume-review-workflow` 的输入字段** 流入。Workflow 仍是 `qualitative → scoring → compose` 三步：前两步走现有 Mastra Agent（`resumeReviewQualitativeAgent` / `resumeReviewScoringAgent`），**compose 步纯代码**（加权综合分 + nextStep 约束 + 挂 snapshot）。落库 `resume_review` jsonb + 冗余 `resume_review_base_score`。Screening 与 Review 存储仍分离；**Resume Evaluation Decision** 在 compose/UI 统一。

**Tech Stack:** [Mastra](https://mastra.ai/)（`@mastra/core` Agent / Workflow / Scorer / Observability）+ TypeScript / Hono / Drizzle / Zod / Vitest；React 19 / TanStack Router / Query / Hono RPC / shadcn。共享类型在 `@arc/db-schema` + `@arc/shared`。

**ADRs / glossary:**

- `docs/adr/0016-resume-scoring-policies.md`
- `docs/adr/0017-single-resume-evaluation-decision.md`
- `CONTEXT.md`（Resume Scoring Policy / Snapshot / Composite Score / Evaluation Decision）

---

## Global Constraints

- 后端 `apps/ai-recruitment-copilot-backend/src/server/**` 与 `lib/server/**` 不得 import web-app `@/` 或 TanStack Start 原语。
- 路由：`route.ts` 内 `.use` / 内联 `requirePermission`；`app.ts` 只 mount。
- JSON：`c.json(data, status)` + `zValidator(..., jsonValidatorError("..."))`；日期 `.toISOString()`。
- 前端 feature UI 放 `src/components/features/<feature>/`；`src/routes/` 只做路由薄壳。
- 权限写：**仅 owner/admin**（新 resource + page action）；读策略配置页同写权限；简历详情上策略名/快照摘要对能看简历的人可见。
- 命令：`pnpm --filter @arc/db-schema …` / `@arc/shared` / `@arc/ai-recruitment-copilot-backend` / `@arc/ai-recruitment-copilot`；根目录 `pnpm fix` 提交前。
- Conventional commits；每个 Task 结束提交一次。
- **P1 不做：** Workspace Deduction Rule Set、Agent 2 扣项 schema、改策略批量重算、默认改列表排序、替换向量推荐分。
- **Mastra 边界（见下节）：** 策略 CRUD / 权重数学 / nextStep 约束 **不**做成 Agent tool 或 LLM 输出；只扩展现有 workflow 输入与 compose 步。

---

## Mastra Integration (how we use the framework)

现网已用 Mastra，P1 **沿着现有缝接入**，不新开第二套编排。

### 现状（代码事实）

| 层                               | 位置                                                                                          | 职责                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Mastra instance**              | `server/agents/mastra/index.ts`                                                               | 注册 agents / workflows / scorers / observability / studio editor                                             |
| **Agents**                       | `mastra/agents/simple-generators.ts`                                                          | `resumeReviewQualitativeAgent`、`resumeReviewScoringAgent`（短 instructions + `structuredModel`）             |
| **Prompt + structured generate** | `server/agents/resume-analysis-review.ts`                                                     | 长中文 prompt + Zod schema；经 `generateStructuredWithMastraAgent` 调 Agent                                   |
| **Workflow**                     | `mastra/workflows/resume-review-workflow.ts`                                                  | `qualitative-review` → `scoring` → `compose-review`；`runResumeReviewWorkflow` / `streamResumeReviewWorkflow` |
| **入口**                         | `generateResumeReview` → `runResumeReviewWorkflow`；worker → `generateResumeReviewBestEffort` | 生产路径已走 Mastra workflow                                                                                  |
| **旁路**                         | `streamGenerateResumeReviewMarkdownFirst`                                                     | **非** workflow，手写 step 事件；P1 必须与主路径 **同一套 compose 语义**                                      |
| **Mastra Scorer**                | `resumeReviewStructureScorer`                                                                 | 仅检查 review 文本 + structured 是否有值（评测用，非业务分）                                                  |

### P1 选用原则

| 能力                                  | 放哪里                                                                                                         | 原因                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 策略 CRUD / 绑定 / 种子               | Hono + DAO + Postgres                                                                                          | 配置面，与 LLM 无关                                                                                  |
| `resolveScoringPolicyForJob`          | DAO；在 **lifecycle/worker 调用 workflow 之前**                                                                | 需要 `organizationId` + `jobDescriptionId`；避免 workflow step 内耦合 DB，且与现有 deps 注入风格一致 |
| 启用维加权 / 1 位小数 / snapshot 挂载 | **`compose-review` 纯代码步** + `composeResumeReviewResult`                                                    | 与现网「LLM 不写 baseScore」一致；可单测、可复现                                                     |
| `constrainNextStepAction`             | **compose 步**（读 input 上的 `screeningResult`）                                                              | 决策表确定性；不进 Agent                                                                             |
| 六维原始分                            | 仍 `resumeReviewScoringAgent` + 现 schema                                                                      | P1 不改扣项；满六维                                                                                  |
| 策略信息进 scoring prompt             | **可选轻量**：在 `REVIEW_SCORING_INSTRUCTIONS` / scoring prompt 中附加「启用维与权重仅供校准，总分由系统计算」 | 帮助模型对启用维给更稳 rationale；**禁止**让模型输出综合分                                           |
| Workflow 输入扩展                     | `scoringPolicySnapshot`（已序列化、可 Zod）                                                                    | Step 间透传；trace 可见；compose 不二次查库                                                          |
| Mastra Scorer 增强                    | 扩展 `resumeReviewStructureScorer` 或新增 `resumeReviewCompositeConsistencyScorer`                             | 校验 `baseScore ≈ Σ(dim×w)` 与 snapshot 存在；用于 Studio 评测 / 回归，**不**替代业务计分            |
| Observability                         | 沿用现有 `Observability` + workflow stream labels                                                              | compose 步 label 可改为「按策略汇总评分」                                                            |
| **不做（P1）**                        | 新建「政策 Agent」、用 Agent tools 查策略、把权重交给 LLM 算、把筛选改成 Mastra tool 链                        | 增复杂且与 ADR 冲突                                                                                  |

### 目标数据流（Mastra-centric）

```text
review-generation / worker
  ├─ resolveScoringPolicyForJob(orgId, jdId)     // DAO，非 Mastra
  ├─ buildScoringPolicySnapshot(policy)          // @arc/shared 纯函数
  └─ runResumeReviewWorkflow | streamResumeReviewWorkflow
        input: {
          resumeProfile,
          jobDescription,
          screeningResult?,
          scoringPolicySnapshot,                 // NEW
        }
        steps:
          1. qualitative-review  → generateResumeQualitativeReview (Mastra Agent)
          2. scoring             → generateResumeReviewScoring (Mastra Agent)
          3. compose-review      → composeResumeReviewResult(qual, scoring, {
               snapshot,
               screeningResult,
               hardFilterRejected?: false,
             })
               • computeResumeReviewBaseScore(dims, snapshot)  // 1 位小数
               • constrainNextStepAction(...)
               • attach scoringPolicySnapshot
               • formatResumeReviewMarkdown
```

Hard-filter 短路（Agent 0，在 workflow 外 / lifecycle 前）若仍返回 reject review：同样调用 **同一** `compose`/`assemble` 辅助，写入 `baseScore: 0.0` + 当前 snapshot（保证列与 jsonb 形状一致）。

### Markdown-first 旁路

`streamGenerateResumeReviewMarkdownFirst` 不是 Mastra workflow，但必须：

1. 接受同样的 `scoringPolicySnapshot`（调用方 resolve 后传入）
2. 最终走 `composeResumeReviewFromMarkdown(..., { snapshot, screening })`，**禁止**再 `computeResumeReviewBaseScore(dims)` 无策略重载

### P2 与 Mastra（预告，本 plan 不实现）

- Scoring Agent 输出改为 `appliedDeductions[]`；维分在 **compose 或独立 code step** 计算
- 可选第四步 / 替换 scoring step；扣分表仍 workspace 配置，不进 Agent 记忆
- Scorer 可断言「screening missing skill ⊆ deductions」

---

## Data Model (target)

### `resume_scoring_policy`

| Column                      | Type                   | Notes                                                                                                                                    |
| --------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                        | text PK                |                                                                                                                                          |
| `organization_id`           | text FK → organization | cascade                                                                                                                                  |
| `title`                     | text                   | 种子默认「系统默认」                                                                                                                     |
| `description`               | text null              |                                                                                                                                          |
| `scope`                     | text                   | `global` \| `job_description`                                                                                                            |
| `weight_mode`               | text                   | `equal` \| `custom`                                                                                                                      |
| `enabled_dimensions`        | jsonb                  | `ResumeReviewDimensionKey[]`，长度 1–6，无重复                                                                                           |
| `weights`                   | jsonb                  | `Record<key, number>` 百分比，**仅启用维**，custom 时 sum=100（2 位小数）；equal 时服务端写入均分结果（可仍存展开后的权重便于 snapshot） |
| `version`                   | int not null default 1 | 每次 update +1                                                                                                                           |
| `content_hash`              | text                   | 可选；启用维+mode+weights 规范化 hash，snapshot 用                                                                                       |
| `origin`                    | text                   | `system_seed` \| `user`                                                                                                                  |
| `created_by`                | text null              |                                                                                                                                          |
| `created_at` / `updated_at` | timestamptz            |                                                                                                                                          |

**Constraints:**

- Unique partial：`(organization_id) WHERE scope = 'global'` → 每 org 至多 1 条 global。
- `scope=global` 时禁止 delete（DAO/API 强制）。
- 新建 API 只允许 `scope=job_description`（种子除外）。

### `resume_scoring_policy_job_description`

| Column                               | Type                         |
| ------------------------------------ | ---------------------------- |
| `policy_id`                          | text FK cascade              |
| `job_description_id`                 | text FK cascade              |
| PK `(policy_id, job_description_id)` |                              |
| **Unique `job_description_id`**      | 全局互斥：一岗只能绑一条策略 |

### `studio_interview` 新增列

| Column                           | Type              | Notes                                                     |
| -------------------------------- | ----------------- | --------------------------------------------------------- |
| `resume_review_base_score`       | numeric(5,1) null | 综合分冗余，排序/过滤                                     |
| `resume_scoring_policy_id`       | text null         | 生成时策略 id（历史/无策略可 null）                       |
| `resume_scoring_policy_snapshot` | jsonb null        | 与 review 内 snapshot 同构冗余，便于列表不展开整份 review |

Index: `(organization_id, resume_review_base_score)` 或 `(organization_id, job_description_id, resume_review_base_score)`。

### Review JSON（兼容演进）

- `overall.baseScore`：由 **int** 放宽为 **0–100 一位小数**（Zod `number` + refine）。
- 新增顶层或 `overall` 旁：

```ts
scoringPolicySnapshot: {
  policyId: string;
  policyTitle: string;
  policyVersion: number;
  contentHash: string;
  scope: "global" | "job_description";
  weightMode: "equal" | "custom";
  source: "policy" | "legacy"; // legacy = 旧数据 backfill/兼容
  dimensions: Array<{
    key: ResumeReviewDimensionKey;
    enabled: boolean;
    weightPercent: number; // 启用维之和 100
  }>;
}
```

- `schemaVersion`：**保持 4 写入**也可，若改 shape 破坏严格 schema 则升 **5** 并更新 `resumeReviewSchema`；loose schema 继续兼容 1–4。推荐 **升 v5** 因 `baseScore` 精度 + snapshot 字段。

### 系统默认权重（种子内容）

与现网一致：六维全开 + custom 35/25/15/10/8/7（`skillMatch` … `stability`）。  
代码常量 `SYSTEM_DEFAULT_SCORING_POLICY_PAYLOAD` 用于种子与极端兜底（正常路径应总有 global 行）。

---

## P1 Decision Table（单口结论）

| Screening                                 | Hard filter 短路                   | 主结论（UI）      | nextStep 允许                                                                        | 综合分展示               | 按分排序池                               |
| ----------------------------------------- | ---------------------------------- | ----------------- | ------------------------------------------------------------------------------------ | ------------------------ | ---------------------------------------- |
| 未跑 / idle / processing / failed         | —                                  | 筛选未完成 / 失败 | 不强调进面；不伪造成终局                                                             | 有则次要                 | 否                                       |
| `recommendation=hold`                     | —                                  | 暂缓·筛选风险     | `{hold, reject}` only；若模型出 interview → **强制 hold**（保留 rationale 可加前缀） | 次要 +「不参与过线排序」 | 否（可分池内排，P1 列表可先简单沉底）    |
| `recommendation=flag`                     | —                                  | 风险提示 + 匹配度 | 允许 interview/hold/reject                                                           | 主分可用                 | **是**（flag 仍过线池；主结论展示 flag） |
| `recommendation=pass` 或 policy 空/未启用 | —                                  | 以分为匹配信号    | 全允许                                                                               | 主分                     | **是**                                   |
| —                                         | hard filter 违规产生 reject review | 未过硬门槛        | 保持现网 reject                                                                      | 0 分                     | 否                                       |

说明：`policyEmpty` / `!policyEnabled` 时 screening 不构成门槛 → 视为「无筛选门槛」，综合分可作主排序信号。

---

## Task 0: 共享类型与纯函数（政策 + 计分）

**Files:**

- Create: `packages/db-schema/src/resume-scoring-policy.ts`（Zod + 类型 + 默认 payload）
- Modify: `packages/db-schema/src/resume-review.ts`（v5 schema、snapshot 字段、`baseScore` 一位小数）
- Modify: `packages/db-schema` 导出（package.json exports 若需）
- Modify: `packages/shared/src/resume-review.ts`（`computeResumeReviewBaseScore` 接 snapshot/启用维；`roundCompositeScore`；re-export）
- Create: `packages/shared/src/resume-scoring-policy.ts`（均分权重、校验 weights sum、`buildSnapshot`、`hashPolicyContent`）
- Create: `packages/shared/src/resume-evaluation-decision.ts`（`constrainNextStepAction`、`buildEvaluationDecision` 纯函数）
- Test: `packages/shared/src/__tests__/resume-review.test.ts`（扩展）
- Test: `packages/shared/src/__tests__/resume-scoring-policy.test.ts`
- Test: `packages/shared/src/__tests__/resume-evaluation-decision.test.ts`

**Interfaces:**

```ts
// compute：只对 enabled 维加权；内部 4 位小数累加，返回一位小数
export function computeResumeReviewBaseScore(
  dimensions: Record<string, { score: number }>,
  policy: { enabledDimensions: ResumeReviewDimensionKey[]; weights: Record<string, number> },
): number; // e.g. 86.6

export function roundCompositeScore(value: number): number; // Math.round(x * 10) / 10, clamp [0,100]

export function buildEqualWeights(enabled: ResumeReviewDimensionKey[]): Record<string, number>;

export function constrainNextStepAction(input: {
  action: ResumeReviewAction;
  screening: ResumeScreeningResult | null | undefined;
  hardFilterRejected?: boolean;
}): ResumeReviewAction;
```

- [ ] **Step 1: 写失败测试** — equal 3 维权重约 33.33；custom 六维文档示例 86.6；缺维时跳过该维并 **renormalize** 或 **要求六维齐全**（P1 生成路径六维齐全，legacy 缺维时按已有启用维权重重归一化到 100）。选定：**生成路径要求启用维皆有分；legacy 只对存在的启用维重归一化**。

```ts
it("weights enabled dimensions only (equal 3)", () => {
  const score = computeResumeReviewBaseScore(
    {
      skillMatch: { score: 90 },
      stability: { score: 79 },
      potential: { score: 92 } /* 其余任意 */,
    },
    {
      enabledDimensions: ["skillMatch", "stability", "potential"],
      weights: { skillMatch: 100 / 3, stability: 100 / 3, potential: 100 / 3 },
    },
  );
  expect(score).toBe(87.0);
});
```

- [ ] **Step 2: 跑测确认 FAIL**

```bash
pnpm --filter @arc/shared test resume-review
```

- [ ] **Step 3: 实现 schema + 计算 + nextStep 约束**

`constrainNextStepAction`：`hardFilterRejected` → `reject`；screening `hold` 且 action=`interview` → `hold`；否则原样。

- [ ] **Step 4: 测 PASS + typecheck packages**

```bash
pnpm --filter @arc/shared test && pnpm --filter @arc/db-schema typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/db-schema packages/shared
git commit -m "feat(scoring-policy): add policy types, composite score, nextStep constraints"
```

---

## Task 1: Drizzle schema + migration

**Files:**

- Modify: `packages/db-schema/src/schema.ts`（新表 + studio_interview 列）
- Modify: relations 若项目有 `relations.ts`
- Generate migration via `pnpm db:generate`（从 web app 代理）
- Review SQL：unique partial global、unique job_description_id

- [ ] **Step 1: 表定义** — 按 Data Model 落地；`resume_review_base_score` 用 `numeric({ precision: 5, scale: 1 })` 或 double + 应用层 round。

- [ ] **Step 2: 生成并检查 migration**

```bash
pnpm db:generate
```

- [ ] **Step 3: 本地 migrate（若环境有 DB）**

```bash
pnpm db:migrate
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(db): resume scoring policy tables and review score columns"
```

---

## Task 2: Policy DAO — seed、解析、CRUD 校验

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/scoring-policies/dao.ts`（或 `dao/queries.ts` + `dao/mutations.ts` 按同目录惯例）
- Create: `.../scoring-policies/schema.ts`（API body Zod，可 re-export db-schema）
- Test: `.../scoring-policies/dao.test.ts`（可用现有 DAO 测模式；无 DB 则测纯校验函数 + mock）

**Interfaces:**

```ts
ensureGlobalScoringPolicy(organizationId: string, actorId?: string): Promise<PolicyRow>
resolveScoringPolicyForJob(organizationId: string, jobDescriptionId: string | null): Promise<ResolvedPolicy>
// ResolvedPolicy = row + jobDescriptionIds；无 global 时 insert 种子再返回
listScoringPolicies(organizationId: string): Promise<PolicyListItem[]>
createJobScopedPolicy(...)
updatePolicy(...) // global 可更新内容不可改 scope；version++
deletePolicy(...) // global → 403/400；job-scoped OK，解绑
assertJobBindingsExclusive(orgId, jobIds, excludePolicyId?): Promise<void>
```

- [ ] **Step 1: 单测** — 解析顺序：有 job 绑定用指定，否则 global；绑定冲突抛错。

- [ ] **Step 2: 实现 DAO + `content_hash`**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(scoring-policy): dao resolve, seed, exclusive bindings"
```

---

## Task 3: 种子挂钩 — 新建 org + 存量 backfill

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/lib/server/auth.ts` → `afterCreateOrganization` 调用 `ensureGlobalScoringPolicy`
- Create: script 或 migrate SQL / one-shot `scripts/backfill-scoring-policies.ts`（或 server 启动可选 ensure——**更推荐显式 backfill 命令**，与其它脚本一致）

- [ ] **Step 1: afterCreateOrganization 种子**

- [ ] **Step 2: backfill：对每个 organization 无 global 则 insert 默认**

```bash
# 示例：pnpm --filter @arc/ai-recruitment-copilot-backend exec tsx src/.../backfill-global-scoring-policies.ts
```

- [ ] **Step 3: 测 hook 或 DAO ensure 幂等（二次调用不插第二条 global）**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(scoring-policy): seed global policy on workspace create and backfill"
```

---

## Task 4: 权限矩阵

**Files:**

- Modify: `packages/shared/src/permissions.ts`
  - `statement.resumeScoringPolicy: ["create","read","update","delete"]`
  - `page` 增加 `"scoringPolicies"`（文案「评分策略」）
  - **仅** `owner` / `admin` 的 page 与 resource 含写+读；member 系列 **不含** `scoringPolicies` page 与 resource（简历详情只读 snapshot 不走此 page）
- Modify: `packages/shared/src/__tests__/permissions.test.ts`
- 同步任何依赖 statement 穷举的测试

- [ ] **Step 1: 失败测试** — owner 有 `scoringPolicies`；recruiting member 无。

- [ ] **Step 2: 实现矩阵**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(permissions): owner/admin resume scoring policy access"
```

---

## Task 5: Hono API 路由

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/scoring-policies/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/route.ts` mount `.route("/scoring-policies", scoringPoliciesRouter)`
- Test: route 级测试（testClient 或现有 pattern）

**Endpoints（均在 `/api/w/:slug/studio/scoring-policies`）:**

| Method | Path   | Perm   | Behavior                                                                 |
| ------ | ------ | ------ | ------------------------------------------------------------------------ |
| GET    | `/`    | read   | 列表：默认 global 置顶 + job-scoped；含绑定 JD 摘要                      |
| GET    | `/:id` | read   | 详情                                                                     |
| POST   | `/`    | create | **仅** job_description scope；校验绑定互斥、weights                      |
| PATCH  | `/:id` | update | 改 title/维/权重/绑定（global 不可改 scope、不可清空为 0 维）；version++ |
| DELETE | `/:id` | delete | global → 400「默认策略不可删除」                                         |

- [ ] **Step 1: 实现 + 校验错误中文消息**

- [ ] **Step 2: 测 409/400 绑定冲突、删 global 失败**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(api): studio scoring-policies CRUD"
```

---

## Task 6: Mastra workflow + compose — 策略快照、综合分、nextStep

> 核心改动落在 **Mastra resume-review-workflow** 与 **compose 纯函数**，不是新建 Agent。

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/workflows/resume-review-workflow.ts`
  - 扩展 `resumeReviewInputSchema`：`scoringPolicySnapshot`（用 `@arc/db-schema` / shared 的 Zod）
  - `qualitative` / `scoring` step：**透传** snapshot（spread `inputData`）
  - `compose-review`：`deps.composeReview(qual, scoring, { snapshot: inputData.scoringPolicySnapshot, screeningResult: inputData.screeningResult })`
  - 更新 `stepLabels`：`compose-review` → `按策略汇总评分`（或保留原中文并注明策略）
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/resume-analysis-review.ts`
  - `assembleResumeReview(qual, scoring, options: { snapshot; screening? })`
  - `composeResumeReviewResult` / `composeResumeReviewFromMarkdown` 签名对齐
  - `generateResumeReview` / `streamGenerateResumeReview` / markdown-first：input 增加 `scoringPolicySnapshot`
  - **可选：** `buildResumeScoringPrompt` 末尾追加 snapshot 启用维与权重说明（总分仍禁止模型输出）
  - Agent 短 instructions（`simple-generators.ts`）**可不改**；长 prompt 在 review 文件即可
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-generation.ts`
  - 在调 `generateResumeReview` 前：`resolveScoringPolicyForJob` + `buildScoringPolicySnapshot`
  - 需要 `organizationId` + `jobDescriptionId`（从 record 取；无 JD 时仍 resolve → global）
- Modify: hard-filter reject 路径（`resume-analysis-hard-filter.ts`）：写入 `baseScore: 0.0` + 传入的 snapshot
- Test: `mastra/__tests__/resume-review-workflow.test.ts`（断言 compose 收到 snapshot；hold → nextStep）
- Test: `agents/__tests__/resume-analysis-agent-review.test.ts`
- Test: `resumes/utils/review-generation.test.ts`（mock resolve）

**Workflow 输入（目标）：**

```ts
const resumeReviewInputSchema = z.object({
  jobDescription: z.string().nullable().optional(),
  resumeProfile: resumeProfileSchema,
  screeningResult: resumeScreeningResultSchema.nullable().optional(),
  scoringPolicySnapshot: scoringPolicySnapshotSchema, // required for new writes
});
```

**Compose 契约：**

```ts
export function composeResumeReviewResult(
  qualitative: ResumeQualitativeReview,
  scoringInput: unknown,
  options: {
    scoringPolicySnapshot: ScoringPolicySnapshot;
    screeningResult?: ResumeScreeningResult | null;
    hardFilterRejected?: boolean;
  },
): ResumeReviewGenerationResult;
```

- [ ] **Step 1: 失败测试（workflow）** — mock compose 时 expect 第三参含 snapshot；screening hold 时 structured nextStep 非 interview。

- [ ] **Step 2: 实现 schema 扩展 + compose + generation 入口 resolve**

- [ ] **Step 3: 更新 markdown-first 旁路同一 compose**

- [ ] **Step 4: 跑测**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-review-workflow
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-analysis-agent-review
pnpm --filter @arc/ai-recruitment-copilot-backend test review-generation
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(mastra): thread scoring policy snapshot through resume-review workflow"
```

---

## Task 6b: Mastra Scorer — 综合分自洽（评测用）

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/scorers/recruitment-scorers.ts`
- Modify: `mastra/__tests__/recruitment-scorers.test.ts`
- 保持注册在 `recruitmentScorers` → `mastra/index.ts`（已挂 scorers）

**行为：**

- 新增或扩展 scorer：`resumeReviewCompositeConsistencyScorer`
  - 输入：structuredReview
  - 得分 1.0 当：`scoringPolicySnapshot` 存在且 `abs(baseScore - recompute(dims, snapshot)) < 0.05`
  - 无 snapshot（legacy fixture）→ 跳过或给 1.0 并标记 N/A（测试里用新 shape）

- [ ] **Step 1: 单测 recompute 一致 / 故意改 baseScore → 0**

- [ ] **Step 2: 实现并注册**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(mastra): composite score consistency scorer for resume review"
```

---

## Task 7: Worker 持久化冗余列

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-worker.ts` `markReady`
- Test: `review-worker.test.ts`

```ts
.set({
  // existing...
  resumeReviewBaseScore: structuredReview.overall.baseScore,
  resumeScoringPolicyId: structuredReview.scoringPolicySnapshot?.policyId ?? null,
  resumeScoringPolicySnapshot: structuredReview.scoringPolicySnapshot ?? null,
})
```

- [ ] **Step 1–3: 测 + 实现 + commit**

```bash
git commit -m "feat(resume-review): persist composite score columns on markReady"
```

---

## Task 8: 存量 baseScore backfill（历史数值不动）

**Files:**

- Create: backfill script（扫 `studio_interview` where `resume_review` not null and `resume_review_base_score` is null）
  - 从 `resume_review.overall.baseScore` 或 `overall.score` 写入 **原整数为 x.0**
  - `resume_scoring_policy_snapshot = { source: "legacy", ... 系统默认权重展开, policyId: null 或当前 global id 仅作展示？}`  
    **推荐：** legacy snapshot `source:"legacy"`，`policyId` 用当时不存在则 null，**不要**假装是现行 global 版本。
  - **不**改 jsonb 内 baseScore 整数（避免历史观感变化）；冗余列存 `87.0`

- [ ] **Step 1: 脚本 dry-run 计数**

- [ ] **Step 2: 执行 backfill（文档写清运维步骤）**

- [ ] **Step 3: Commit 脚本**

```bash
git commit -m "chore: backfill resume_review_base_score for legacy reviews"
```

---

## Task 9: 简历列表 — 可选按综合分排序

**Files:**

- 定位 resumes list DAO / query schema（`routes/studio/routes/resumes/`）
- 增加 query：`sort=baseScore|createdAt|...`，`order=asc|desc`
- **默认排序不变**（保持现网）
- 返回 DTO 增加 `resumeReviewBaseScore: number | null`、`evaluationDecision` 轻量字段可选 P1 后做

- [ ] **Step 1: API + 单测**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(resumes): optional sort by resume review composite score"
```

---

## Task 10: 前端 — 评分策略页

**Files:**

- Create route: `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.scoring-policies.tsx`（薄壳）
- Create: `src/components/features/studio/scoring-policies/*`（列表、编辑对话框：维度勾选、equal/custom 权重、岗位多选、实时均分、sum=100 校验）
- Modify: `src/lib/start/studio-page-paths.ts` + studio sidebar / nav（与 `interview-questions` 同级；**仅**有 `page:scoringPolicies` 时显示）
- Client: `rpc.api.w[":slug"].studio["scoring-policies"]` + `rpcFetch`

**UX 要点：**

- 列表置顶「系统默认」badge；删除按钮对 global 隐藏/禁用
- 新建：只建指定岗位策略
- 绑定冲突：toast 指出占用策略名
- equal 模式：勾选变化即时重算均分展示；custom：输入 2 位小数

- [ ] **Step 1: 页面可读写 happy path**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(studio): scoring policies management UI"
```

---

## Task 11: 前端 — 评价单口结论 + 分展示

**Files:**

- Modify: `src/components/features/studio/resumes/resume-overview-panel.tsx`
  - 主结论区：调用共享 `buildEvaluationDecision`（或前端镜像字段）展示单一主文案
  - 综合分：`toFixed(1)`；无 snapshot 显示「历史评分」badge
  - 雷达：默认只画 **enabled** 维；可选折叠「未计入维度」
  - 权重文案来自 snapshot，不用写死 DIMENSION 常量权重
  - screening hold：分次要样式 + 说明文案
- Modify: resume detail 其它展示 `baseScore` 处（grep `baseScore` / `getResumeReviewBaseScore`）
- 列表列：可选显示综合分；排序控件接 Task 9

- [ ] **Step 1: 组件测或手动验收清单写进 PR**

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(resumes): single evaluation decision and policy-aware score UI"
```

---

## Task 12: JD 详情只读「生效策略」

**Files:**

- Job description detail 组件增加只读行：「评分策略：系统默认 / 《前端专项》」+ admin 链到策略页
- API：可复用 `resolve` 内部逻辑 — `GET /scoring-policies/effective?jobDescriptionId=` 或 list 端计算

- [ ] **Step 1: 实现 + commit**

```bash
git commit -m "feat(jd): show effective resume scoring policy"
```

---

## Task 13: 回归与验收

**Verify:**

```bash
pnpm --filter @arc/shared test
pnpm --filter @arc/ai-recruitment-copilot-backend test
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-review-workflow
pnpm --filter @arc/ai-recruitment-copilot-backend test recruitment-scorers
pnpm --filter @arc/ai-recruitment-copilot test  # 若有相关
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm fix
```

Mastra 相关：确认 `recruitmentWorkflows.resumeReviewWorkflow` step id 仍为 `qualitative-review` / `scoring` / `compose-review`（或有意重命名时同步 stream labels 与 `workflows.test.ts`）。

**手工验收清单：**

1. 新 workspace 自动有不可删「系统默认」策略，权重 35/25/15/10/8/7
2. 创建指定策略绑岗 A；再绑 A 到另一策略失败
3. 岗 A 生成 review：snapshot 为指定策略；综合分 1 位小数；冗余列有值
4. 无绑定岗走 global
5. 改策略权重后 **旧** review 分不变；**新** review 用新权重
6. screening hold + 模型想 interview → 落库 hold
7. 旧数据展示「历史评分」，列表可按综合分排序（非默认）
8. member 角色看不到评分策略导航；owner 可进

- [ ] **Step 1: 全绿 + 清单勾完**

- [ ] **Step 2: 最终 commit 若有 fixups**

---

## Dependency Graph

```text
T0 类型/计分（shared，compose 纯函数）
 └─ T1 DB
     ├─ T2 DAO resolve/seed
     │   ├─ T3 种子/backfill org
     │   ├─ T5 API ── T10 策略 UI
     │   └─ T6 Mastra workflow + compose ── T6b Mastra scorer
     │        └─ T7 worker 列 ── T8 score backfill
     │        └─ T11 评价 UI
     │        └─ T9 列表排序
     └─ T4 权限 ── T5/T10
T12 JD 只读（T2+T5 后）
T13 验收（含 workflow + scorer 回归）
```

可并行：T4 ∥ T0；T10 在 T5 后；T6b 在 T6 后或与 T7 并行；T11 在 T6 后。

---

## P2 边界（本 plan 禁止实现）

- Workspace Deduction Rule Set UI/存储
- Agent 2 / scoring step 改为 `appliedDeductions[]`（仍走 Mastra Agent，维分在 compose）
- 代码算维分 / 扣项明细 UI
- 「只重算综合分」运维按钮
- 与 screening 扣项硬对齐校验器
- 新建「政策 Agent」或 Agent tools 查库

P2 依赖产品 **v1 冻结扣分表**（grilling 问题 13）；编排上优先 **改 scoring step 输出 schema + 加强 compose**，而不是另起非 Mastra 流水线。

---

## Risk Notes

| Risk                                       | Mitigation                                                         |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `baseScore` int→decimal 破客户端假设       | 全库 grep `baseScore`；DTO 统一 number；UI `toFixed(1)`            |
| 权限漏配导致 member 可写                   | 矩阵单测 + 路由 requirePermission                                  |
| 无 global 的脏数据                         | ensure 幂等在 resolve 路径也调用一次                               |
| nextStep 被约束后与定性 rationale 略不一致 | rationale 前缀「已按筛选结果调整：」可选 P1                        |
| 列表排序 null 分                           | `NULLS LAST`                                                       |
| Markdown-first 与 Mastra workflow 分叉     | 强制同一 `composeResumeReview*`；两侧单测都传 snapshot             |
| Workflow 调用方漏传 snapshot               | input Zod **required**；仅 generation 边界 resolve，禁止裸调 Agent |
| 在 Mastra Agent / step 内查策略表          | **禁止**；resolve 只在 worker/generation                           |
| 误用 Mastra Scorer 写业务分                | Scorer 仅评测 consistency；业务分只在 compose                      |
| Studio 调试看不到策略                      | snapshot 进 workflow input → observability/trace 可见              |

---

## Execution Handoff

Plan updated with Mastra integration; saved to `docs/superpowers/plans/2026-07-17-resume-scoring-policy-p1.md`.

**Two execution options:**

1. **Subagent-driven (recommended)** — 按 Task 派 subagent，每 Task 后 review
2. **Inline** — 本会话按 Task 顺序实现

哪一种开始 P1 实现即可。

**Two execution options:**

1. **Subagent-driven (recommended)** — 按 Task 派 subagent，每 Task 后 review
2. **Inline** — 本会话按 Task 顺序实现

哪一种开始 P1 实现即可。
