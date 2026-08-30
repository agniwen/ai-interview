# 面试报告数据契约、三路融合与审核闸门工作项拆分

## 简短版（贴项目管理工具用）

目标：把当前按会话生成的松散 AI 评估升级为“每轮一份”的严格三路融合报告，并在不改写飞书人工内容的前提下完成业务一面准入闭环。

- [ ] A1 定义并导出 `InterviewReportV1` 共享 Zod 契约（1d）← 前置闸门
- [ ] A2 建立契约样例、无效输入和 legacy 解析测试（0.5d）
- [ ] B1 审计历史同轮会话、飞书文档、旧评估和证据可信度（1d）← 数据迁移闸门
- [ ] B2 新增轮次报告聚合与不可变版本表、生成迁移（1d）
- [ ] B3 实现报告草稿、版本递增、提交锁定 DAO（1d）
- [ ] C1 将证据快照投影为简历/表单/本轮面试三类证据（1d）
- [ ] C2 改造报告 workflow 与 prompt，输出严格三路融合结构（1d）
- [ ] C3 增加证据引用、来源冲突和覆盖状态的确定性校验（1d）← 质量闸门
- [ ] D1 增加类型化报告查询、重新生成和提交 API（1d）
- [ ] D2 把报告详情页迁移到共享类型并展示来源、证据和冲突（1d）
- [ ] D3 增加草稿重生成、提交确认和提交后锁定交互（1d）
- [ ] E1 将飞书模板改为消费 `InterviewReportV1`（1d）
- [ ] E2 将飞书文档创建从自动通知改为 HR 手动提交（1d）
- [ ] E3 加固双状态机、每轮唯一文档、安全重试和提交后不可修改约束（1d）← 外部副作用闸门
- [ ] E4 统一轮次/候选人删除保护与并发锁协议（1d）
- [ ] F1 增加业务一面准入决定 API 与普通 HR 权限校验（1d）
- [ ] F2 原子落库审核决定、候选人阶段变化和审计记录（1d）
- [ ] F3 增加系统内二选一审核 UI 与时间线展示（0.5d）
- [ ] G1 完成 legacy 兼容、集成回归和并发测试（1d）
- [ ] G2 在飞书测试租户验收并跑全仓校验（0.5d）← 发布闸门

合计约 20 项 / 18.5 人天。建议顺序：A → B → C → D → E → F → G；A、B1、C3、E3、E4 和 G2 未通过时不要进入下一依赖阶段或发布。

---

## 详细版

### 1. 对齐基准 / 目标口径

本计划遵循 [ADR 0018](../adr/0018-use-round-scoped-evidence-backed-interview-reports.md)：

1. 一个 `AI Interview Round` 对应一份 `Interview Report` 和至多一份飞书文档；候选人可以有多轮报告，不建立候选人级聚合报告。
2. 正式报告融合三个来源族：冻结简历、已提交候选人表单、本轮 AI 面试中的候选人陈述。
3. 每条实质性结论至少引用一条可定位的原始证据；综合建议只能引用结论；冲突双方均保留证据。
4. `schemaVersion` 表示契约版本，`reportVersion` 表示同一轮次内的不可变生成版本。
5. 飞书文档由 HR 明确提交时创建。完成首次正文配置并进入 `created` 后，系统不再修改正文、不重新生成该轮报告、不重置或删除该轮；飞书人工内容不回写系统。
6. 普通 HR 可以对可见候选人作出二选一决定：进入业务一面，或不进入并结束淘汰。飞书编辑权限不等同于系统审核权限。
7. 只有候选人的最终有效 AI 面试轮次可以作出准入决定：该轮为 `completed`、`sortOrder` 最大，且候选人现存所有 AI 轮次均已 `completed`；较早轮次不能在后续轮次待开始或进行中时结束候选人流程。
8. 提交人必须从自己已关联的飞书账号中选择一个 provider。`roundId -> feishuProviderId` 在外部调用前持久化；其他 provider 不参与该报告的文档创建、授权或飞书链接通知，也不能为同一轮创建或拥有第二份文档。
9. 每个不可变 report version 使用 `contentKind=v1/legacy` 区分内容契约。恰好关联一份历史文档的 legacy version 进入 `submitted`，可按最终轮规则决定；同轮多文档进入 legacy 专用 `migration_conflict`，经审计的人工主文档映射后才能转 `submitted`。
10. 报告进入 `submitting` 后冻结整个轮次；存在 `submitting/submitted/decided` 报告或 legacy 文档关联时禁止候选人硬删除。

验收指标：

- 新报告写入、读取和 API 返回均通过共享 Zod Schema；报告消费链路中不再出现 `evaluationCriteriaResults as Record<string, unknown>` 或本地宽松类型守卫。
- `available` 来源中的每个 `evidenceRef` 都能解析到当前报告冻结输入中的唯一事实；不存在悬空引用和把 AI 结论再次当证据的情况。
- 必需来源为 `missing` 时提交返回可解释的 409；未配置表单使用 `not_applicable`，不伪造成已分析。
- 同一 `roundId` 并发提交只产生一个系统提交结果和至多一份受系统管理的飞书文档。
- 新报告状态严格遵循 `draft -> submitting -> submitted -> decided`；legacy 迁移额外允许 `migration_conflict -> submitted` 的人工审计转换。文档状态独立遵循 `not_started -> creating -> configuring -> created`。只有能证明文档从未创建的失败使用 `creation_failed` 并可重试同一冻结版本；创建结果不明、ID 落库失败或取得 ID 后任一步失败均使用 `creation_uncertain`，必须人工核对且不得再次调用创建接口。
- 文档 ID 写入后只允许 `configuring` 阶段首次写入正文；一旦配置失败进入 `creation_uncertain`，或成功进入 `created`，生产代码都不再自动调用正文写入接口。通知重发只发送已有链接。
- “进入业务一面”与 `pipelineStage=human_interview` 同事务成功或失败；“不进入”与 `pipelineStage=closed/outcome=rejected` 同事务成功或失败。
- 非最终轮或存在未完成 AI 轮次时，准入决定 API 返回可解释的 409；这不妨碍已完成的较早轮次提交各自的报告和飞书文档。provider 不属于提交人或与报告已绑定值不一致时，提交 API 返回 403 或 409，且不产生外部副作用。
- 报告进入 `submitting` 后，轮次 PATCH/status/reset/单删/批删均返回 409；候选人单删或批删命中锁定报告/legacy 文档时也返回 409，不丢失飞书文档关联。
- 单文档 legacy submitted 轮次可按最终轮规则决定；同轮多文档返回 409，未经人工关联不得自动选择主文档。
- 所有生成、重生成、提交、文档创建失败/成功、最终决定和阶段推进均有操作者、轮次、报告版本、时间和原因可追踪。
- 既有飞书文档不被修改、覆盖或删除。

### 2. 现状摸底

- 当前报告生成由 `interview-summary-job.ts` 在单个 conversation 上运行。证据快照已经冻结简历上下文、表单和 transcript，但 workflow 实际只接收格式化表单、问题和 transcript，简历没有进入评估输入。
- `evaluationCriteriaResults` 在数据库、`@arc/db-schema/interview-session`、DAO、API、前端和飞书模板之间以 `Record<string, unknown>` 传播；前端和通知层各自做不完整的运行时判断。
- `GET /:roundId/reports` 已按 `scheduleEntryId` 查询，但返回该轮全部 conversations；轮次重置会清空 schedule 上的当前 `conversationId`，历史 conversation 仍可能保留。
- 当前摘要成功后会异步自动通知。通知唯一键包含 conversation 和接收人，文档 ID 也存于通知行，因此同一轮的不同 conversation 或不同飞书账号可能产生多份文档。
- 当前支持 `feishu` 与 `feishu-jiguang-hr` 两个 provider，它们使用不同应用凭证和目录；一个用户可能同时关联多个 provider，现有逻辑会逐个账号发送并由各自通知行持有文档。
- 单份飞书文档创建后，当前重试逻辑已经不会改正文，只会移动已有文档并重发卡片。文档包含当前轮次 AI 评价、简历链接和人工面试填写区，并给接收人 `edit` 权限。
- 当前只有通知的 `pending/sent/failed`，没有报告草稿/提交状态和业务一面准入决定。候选人阶段转换、可见范围校验和 `interview_audit_log` 已存在，可复用但需要与审核决定放进同一事务。

最关键的空白是：当前文档所有权属于“conversation × recipient 的通知”，而目标要求“round 的唯一报告和唯一文档”。在迁移前必须先统计历史同轮多会话、多文档和无法解析的旧评估，不能直接加唯一约束或自动挑选一份文档。

### 3. 前置风险 / 闸门

#### 闸门 A：V1 契约必须先冻结

- 后续数据库、prompt、API、Web 和飞书模板只能依赖同一份 Schema。
- 若简历无法提供页码级引用，V1 降级为结构化 `fieldPath + valueExcerpt`；不能捏造页码或原文位置。
- 契约未通过正反例测试前，不创建迁移。

#### 闸门 B：历史文档基数审计

- B1 输出每个 round 的 conversation 数、有效报告数、飞书文档数、provider 分布、legacy 解析状态和证据可信度，不输出候选人 PII。证据至少区分 `verified_original` 与 `legacy_unverified`：只有原始 evidence snapshot 的 conversation、schedule entry、context snapshot 均可与目标轮次相互校验时才算前者。
- 若发现同轮多文档，不删除、不覆盖、不自动选主文档；记录为迁移异常，保留旧通知行为的只读展示，仅对无冲突的新提交启用“一轮一文档”。
- 恰好关联一份已有文档的轮次写入 `contentKind=legacy` 的不可变 typed version，生命周期使用 `submitted`，不重新生成正文；它可以在满足最终轮规则时作出准入决定。同轮多文档使用 `migration_conflict`，只有经审计的人工 mapping 选定唯一主文档后才能转 `submitted`。

#### 闸门 C：证据完整性

- 模型输出通过 Zod 但引用不存在，仍算生成失败。
- 允许一次基于校验错误的结构化重试；仍失败则保留上一成功草稿或显示失败，不能降级成无证据正式报告。
- `missing` 与 `not_applicable` 必须由确定性来源装配逻辑产生，不能交给模型猜测。

#### 闸门 E：飞书外部副作用

- B2 迁移前必须冻结报告状态机和文档创建状态机；报告进入 `submitting` 后选中版本、provider 和整个 round 即锁定。只有文档 ID/URL 已保存且正文写入、目录移动、初始授权全部成功后才能进入 `submitted`。
- 提交请求必须携带提交人已关联的 `feishuProviderId`，并在外部调用前写入 round-owned report。文档创建、目录移动、授权和通知链接均使用该 provider；其他 provider 不得创建第二份文档。
- 提交必须在短数据库事务中完成锁/状态 claim 并提交后，才能调用飞书；外部网络请求期间不得持有数据库事务。所有相关写路径统一按 candidate → stable-ordered rounds → report 的顺序加锁，并在锁内重新检查 guard。
- 飞书创建接口返回 `documentId` 后，先用独立短事务保存 ID/URL，再写正文、移动目录，最后授权首批编辑者；授权前不向人暴露文档。
- 只有能证明创建请求未产生文档的失败才进入 `creation_failed`，并且只允许重试同一冻结版本；报告内容不能退回草稿或换 provider。
- 创建响应不确定、返回 ID 但数据库确认失败，或取得 ID 后正文/移动/授权任一步失败，均进入 `creation_uncertain` 人工核对，不能盲目重试创建或正文写入。
- 人工核对入口必须受权限保护并记录操作者、依据和文档 ID；只能在确认完整文档后转 `created/submitted`，或在证明文档不存在后转 `creation_failed`。已存在但不完整的文档保持人工处置，不得创建第二份。
- 无测试租户或有效凭证时，只能完成 mock 验证，不能把 G2 标记为完成。

### 4. 分阶段工作项

#### 阶段 A：统一报告契约

| ID  | 工作项                                                                                                                                                                                                                                                                                                                     | 估时 | 交付物                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------ |
| A1  | 在 `packages/shared/src/interview/report.ts` 定义 `InterviewReportV1`：轮次/会话/快照身份、`schemaVersion`、`reportVersion`、三类 `sourceCoverage`、可判别 `evidenceRef`、`conclusions`、`conflicts`、综合建议和生成元数据；所有对象使用严格 Zod 结构。API 报告 DTO 归 `@arc/shared`，`@arc/db-schema` 不反向依赖 shared。 |   1d | 共享 Schema、推导类型和公开导出；一份经过评审的合法 JSON 样例。                |
| A2  | 为契约补正反例和 legacy 解析器：拒绝未知来源、悬空字段形状、无证据结论和错误版本；把当前已知 evaluation 结构解析为显式 `LegacyInterviewEvaluation`，无效数据返回类型化错误而非原始 JSON。                                                                                                                                  | 0.5d | `report.test.ts`、legacy fixtures、类型检查通过；报告 API 不需要本地类型守卫。 |

#### 阶段 B：轮次报告持久化与历史闸门

| ID  | 工作项                                                                                                                                                                                                                                                                                                                                                                                                      | 估时 | 交付物                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------ |
| B1  | 编写只读审计脚本，按 `scheduleEntryId` 统计 conversation、ready evaluation、通知、provider 和不同飞书文档 ID；同时用 legacy Schema 统计可解析率，并按 conversation/round/context snapshot 的可校验关系输出 `verified_original` 或 `legacy_unverified`。                                                                                                                                                     |   1d | `.eval/` 下无 PII JSON/Markdown 报告；重复文档 round、provider 分布、证据可信度和迁移决策输入。        |
| B2  | 在 `@arc/db-schema` 增加 round-owned `interview_report` 与不可变 `interview_report_version`；`contentKind=v1/legacy` 属于 version，report 保存正常生命周期及 legacy-only `migration_conflict`、文档创建状态、`feishuProviderId`、文档和提交/决定元数据。report→round 外键使用 restrict 防止绕过服务层级联删除；JSONB 保持 `unknown`，不反向依赖 `@arc/shared`；用 `pnpm db:generate` 生成迁移和 relations。 |   1d | Drizzle schema、生成迁移、状态/check 约束、restrict 外键、唯一索引和 DB 类型检查；不修改历史飞书正文。 |
| B3  | 在 reports 路由目录内新增 DAO，TDD 实现创建首个草稿、内容变化才递增版本、读取当前版本、提交 compare-and-set、按 candidate→rounds→report 加锁、进入 `submitting` 后冻结版本/provider/round、分阶段记录文档 ID 与状态、文档配置确认后转 `submitted`、提交后禁止重生成。原始 JSONB 只在 DAO 内以 `unknown` 接收并立即用 `@arc/shared` Zod Schema 解析；提供显式删除 draft report 的事务内方法。                |   1d | DAO + 数据库测试；状态转换表和锁协议可执行，API/前端永不接触未解析 JSON。                              |

#### 阶段 C：真正的三路融合

| ID  | 工作项                                                                                                                                                                                                                                                                                                            | 估时 | 交付物                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------- |
| C1  | 从可信的 `Interview Evidence Snapshot` 构建确定性的 typed input：简历字段路径与摘录、表单模板/版本/问题/答案、本轮 transcript 的 turnId/turnIndex/time；当前 snapshot turn 没有 ID，统一按 `${conversationId}:turn:${zeroBasedIndex}` 派生 `turnId`，对外 `turnIndex` 固定为 1-based。计算三类覆盖状态和证据 ID。 |   1d | 纯投影函数、稳定 locator/覆盖状态测试、三类证据 fixture；无模型调用。   |
| C2  | 改造 `interview-report-workflow.ts` 和 `interview-report.ts`，让模型接收 typed 三路输入并直接输出 `InterviewReportV1` 的结论、证据引用和冲突；摘要与报告继续允许独立失败，但只有合法报告可成为草稿。                                                                                                              |   1d | 新 workflow 输入输出、prompt/few-shot、单元测试；简历确实进入生成输入。 |
| C3  | 增加生成后确定性校验：引用存在性、来源族一致性、当前轮次约束、每结论至少一条证据、综合建议只引用结论、冲突引用双方；加入缺表单、信息冲突、空 transcript 和越权引用回归用例。                                                                                                                                      |   1d | provenance validator、错误码、重试策略和回归测试；闸门 C 通过。         |

#### 阶段 D：类型化 API 与报告页面

| ID  | 工作项                                                                                                                                                                                                                                                                                                                    | 估时 | 交付物                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------- |
| D1  | 在 `routes/interviews/routes/reports/` 增加当前报告查询、草稿重生成、提交接口；使用 `zValidator`、显式状态码、typed Hono RPC 和现有 visibility scope。报告 API DTO/客户端导入迁到 `@arc/shared`；保留 transcript/attempt 查询，但其 legacy evaluation 通过 typed adapter 返回，不再复用 `@arc/db-schema` 的宽松报告 DTO。 |   1d | 类型化 route/DAO tests、RPC 推断通过、409/404/403 契约明确，无包循环依赖。 |
| D2  | 报告详情改用共享类型，展示来源覆盖、逐条结论、三类证据、冲突和综合建议；证据点击继续定位 transcript/录音，简历与表单证据打开对应上下文。删除报告相关类型断言和宽松 guard。                                                                                                                                                |   1d | 类型化报告 UI、来源标签与证据跳转测试；现有关键词高亮不回归。              |
| D3  | 增加“重新生成草稿 / 提交审核”交互：提交前显示版本和来源完整性确认；进入 `submitting` 后隐藏重生成、重置和删除入口，显示飞书创建状态、已有链接或锁定原因。                                                                                                                                                                 |   1d | 前端状态流、mutation cache 更新、错误提示和组件测试。                      |

#### 阶段 E：每轮唯一飞书文档

| ID  | 工作项                                                                                                                                                                                                                                                                                                                                    | 估时 | 交付物                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | 把 `interview-evaluation-doc.ts` 的输入改为 `InterviewReportV1`，按三路来源和逐条证据生成正文，并保留当前业务一面/二面、HRD、CEO 人工填写区；删除 unknown 读取辅助函数。                                                                                                                                                                  |   1d | typed 飞书模板、block snapshot/结构测试、现有人工区不变。                                                                                       |
| E2  | 移除报告 ready 后自动建文档；提交服务校验提交人关联的 `feishuProviderId`，在已提交的 claim 中固定 provider。拆分 `createFeishuDocx`：创建空文档返回 ID → 立即短事务落库 → 写正文 → 移动目录 → 最后授权；完成后才标记 submitted 并通过同 provider 发送已有链接。通知继续按接收人记录，但不拥有或创建文档；其他 provider 不得触发文档创建。 |   1d | 分阶段手动提交链路、provider/授权/各阶段失败测试、通知重构、每轮单文档测试；人获得 edit 权限前正文已完成。                                      |
| E3  | 加固外部副作用：并发 submit claim、报告/文档双状态机、仅“证明未创建”的 `creation_failed` 同版本安全重试；所有取得或可能取得文档 ID 的失败进入 `creation_uncertain`。增加受权限保护的人工核对 API，记录依据、文档 ID 和审计；源码只允许 `configuring` 首次写正文，失败后或 `created` 后禁止自动创建及正文重试。                            |   1d | 创建/落库/正文/移动/授权失败注入、进程崩溃恢复、人工核对转换、跨 provider 和源码边界测试；闸门 E 外部副作用部分通过。                           |
| E4  | 统一候选人和轮次变更保护：PATCH/status/reset/轮次单删/批删、候选人单删/批删及最终决定全部采用 candidate→stable-ordered rounds→report 锁顺序，并在锁内重查 guard。`submitting` 起禁止全部 round mutation；候选人删除遇到锁定报告或 legacy 文档返回 409，只有纯 draft 报告可在同事务显式删除后继续；前端同步禁用相关入口并展示锁定原因。    |   1d | 事务化 mutation service、候选人/轮次删除路由和 UI 改造、restrict 错误映射，以及 PATCH/reset/delete/decision 竞争回归；闸门 E 数据保护部分通过。 |

#### 阶段 F：业务一面准入与审计

| ID  | 工作项                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 估时 | 交付物                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------- |
| F1  | 增加 `advance_to_business_interview` / `do_not_advance` 决定 Schema 与 API。两种决定都要求 `interview.update` 和 recruiting visibility；只有进入业务一面额外要求 `humanInterview.create`，淘汰不要求主管权限。普通 HR 可审核自己可见的报告，包括自己提交的报告，飞书编辑身份不参与授权。决定前确定性校验报告为 `submitted`、round 为 `completed`/`sortOrder` 最大且所有现存 AI rounds 均为 `completed`；V1 与恰好关联一份文档的 legacy 均可决定，多文档 conflict 禁止。 |   1d | 权限矩阵/route tests、普通 HR 淘汰、推进权限、V1/legacy 单文档、多文档冲突、重复决定、较早轮/未完成后续轮/非 AI 阶段拒绝。 |
| F2  | 把现有 `transitionCandidateStage` 的事务体提取为接受 `tx` 的内部原子函数，公共入口仍负责独立事务和提交后缓存失效。报告决定服务在一个外层事务内按 candidate→stable-ordered rounds→report 加锁并在锁内重查 E4 guard，复用同一 transition guard：进入业务一面写 review + `human_interview`；不进入写 review + `closed/rejected`、`previousStage=ai_interview` 和必填原因；不自动创建真人面试轮次。                                                                         |   1d | 无嵌套事务的原子 service/DAO、与 PATCH/reset/delete 的并发决定测试、失败回滚测试、候选人阶段不变量保持。                   |
| F3  | 候选人详情增加二选一审核区，时间线增加报告生成、提交、飞书创建和准入决定文案；展示操作者、版本、时间和原因。                                                                                                                                                                                                                                                                                                                                                            | 0.5d | 审核 UI、timeline 映射和组件/DAO 测试。                                                                                    |

#### 阶段 G：兼容、回归与发布

| ID  | 工作项                                                                                                                                                                                                                                                                                                                                                                                                          | 估时 | 交付物                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------ |
| G1  | 根据 B1 结果执行 legacy 迁移：单文档 round 建立 `contentKind=legacy` 的不可变 typed version、`submitted` 生命周期及只读文档关联，可按最终轮规则决定；多文档 round 进入 `migration_conflict` 并禁止决定，仅接受经审计的人工主文档 mapping。无文档旧报告只通过 typed legacy adapter 展示；只有 `verified_original` 证据可重新生成 V1，`legacy_unverified` 永久只读。补完整生成→提交→通知→决定集成测试和并发回归。 |   1d | 可 dry-run/backfill 脚本、人工 mapping 输入/审计、证据可信度/文档基数迁移报告、legacy 决定测试和端到端回归。 |
| G2  | 在飞书测试租户验证一次创建、编辑权限、目录移动、人工填写后系统不改正文和通知重发；随后运行 shared/backend/web 定向测试及 `pnpm fix && pnpm typecheck && pnpm test`。                                                                                                                                                                                                                                            | 0.5d | 手工验收记录、测试日志、发布/回滚检查表；闸门 G 通过。                                                       |

### 5. 合计与建议排期

| 阶段               | 工作项 |      估时 |
| ------------------ | -----: | --------: |
| A 统一契约         |      2 |      1.5d |
| B 持久化与历史闸门 |      3 |        3d |
| C 三路融合         |      3 |        3d |
| D API 与页面       |      3 |        3d |
| E 飞书文档         |      4 |        4d |
| F 准入与审计       |      3 |      2.5d |
| G 兼容与发布       |      2 |      1.5d |
| **合计**           | **20** | **18.5d** |

建议按 4 个可独立验收的里程碑推进：

1. **M1（A+B，4.5d）**：契约、历史审计和版本存储完成，但不切生产生成链路，不单独部署到生产。
2. **M2（C+D，6d）**：系统内可生成、查看和提交前确认三路融合草稿；在 E2 切断自动建文档前仅可由默认关闭的 feature flag 验收，不独立开放生产流量。
3. **M3（E，4d）**：切换为手动提交、每轮唯一飞书文档，并封住所有提交后改写和级联删除路径。
4. **M4（F+G，4d）**：二选一准入闭环、legacy 兼容和发布验收。

估时是单人顺序实施的工程判断，不含等待飞书测试租户、生产数据审计审批或产品验收的日历时间。

### 6. 待定项

1. **同一轮重置后的 conversation 选择**：计划默认以 `studio_interview_schedule.conversation_id` 当前指向的、最新 `summaryStatus=ready` 会话生成草稿；历史 attempts 只用于查看和审计，不做内容合并。若要合并多次 attempt，需要修改 V1 契约和 C1。
2. **飞书初始编辑者**：provider 已固定为点击提交的 HR 从自己的关联账号中选择；仍需在 E2 开工前确认同 provider 下首批 `edit` 权限只给提交人，还是同时给候选人招聘记录创建者或固定审核人组。
3. **历史同轮多文档**：处理策略必须以 B1 实测结果为准；本计划只承诺保留和隔离，不承诺自动合并或删除。

### 7. 关键文件索引

- `packages/db-schema/src/interview-session.ts`：当前报告 DTO 与 `Record<string, unknown>` 来源。
- `packages/db-schema/src/schema.ts`：conversation、snapshot、notification、audit 与候选人阶段表。
- `packages/shared/src/interview/`：新共享报告 Schema 的目标目录。
- `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/interview-report.ts`：当前评估 Schema 与 prompt。
- `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/workflows/interview-report-workflow.ts`：当前报告 workflow。
- `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/interview-summary-job.ts`：当前报告持久化和自动通知触发点。
- `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/evidence-snapshot.ts`：三路冻结输入的现有基础。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/routes/reports/`：轮次报告 API 与新 DAO 的归属目录。
- `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/feishu-interview-notifications.ts`：当前 per-conversation/per-recipient 文档所有权与通知逻辑。
- `apps/ai-recruitment-copilot-backend/src/server/routes/feishu/utils/interview-evaluation-doc.ts`：飞书报告模板。
- `apps/ai-recruitment-copilot-backend/src/server/routes/feishu/utils/feishu-docx.ts`：飞书文档创建、授权和移动。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/detail-route.ts` 与 `routes/studio/routes/interviews/route.ts`：轮次 PATCH、reset、单删和批删保护。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`：候选人单删和批删保护。
- `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/utils/candidate-stage-transition.ts`：候选人阶段规则和事务入口。
- `apps/ai-recruitment-copilot/src/components/features/studio/interviews/interview-detail/evaluation-results.tsx`：当前宽松报告渲染。
- `apps/ai-recruitment-copilot/src/components/features/studio/studio-person-detail-controller.tsx`：当前报告选择和 unknown 类型断言。
- `CONTEXT.md`：本轮确认后的领域词汇。
