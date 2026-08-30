# 老版本岗位升级为新版结构化评估实施计划

> 状态：已完成代码实现与定向验证；待在已应用新迁移的数据库环境完成全量集成验证。
>
> 本计划允许已发布的老版本岗位选择性进入新版编辑流程，并在再次发布时原地升级为新版。升级后，评估配置冻结，岗位运营设置仍可继续编辑。

## Goal

在不改变岗位 ID、不自动重评历史候选人、不中断老版本岗位正常使用的前提下，为老版本岗位增加一条显式、可放弃、不可逆的新版升级路径。

最终行为：

```text
老版本已发布岗位
  ├─ 继续按老版本运行
  └─ 创建独立升级草稿
       ├─ 保存 / 继续编辑 / 放弃草稿
       └─ 确认发布
            └─ 同一岗位原子切换为新版结构化评估
                 ├─ 评估配置永久冻结
                 ├─ 运营设置仍可修改
                 ├─ 原有候选人保留原评估产物
                 └─ 新评估使用新版结构化配置
```

## Source of truth

- [CONTEXT.md](../../../CONTEXT.md)
- [ADR-0022](../../adr/0022-isolate-legacy-and-structured-resume-evaluation.md)
- [ADR-0023](../../adr/0023-publish-and-freeze-structured-job-evaluation.md)
- [结构化简历评估设计](../specs/2026-07-29-structured-resume-evaluation-design.md)
- [结构化简历评估实施计划](2026-07-29-structured-resume-evaluation.md)

本计划会改变 ADR-0022 中“老版本岗位与新版结构化评估隔离、不可升级”的既有约束，因此实现前必须先更新领域文档并新增 ADR，明确取代该部分决策。ADR-0023 中“新版岗位发布后评估配置冻结”的约束继续成立。

## Confirmed product decisions

以下决策已经确认，实施中不得自行改变：

1. 升级是可选的。仅创建或保存升级草稿，不会改变线上岗位版本；只有确认发布才完成升级。
2. 升级草稿与线上老版本岗位分离。草稿可保存、继续编辑，也可放弃。
3. 新版配置只以老岗位的 `prompt` 作为生成输入；老版本 `description` 和旧筛选规则只读展示，不自动转换为新版配置。
4. 升级发布不可逆，不提供回退到老版本的功能。
5. 升级发布不自动重评历史候选人。
6. 历史候选人继续展示原老版本评估结果；升级后新增候选人使用新版结构化评估。
7. 对历史候选人手动发起重新评估时，以岗位当前版本为目标，即使用新版结构化配置。
8. 手动重评失败时保留原老版本有效结果；重评成功后，该候选人的有效评估产物切换为新版。
9. 候选人必须持久化记录“当前有效评估产物模式”和“本次评估尝试模式”，不能只根据岗位当前版本推断。
10. 老版本分数和新版分数不可直接比较。混合列表中新版结果优先排序，老版本和未评估结果置后并明确标识。
11. 发布升级沿用原岗位 ID 和原 `publishedAt`，新增升级时间和操作人审计字段。
12. 发布升级时使仍在排队或执行中的老版本评估失效，但不删除已经完成的老版本结果。
13. 发布后冻结的是评估归属配置；岗位运营设置继续允许修改。
14. 权限沿用普通岗位编辑权限 `jd.update`，不新增管理员专属权限。

## Domain model and invariants

### New concepts

#### Job Evaluation Upgrade Draft

老版本已发布岗位的独立升级草稿。它保存下一版结构化评估配置，不修改当前线上岗位，也不改变当前候选人的评估行为。

#### Resume Evaluation Artifact Mode

候选人当前有效评估产物的模式：

- `legacy`
- `structured`
- `null`：尚无有效评估产物

UI 展示、分数组成、详情组件和排序分组必须以该字段为准。

#### Resume Evaluation Attempt Mode

候选人当前或最近一次评估尝试所使用的模式：

- `legacy`
- `structured`
- `null`：从未发起评估

它用于表达“正在用新版重评，但当前有效结果仍是老版本”等过渡状态。

### Invariants

- 一个老版本已发布岗位最多只有一个活动升级草稿。
- 创建、保存、生成预览和放弃升级草稿都不影响线上岗位。
- 升级发布必须在一个数据库事务内完成岗位切换、审计、运行中任务失效和草稿删除。
- `evaluationMode = structured` 的已发布岗位不能再修改评估配置。
- 岗位当前模式不能替代候选人产物模式；候选人展示依据自己的 `artifactMode`。
- 评估尝试失败不得覆盖或清空已有有效评估产物。
- 非强制调度不得仅因为岗位升级，就把所有旧候选人视为待重评。
- 新旧分数不能进入同一个数值排序区间。
- 岗位生命周期仍保持 `published`；升级不是“撤回再发布”，也不重置首次发布时间。

## Success criteria

- 老版本岗位可以继续不升级，原行为无回归。
- 老版本岗位可创建、保存、恢复和放弃独立升级草稿。
- 仅 `prompt` 参与生成新版结构化配置。
- 升级发布具有版本校验、输入哈希校验和并发保护。
- 发布成功后，同一岗位原子切换为新版，评估配置不可再编辑。
- 历史候选人的老结果仍能完整展示，并明确标注“老版本结果”。
- 新候选人和被手动重评的历史候选人使用新版评估。
- 新版重评失败不会丢失历史老结果；成功后切换到新版结果。
- 混合候选人列表按照“新版结果、老版本结果、未评估”分组排序，而非直接混排分数。
- 数据迁移、后端领域模块、API、前端交互和并发路径均有自动化测试。

## Phase 0: Update domain decisions before code

### Files

- Modify: `CONTEXT.md`
- Create: `docs/adr/0027-allow-legacy-job-structured-upgrade.md`，如果实施时该编号已被占用，则使用下一个可用编号
- Modify when necessary: `docs/superpowers/specs/2026-07-29-structured-resume-evaluation-design.md`

### Steps

- [x] 在 `CONTEXT.md` 中增加升级草稿、不可逆发布、候选人双模式字段和混合结果展示规则。
- [x] 新增 ADR，明确取代 ADR-0022 中“老岗位不可升级”的部分，不覆盖仍然有效的新旧产物隔离原则。
- [x] 在 ADR 中记录没有采用的方案：原地直接编辑老岗位、自动批量重评、从旧规则自动转换、升级后仍允许修改评估配置。
- [x] 明确“评估配置”和“运营设置”的字段边界，形成后端白名单，而不是前端约定。
- [x] 文档评审通过后再开始数据库迁移。

### Verify

- [x] 文档中的状态机、数据库字段、API 状态码和 UI 文案含义一致。
- [x] ADR 明确升级不可逆、没有自动重评、原 `publishedAt` 保持不变。

## Phase 1: Add persistence without changing runtime behavior

### Files

- Modify: `packages/db-schema/src/schema.ts`
- Modify or create: `packages/db-schema/src/job-description-config.ts`
- Create: generated Drizzle migration under the repository's existing migration directory
- Add migration tests in the existing database/schema test location

### 1.1 Upgrade draft table

新增 `job_description_evaluation_upgrade_draft`，建议字段：

```text
id
organizationId
jobDescriptionId          unique
version                   optimistic concurrency version
name                      editable display name if product keeps it in this flow
prompt                    copied from legacy source, then editable only if confirmed by UI contract
structuredConfig          structured evaluation rule draft
blueprintPreview          latest generated preview, nullable
blueprintInputHash        prompt/config input hash, nullable
blueprintHash             generated blueprint hash, nullable
blueprintGeneratedAt      nullable
createdBy
updatedBy
createdAt
updatedAt
```

约束：

- `jobDescriptionId` 唯一，避免并行存在多个活动升级草稿。
- 所有读写同时校验 `organizationId`，防止跨工作区访问。
- `version` 每次保存递增，用于乐观锁。
- 草稿不保存或接管老 `description`、旧筛选规则、运营字段和岗位编码。
- 如果 `prompt` 在草稿中允许修改，预览和发布必须基于最终保存的 prompt；如果产品只允许只读，则后端仍以草稿快照为发布输入。

### 1.2 Job audit fields

在岗位主记录增加：

```text
evaluationUpgradedAt      nullable timestamp
evaluationUpgradedBy      nullable user id
```

增加升级审计快照表或复用现有审计机制，至少保存：

- 升级前岗位评估模式和老版本配置快照
- 发布的新版结构化配置、蓝图版本和哈希
- 操作人、时间、来源草稿版本

审计记录只用于追溯，不提供产品层回滚入口。

### 1.3 Candidate mode fields

在候选人/岗位候选关系的评估记录上增加：

```text
resumeEvaluationArtifactMode   legacy | structured | null
resumeEvaluationAttemptMode    legacy | structured | null
```

如果当前 schema 将评估结果拆分在关联表中，字段应落在拥有“当前有效结果”和“当前执行状态”的同一聚合边界，避免跨表推断。

### 1.4 Backfill

- 有有效老版本结果、无结构化结果：`artifactMode = legacy`。
- 有有效结构化结果：`artifactMode = structured`。
- 没有有效结果：`artifactMode = null`。
- 有正在执行或最近一次可识别任务：按任务快照回填 `attemptMode`；无法可靠识别时置 `null`，不得猜测。
- 回填不得依据岗位当前模式覆盖已有候选人事实。

### Verify

- [ ] 先写迁移测试，再生成迁移。
- [ ] 在一份包含老岗位、老结果、新结果、运行中任务和空结果的数据库快照上验证回填。
- [ ] 检查生成 SQL 的唯一约束、外键、枚举/check 约束、默认值和索引。
- [ ] 迁移后所有线上读路径行为保持不变。

## Phase 2: Make candidate evaluation version-safe

这一阶段必须先于开放岗位升级入口，否则岗位一旦切换为新版，旧候选人的展示和调度会被错误解释。

### Backend changes

- 修改候选人 DAO：返回持久化的 `artifactMode` 和 `attemptMode`。
- 修改详情和列表 DTO：显式暴露两个模式字段。
- 修改调度器：
  - 非强制调度只要已有有效产物，就不因岗位升级自动重评。
  - 新候选人的目标模式取岗位当前评估模式。
  - 手动强制重评的目标模式取岗位当前评估模式。
- 修改 worker：
  - 任务创建时固定 `attemptMode`，执行过程中不再重新读取并改变目标模式。
  - 成功后原子写入新结果并切换 `artifactMode`。
  - 失败后只更新尝试状态和错误信息，不清空已有结果，不改变 `artifactMode`。
  - 被升级发布失效的老任务不能在稍后回写并覆盖新版状态。

### Frontend changes

- 结果渲染组件以 `artifactMode` 选择老版或新版展示，不以岗位模式选择。
- 当 `attemptMode = structured`、状态为处理中、`artifactMode = legacy` 时，显示“正在使用新版重新评估，当前展示老版本结果”。
- 当新版重评失败且 `artifactMode = legacy` 时，显示失败提示，同时继续展示老结果。
- 老版本结果增加稳定标签，避免用户把它与新版分数直接比较。

### Mixed sorting contract

服务端定义稳定分组键：

```text
1. structured artifact
2. legacy artifact
3. no artifact
```

组内排序：

- 新版组按结构化总分和既有次级排序规则排序。
- 老版本组按老分数和既有次级排序规则排序。
- 未评估组按既有时间或候选人默认排序。
- 前端不自行复刻分组算法，只消费服务端排序结果和模式标签。

### Tests

- [ ] 老岗位 + 老结果：展示老结果。
- [ ] 新岗位 + 新结果：展示新结果。
- [ ] 已升级岗位 + 老结果：仍展示老结果。
- [ ] 已升级岗位 + 老结果 + 新版重评处理中：保留老结果并显示处理中提示。
- [ ] 已升级岗位 + 老结果 + 新版重评失败：保留老结果并显示失败提示。
- [ ] 已升级岗位 + 新版重评成功：切换到新结果。
- [ ] 非强制调度不会批量重评历史候选人。
- [ ] 混合列表排序不直接比较新旧分数。

## Phase 3: Build a deep upgrade domain module

升级涉及草稿、生成、并发控制、审计和原子发布，应收敛为一个有明确契约的领域模块，不把规则分散在 Hono handler 和 React 组件里。

### Suggested layout

```text
apps/server/src/server/routes/
  .../job-descriptions/
    route.ts
    routes/
      upgrade/
        route.ts
        schema.ts
        dao.ts
        application/
          job-evaluation-upgrade.ts
        __tests__/
          job-evaluation-upgrade.test.ts
```

实际父目录以当前岗位路由为准；遵循仓库的 URL 深度拆分规则，从岗位父路由通过 `.route(\"/:id/upgrade\", upgradeRouter)` 挂载。

### Public module contract

模块只暴露用例级接口：

```ts
createUpgradeDraft(...)
getUpgradeDraft(...)
saveUpgradeDraft(...)
generateUpgradeBlueprintPreview(...)
saveUpgradeRuleDraft(...)
discardUpgradeDraft(...)
publishUpgrade(...)
```

调用方不直接操作草稿表，也不自行拼装发布事务。

### Preconditions shared by all write operations

- 操作者具有 `jd.update`。
- 岗位属于当前工作区。
- 岗位为已发布的老版本岗位。
- 岗位尚未升级。
- 请求携带的 `expectedVersion` 与草稿当前版本一致。

### Domain errors

统一定义并由路由映射为明确 HTTP 状态：

```text
JOB_NOT_FOUND
JOB_NOT_LEGACY
JOB_NOT_PUBLISHED
JOB_ALREADY_UPGRADED
UPGRADE_DRAFT_NOT_FOUND
UPGRADE_DRAFT_VERSION_CONFLICT
UPGRADE_PREVIEW_STALE
UPGRADE_INPUT_HASH_MISMATCH
UPGRADE_PUBLISH_CONFLICT
```

### Verify

- [ ] 对应用层接口写表驱动测试，覆盖每个前置条件和冲突分支。
- [ ] 路由测试只验证认证、校验、状态码和错误映射，不重复领域测试。
- [ ] 后端模块不导入 TanStack Start 或 web app 本地模块。

## Phase 4: Add upgrade APIs

### Endpoints

```text
POST   /job-descriptions/:id/upgrade
GET    /job-descriptions/:id/upgrade
PUT    /job-descriptions/:id/upgrade
POST   /job-descriptions/:id/upgrade/evaluation-blueprint-preview
PUT    /job-descriptions/:id/upgrade/evaluation-rule-draft
DELETE /job-descriptions/:id/upgrade?expectedVersion=...
POST   /job-descriptions/:id/upgrade/publish
```

路径前缀以现有 workspace-scoped API 为准。

### API contracts

#### Create draft

- 仅允许老版本已发布岗位。
- 从岗位 `prompt` 创建草稿输入快照。
- 如果草稿已存在，可返回现有草稿作为幂等结果，或返回明确冲突；实现前在 schema 中固定一种行为。建议幂等返回现有草稿，降低重复点击风险。

#### Save draft

- 请求必须包含 `expectedVersion`。
- 保存成功后递增版本。
- 只接受升级草稿字段白名单，不接受线上岗位运营字段。

#### Generate preview

- 只使用草稿中的 `prompt` 和当前新版规则输入。
- 保存 `blueprintInputHash`、`blueprintHash` 和生成时间。
- prompt 或规则变化后，旧预览自动视为 stale。

#### Discard

- 必须带 `expectedVersion`。
- 只删除升级草稿，不修改线上岗位。
- 操作可恢复性：草稿删除后只能重新创建，线上岗位始终未受影响。

#### Publish

请求至少包含：

```text
expectedVersion
expectedBlueprintInputHash
explicitConfirmation
```

响应返回升级后的岗位和必要审计信息，不自动触发批量评估。

### Hono implementation requirements

- 使用 typed Hono RPC 可表达的 JSON endpoint。
- 使用 `zValidator` 校验 JSON/query。
- 每个 `c.json` 显式写状态码，保持客户端类型推断。
- handler 只做认证、解析、调用领域模块和错误映射。

### Tests

- [ ] 未登录、无权限、跨工作区访问。
- [ ] 非老版本岗位、未发布岗位、已升级岗位。
- [ ] 创建、恢复、保存、版本冲突、放弃。
- [ ] 预览输入变化后发布被拒绝。
- [ ] 重复发布只有一个请求成功。

## Phase 5: Implement atomic publish

### Transaction sequence

`publishUpgrade` 必须执行以下单事务流程：

1. 按岗位 ID 和工作区锁定岗位记录。
2. 锁定对应升级草稿。
3. 校验岗位仍为老版本、仍为已发布、尚未升级。
4. 校验 `expectedVersion`。
5. 校验预览存在，且 `expectedBlueprintInputHash` 与当前草稿输入一致。
6. 写入升级审计快照。
7. 更新同一岗位记录：
   - `evaluationMode = structured`
   - 生命周期继续为 `published`
   - 保留原 `publishedAt`
   - 写入 `evaluationUpgradedAt`、`evaluationUpgradedBy`
   - 写入最终 `prompt`、结构化配置、蓝图、版本和哈希
   - 对老 `description` 的处理按 ADR 固定；建议不作为新版评估输入，历史值留在审计快照
8. 失效所有尚未完成的老版本评估尝试：
   - 标记任务取消/失效并清理运行令牌
   - 有旧有效产物的候选人恢复为可展示旧结果的稳定状态
   - 无有效产物的候选人恢复为未评估状态
   - 不清空有效产物，不修改人工流程状态
9. 删除升级草稿。
10. 提交事务。

事务提交后再执行缓存失效、搜索索引刷新等派生操作；这些操作失败不得把数据库回滚成半升级状态，应进入可重试的后置流程。

### Concurrency rules

- 岗位行锁防止两个发布请求同时成功。
- 草稿乐观锁防止用户用旧页面覆盖新草稿。
- worker 回写必须携带任务版本/运行令牌；已被发布事务失效的老任务回写应被拒绝。
- 发布事务开始后，旧版编辑 endpoint 不得再改变评估配置。

### Edit boundary after publish

将岗位修改分成两个明确入口或两个后端白名单：

- 评估配置：新版发布后永久只读。
- 运营设置：按现有权限继续编辑。

旧的通用 `PATCH` 如果包含评估字段：

- 老版本已发布岗位：返回 `JOB_LEGACY_REQUIRES_UPGRADE`，引导进入升级流程。
- 新版已发布岗位：返回现有的“评估配置已冻结”错误。
- 运营字段仍按正常 endpoint 保存。

### Tests

- [ ] 发布保留岗位 ID、生命周期和首次 `publishedAt`。
- [ ] 发布写入升级审计字段和快照。
- [ ] 发布后评估配置被冻结，运营设置可修改。
- [ ] 发布不创建历史候选人的批量重评任务。
- [ ] 排队中、执行中、刚完成的老任务分别得到正确处理。
- [ ] 事务任一步失败时，岗位、草稿和任务状态全部回滚。
- [ ] 两个并发发布请求仅一个成功。
- [ ] 发布与老 worker 回写竞争时，老 worker 无法覆盖结果状态。

## Phase 6: Add frontend upgrade flow

### Location

页面级组件和状态放在：

```text
apps/web/src/components/features/<job-description-feature>/
```

TanStack route 文件只保留 loader、search 校验和薄页面组合，不把升级表单或对话框放进 `src/routes/`。

### Job list states

岗位列表提供三个可辨识状态：

- `老版本`
- `老版本 · 有升级草稿`
- `新版`

老版本岗位操作：

- `编辑运营设置`
- `升级到新版`，有草稿时显示 `继续升级`
- 有草稿时可执行 `放弃升级草稿`

新版已发布岗位：

- 评估配置只读
- 保留运营设置编辑入口

### Upgrade editor

升级编辑器只展示本次升级拥有的字段：

- 老版本 `prompt` 作为新版生成输入
- 新版结构化评估规则编辑器
- 蓝图生成、预览和校验状态
- 老 `description` 和旧筛选规则作为只读参考区

不要把老规则预填成新版硬门槛或评分项，也不要在前端隐式做转换。

### Publish confirmation

确认框必须明确说明：

- 发布后岗位将永久切换为新版。
- 评估配置发布后不可修改。
- 历史候选人不会自动重新评估。
- 历史结果会保留并标记为老版本。
- 以后手动重新评估历史候选人会使用新版规则。

发布按钮在以下情况禁用：

- 草稿未保存或存在版本冲突。
- 蓝图未生成。
- 蓝图输入哈希已过期。
- 结构化规则校验失败。
- 用户未完成显式确认。

### Client data handling

- JSON 请求使用 typed Hono RPC + `rpcFetch`。
- mutation 成功后只失效与岗位列表、岗位详情和升级草稿相关的 query。
- 409 冲突要提示刷新草稿，不自动覆盖服务器版本。
- 发布成功后跳转/刷新到新版只读评估配置视图。

### Frontend tests

- [ ] 老版本岗位显示升级入口，新版岗位不显示。
- [ ] 有草稿时入口变为“继续升级”。
- [ ] 放弃草稿不改变线上岗位状态。
- [ ] 老字段只读，新字段可编辑。
- [ ] 过期预览不能发布。
- [ ] 发布确认完整展示不可逆和不自动重评说明。
- [ ] 发布成功后评估表单只读，运营设置仍可编辑。
- [ ] 混合候选人列表标签、排序和重评过渡状态正确。

## Phase 7: End-to-end scenarios

至少覆盖以下集成场景：

### Scenario A: Ignore upgrade

1. 打开老版本岗位。
2. 不创建升级草稿。
3. 新候选人仍走老版本评估。

### Scenario B: Draft without publish

1. 创建升级草稿并生成新版预览。
2. 离开后重新进入继续编辑。
3. 线上岗位仍为老版本，新候选人仍走老版本。

### Scenario C: Discard draft

1. 保存升级草稿。
2. 放弃草稿。
3. 岗位和候选人行为均不改变；再次进入时重新创建草稿。

### Scenario D: Publish upgrade

1. 老岗位存在已完成老结果和运行中老任务。
2. 发布升级。
3. 岗位原地变为新版，历史老结果保留，运行中老任务失效。
4. 新候选人使用新版评估。
5. 不产生历史候选人的自动批量重评。

### Scenario E: Re-evaluate legacy candidate

1. 对仍展示老结果的候选人手动重新评估。
2. 处理期间继续展示老结果和新版重评提示。
3. 失败时保留老结果。
4. 再次成功后切换为新版结果。

### Scenario F: Concurrent publish

1. 两个会话打开同一草稿。
2. 会话 A 保存或发布。
3. 会话 B 的旧版本保存/发布得到 409，不覆盖 A。

## Phase 8: Verification commands

实施时按最小范围到全仓依次验证。具体测试文件名根据实际模块落点填写，不使用不存在的占位路径直接提交。

```bash
# 数据层和后端定向测试
pnpm --filter @app/server test -- <upgrade-tests>

# Web 定向测试
pnpm --filter @app/web test -- <upgrade-ui-tests>

# 类型检查
pnpm --filter @app/server typecheck
pnpm --filter @app/web typecheck

# 全仓验证
pnpm typecheck
pnpm test
pnpm check
pnpm build
```

数据库变更：

```bash
pnpm db:generate
pnpm db:migrate
```

生成迁移后必须人工检查 SQL，确认没有误删列、重建大表、错误默认值或把现有候选人模式全部按岗位当前模式覆盖。

如果实施涉及 TanStack Router、Start 或 Query API 的新增/调整，编辑前按仓库 `AGENTS.md` 运行对应的 TanStack Intent guidance command。

## Recommended implementation sequence

1. 文档和 ADR，锁定字段边界与状态机。
2. 数据库字段、草稿表和安全回填；此时不开放 UI。
3. 候选人产物/尝试模式兼容和混合展示。
4. 后端升级领域模块及测试。
5. API 和原子发布事务。
6. 前端升级草稿、预览和确认发布流程。
7. 端到端并发、失败恢复和回归验证。
8. 小范围灰度开放升级入口，再逐步扩大。

每一阶段单独提交，避免把 schema、worker、发布事务和 UI 混成无法回滚的大提交。建议使用 Conventional Commits，例如：

```text
docs: define legacy job structured upgrade
feat: persist job evaluation upgrade drafts
fix: preserve candidate evaluation artifact modes
feat: add legacy job upgrade workflow
feat: add legacy job upgrade editor
```

## Rollout and observability

### Rollout

- 先部署候选人双模式字段和兼容读写，再部署发布升级能力。
- 后端能力稳定后再展示前端升级入口。
- 初期可使用已有 feature flag 或工作区白名单灰度；不为此额外设计一套配置系统。
- 回滚应用版本时，旧应用必须能安全忽略新增字段；数据库迁移不应依赖立即回滚。

### Metrics and logs

记录并监控：

- 升级草稿创建、保存、放弃、发布次数。
- 发布冲突、预览过期、输入哈希不匹配次数。
- 发布事务耗时和失败步骤。
- 被失效的老版本评估任务数量。
- 升级后历史候选人的手动重评成功率和失败率。
- 出现“岗位为新版但候选人模式缺失”或“结果存在但 artifactMode 为空”的数据异常。

日志必须包含 `organizationId`、`jobDescriptionId`、`draftVersion`、操作者和 trace/run 标识，但不得记录完整简历、完整 prompt 或结构化评估内容。

## Out of scope

- 自动批量重评历史候选人。
- 从老 `description` 或旧筛选规则自动转换新版规则。
- 老版本和新版分数归一化或直接横向比较。
- 升级后回退到老版本。
- 发布后重新编辑评估配置。
- 新增管理员专属升级权限。
- 因此功能重构无关的岗位、候选人或评估代码。

## Definition of done

- [x] 文档和 ADR 已更新，旧决策的取代关系明确。
- [ ] 迁移可在真实旧数据形态上安全执行，回填结果经过断言。
- [x] 候选人展示、调度和 worker 已与岗位当前模式解耦。
- [x] 升级草稿完全独立于线上岗位，可恢复和放弃。
- [x] 发布升级实现为单事务、可审计且不可逆；数据库并发集成验证待迁移环境执行。
- [x] 发布不自动重评，也不丢失任何已完成老结果。
- [x] 新旧结果在列表和详情中可识别，排序不直接比较分数。
- [x] 发布后评估配置冻结，运营配置仍可正常维护。
- [ ] 定向测试、类型检查、全仓测试、lint 和 build 全部通过。
- [ ] 灰度指标和异常日志可用于确认升级后的线上行为。
