# 招聘新表合并与旧数据迁移（merge-new-table）

更新：2026-09-07。本文整理本次 `studio_interview` 拆分的已确认决策、实现、开发库执行记录及后续环境的切换步骤。“merge”指代码与新数据模型的集成，不代表合并候选人身份或覆盖旧表。

## 1. 目标与边界

旧 `studio_interview` 同时承载人才信息、简历、评估、面试与招聘进度，字段生命周期不同，更新和关联容易互相影响。本次将它拆成独立业务实体，并复制必要附属表。

- 新建目标表 → 回填与校验 → 切换全部业务读写。旧主表与附属表数据保留，不做双写，不为新记录补旧表占位行。
- 一条旧招聘记录生成独立人才和简历，不按姓名、手机号或邮箱自动合并。
- 初始 schema 迁移只建新表；切换后另经授权解除旧档案指向在线资源的外键，防止岗位、用户等删除时级联改动旧档案。这个后续操作改变约束，不改变旧行数据。
- 开发库已执行迁移；本文与代码提交不代表生产库迁移或部署。

决策依据：[ADR-0036](../docs/adr/0036-copy-recruiting-data-into-independent-tables.md)、[拆分计划及执行记录](../docs/plans/2026-09-05-recruiting-record-split.md)。

## 2. 新模型的职责

| 目标表                             | 保存什么                                       | 主要来源                         |
| ---------------------------------- | ---------------------------------------------- | -------------------------------- |
| `candidate`                        | 工作区内人才身份、联系方式                     | 旧主表人才字段                   |
| `candidate_resume`                 | 简历版本、文件、正文、结构化资料与解析状态     | 旧主表简历字段                   |
| `recruiting_record`                | 人才、简历、岗位关联；当前节点、最终结果、版本 | 旧主表招聘字段                   |
| `recruiting_node_state`            | 每个节点的有效状态、结论、当前业务依据         | 旧进度、轮次、Offer 及上下文推断 |
| `recruiting_resume_evaluation`     | 历史评估版本、成功结果、失败与排队尝试         | 旧主表、评估版本及失败表         |
| `recruiting_interview_preparation` | 面试准备信息                                   | 旧主表相关字段                   |
| `recruiting_fulfillment`           | 流水、背调、入职信息与选定 Offer               | 旧主表履约字段                   |
| `recruiting_material`              | 材料元数据与对象存储引用                       | 无源数据时保持空表               |
| `ai_interview_round`               | AI 面试轮次、邀请、执行状态、人工评价          | `studio_interview_schedule`      |
| `human_interview_round`            | 真人轮次、复试或终试类型、评价                 | 旧真人轮次表                     |
| `recruiting_offer`                 | Offer 版本、发送、接受或拒绝                   | 旧 Offer 草稿表                  |
| `recruiting_event`                 | 审计、流程变更及迁移来源快照                   | 旧审计日志及新事件               |

主表保存具体节点，大阶段由共享规则计算。节点唯一键为 `(recruiting_record_id, node)`；“面试报告中曾经通过”不等于“当前节点有效通过”。

核心定义：[schema](../packages/db-schema/src/schema.ts)、[relations](../packages/db-schema/src/relations.ts)、[招聘事务](../packages/database/src/recruiting-pipeline.ts)、[只读投影](../packages/database/src/recruiting-read-model.ts)。投影用于维持部分现有传输字段，不读取旧业务表，也不能直接当作写入表。

### 必要附属表一起复制

不是只替换主表外键。AI 会话、真人会议、表单、通知、上传批次等也复制到新模型，否则新招聘记录仍需依赖旧主表。

以下使用 Drizzle 导出名，完整可执行映射以 [model.ts 的 tableCopies](../apps/server/src/scripts/recruiting-migration/model.ts) 为准：

| 旧表导出名                               | 新表导出名                             |
| ---------------------------------------- | -------------------------------------- |
| `candidateFormSubmission`                | `recruitingFormSubmission`             |
| `humanInterviewDocumentSync`             | `humanInterviewEvaluationDocumentSync` |
| `interviewAuditLog`                      | `recruitingEvent`                      |
| `interviewContextSnapshot`               | `recruitingContextSnapshot`            |
| `interviewConversation`                  | `aiInterviewConversation`              |
| `interviewConversationTurn`              | `aiInterviewConversationTurn`          |
| `interviewEvidenceSnapshot`              | `recruitingEvidenceSnapshot`           |
| `interviewNotification`                  | `recruitingNotificationDelivery`       |
| `interviewNotificationEvent`             | `recruitingNotificationEvent`          |
| `interviewQuestionTemplateBinding`       | `recruitingQuestionTemplateBinding`    |
| `mailIngestMessage`                      | `recruitingMailMessage`                |
| `meetingRecruitingContext`               | `recruitingMeetingContext`             |
| `resumeDuplicateMatch`                   | `recruitingDuplicateMatch`             |
| `resumeJobMatchCandidate`                | `recruitingJobMatchCandidate`          |
| `resumeJobMatchRun`                      | `recruitingJobMatchRun`                |
| `resumePoolImport`                       | `recruitingPoolImport`                 |
| `resumeSemanticIndex`                    | `recruitingSearchIndex`                |
| `resumeUploadBatch`                      | `recruitingUploadBatch`                |
| `resumeUploadBatchItem`                  | `recruitingUploadBatchItem`            |
| `studioHumanInterviewEvaluationSnapshot` | `humanInterviewEvaluationSnapshot`     |
| `studioHumanInterviewMeeting`            | `humanInterviewMeeting`                |
| `studioHumanInterviewMeetingEvent`       | `humanInterviewMeetingEvent`           |
| `studioHumanInterviewMeetingInterviewer` | `humanInterviewMeetingInterviewer`     |
| `studioHumanInterviewMeetingRound`       | `humanInterviewMeetingRound`           |
| `studioHumanInterviewRound`              | `humanInterviewRound`                  |
| `studioHumanInterviewRoundInterviewer`   | `humanInterviewRoundInterviewer`       |
| `studioInterviewNotificationRecipient`   | `recruitingNotificationRecipient`      |
| `studioInterviewSchedule`                | `aiInterviewRound`                     |
| `studioOfferDraft`                       | `recruitingOffer`                      |
| `studioRoundEmailLog`                    | `recruitingRoundEmailLog`              |

## 3. 身份、关系与外键

- 招聘记录、AI/真人轮次、邀请、会话和外部会议保留原有身份；邀请 token 不重建。
- 新增人才、简历等身份用稳定映射生成，重跑得到相同 ID。迁移不依赖随机生成后人工对照。
- 复合外键校验同一工作区、同一招聘记录的归属，避免将他人的轮次、材料或 Offer 设为有效依据。
- Drizzle `relations` 提供查询关系；数据库外键提供真实完整性约束，两者不是替代关系。
- 循环引用分两步写入：先插入基础行，再补 `ai_interview_round.conversation_id`、招聘记录当前评估及活跃评估指针。全部在同一事务中完成。
- 岗位、用户、工作区、成员、邮箱账号、会议的业务引用检查使用新表。独立共享资源不因为被引用就全部复制。

## 4. 历史数据如何映射

### 阶段和评价

当前流程节点为：

`screening → ai_interview → second_interview → final_interview → income_proof → offer → background_check → onboarding`

结束是招聘记录的最终状态，另存结束前节点和原因。Offer 的谈薪、待发出、待回复属于同一节点的处理状态；不能把所有二级筛选 tab 都理解成可推进节点。

历史映射采用明确值优先、上下文推断其次：明确终面/终试归终试；其他名称结合原阶段、排期、顺序等推断，并保存理由。不能从“已经到 Offer”反推每次面试都通过；无法证明的前置结果保留未知或跳过，不伪造评价。

评估 artifact 按原契约原样复制，保留历史版本、最近成功结果与失败/排队尝试的区别。迁移不重新运行 AI 评估，也不让 AI 推荐自动修改招聘人员的筛选决定。

### 重复执行与保护

迁移台账记录来源身份、映射哈希和目标行哈希。首次复制后逐字段核对；重跑只校验，不覆盖已有行。以下情况会停止：源数据变化、映射变化、目标已经被业务修改、目标被删除、存在无台账的同 ID 行。

旧主表完整快照保存在迁移事件的 `legacySource`，仅供历史审计，不作为在线业务回填来源。新系统启用后，迁移脚本不是持续同步工具。

## 5. 已完成的开发库迁移

以下数字是 2026-09-05 切换时的历史验收结果，不是当前实时表计数。之后的新业务及 E2E 操作已改变目标数据。

| 项目                  | 当时结果                              |
| --------------------- | ------------------------------------- |
| 目标数据库            | `ainterview-dev`                      |
| 新表                  | 39 张，其中 38 张业务表、1 张迁移台账 |
| 新表外键              | 144 条                                |
| 旧招聘记录            | 1,802 条，不合并人才                  |
| 节点状态              | 14,416 条                             |
| 评估                  | 1,888 条                              |
| AI / 真人轮次 / Offer | 199 / 65 / 7 条                       |
| 目标业务行 / 台账行   | 各 64,892 条                          |
| 切换前幂等重跑        | 新增 0、修改 0                        |

对 33 张招聘源表及独立邮箱账号查阅表保存数据库端计数与 SHA-256，迁移前后相同。大 JSON 经数据库内部 `INSERT SELECT` 复制，避免跨驱动的大参数问题，不截断内容。1 条缺少正向轮次引用的 AI 会话根据同组织、同记录的唯一反向指针补齐；1 条排队评估保留原 runId 和状态，没有重发任务。

迁移文件：

1. [split_recruiting_tables](../apps/web/drizzle/20260905072558_split_recruiting_tables/migration.sql)：仅新增目标 schema。
2. [detach_recruiting_archive](../apps/web/drizzle/20260905095000_detach_recruiting_archive/migration.sql)：后续授权解除 33 张档案表指向在线资源的 72 条外键；档案内部约束和行数据保留。

3. [retire_recruiting_archive_dependencies](../apps/web/drizzle/20260907023000_retire_recruiting_archive_dependencies/migration.sql)：补充归档 25 条旧报告/版本并解除遗漏依赖，见第 9 节。

历史计数与摘要见[脱敏回填报告](../docs/plans/2026-09-05-recruiting-backfill-report.json)。含候选人资料的源缓存不进入仓库。

## 6. 在其他环境实施时的顺序

1. 核对数据库身份、备份和恢复方案；保留源/目标基线。工具目前只支持显式指定的开发库，不能直接拿以下命令操作生产。
2. 暂停旧 Web/Server 写入及 Worker、定时任务、文档同步等消费者，处理进行中的面试。系统无人打开页面不代表后台已停止。
3. 审核并执行目标 schema 迁移，再做只读预检。不要直接执行包含其他 schema 漂移的自动生成 SQL。
4. 审核含糊节点映射、孤立引用与目标冲突；必要时提供显式映射覆盖。
5. 在维护窗口执行复制与完整性校验；可先用 `--rollback-test` 验证事务后回滚。
6. 提交回填后、恢复新业务写入前执行只读重跑，确认一致性。
7. 一次性切换 Server、Web、Worker、会议处理、简历处理、Agent 回调和招聘助手。不得留下旧消费者继续写旧表。
8. 验证新创建、导入、面试、报告、评价、Offer、结束、回退及删除，然后恢复消费者。复制历史数据不重放邮件、短信、邀请或会议创建。

工具：[migrate-recruiting-data.ts](../apps/server/src/scripts/migrate-recruiting-data.ts)，操作说明：[README](../apps/server/src/scripts/recruiting-migration/README.md)。从仓库根目录执行：

```sh
# 只读预检
apps/server/node_modules/.bin/tsx apps/server/src/scripts/migrate-recruiting-data.ts \
  --database ainterview-dev --infer-legacy-nodes \
  --report /tmp/recruiting-preflight-report.json

# 完整执行后回滚，适用于切换前验证
apps/server/node_modules/.bin/tsx apps/server/src/scripts/migrate-recruiting-data.ts \
  --database ainterview-dev --infer-legacy-nodes \
  --report /tmp/recruiting-rollback-test.json --apply --rollback-test

# 经审核后正式复制
apps/server/node_modules/.bin/tsx apps/server/src/scripts/migrate-recruiting-data.ts \
  --database ainterview-dev --infer-legacy-nodes \
  --source-cache /tmp/recruiting-private-source-cache.json \
  --report /tmp/recruiting-migration-report.json --apply
```

工具获取迁移 advisory lock、源表 SHARE 锁和目标表 SHARE ROW EXCLUSIVE 锁；错误会回滚整个事务。锁随事务结束释放，不代替服务停写。私有源缓存按 `0600` 创建；原始缓存和未经脱敏的报告不要提交。

## 7. 切换后的业务约定与本次修复

- 人才库直接进入 AI 初面：自动通过人工筛选并创建 AI 轮次；直接进入复试：筛选通过、AI 初面记为跳过。历史 `human_interview` 输入归一为 `second_interview`。导入已经成功而 AI 轮次创建失败时，返回已导入记录和明确提示，不误报整个导入失败。
- AI 末轮人工确认通过与进入复试在一个事务内完成；同批还有 AI 轮次则继续 AI。权限或岗位不满足时整体回滚。
- 回退恢复同一招聘记录，不创建新周期。上游结果保留；目标原有效面试已完成时，恢复为待重新确认，清除当前结论；下游结果失效并保留历史。未完成或无关历史轮次不会自动恢复为有效结果。
- 通知失效、旧回调、旧邀请和旧评估回写均需核对当前有效依据；重复报告允许保存材料，但不能覆盖已确认的节点结论。
- 删除招聘记录清理新模型关联和待处理上传，防止迟到任务重新创建；人才身份、简历资产按既定保留规则处理。旧档案不随新业务删除级联变化。
- 所有人工推进、确认、结束及回退写入活动记录。列表筛选基于真实节点、状态、结果，关闭后通过关闭前状态区分谈薪和发 Offer。
- 详情 tab 映射：AI 初面→AI 面试，复试/终试→真人复面，流水/Offer/背调→Offer；无专属 tab 时回概览。当前 tab 支持统一刷新。
- Agent 的本机 HTTP 回调绕过系统代理；远端地址保留环境配置。该修复与重复报告防护均有回归测试，但不能据此认定某次历史 500 的唯一原因。未成功入库且无完整原始来源的对话不能凭日志片段补造。

## 8. 验证与回滚边界

代码包含源表运行时边界检查、迁移转换、隔离数据库完整性、节点推进/回退/删除、人才库导入、AI 回调和 UI 交互等回归测试。集成测试必须使用隔离测试库，不能把开发业务库当作可清理的测试库。

[全流程 E2E 报告](../docs/reports/2026-09-05-recruiting-e2e/report.md)记录当时的浏览器推进与样例；后续 AI 自动进入复试、回退重评、tab 映射、统一刷新及回调修复属于更新行为，以当前代码和测试为准。E2E 模拟面试完成状态，未实际发送邮件或短信，不能把它等同于外部服务全链路验收。

切换前校验失败：回滚复制事务，继续使用旧系统。切换后新表已有业务写入：先保护新数据，优先修复新体系；不能直接回退旧代码并丢弃新表增量。保留的旧表是历史档案，不是新系统的实时备份。

分支交付使用 `next-version`；`dev` 保留拆分前提交 `8d6b83338853f91a710df3c433d304923c43f6e5`。推送代码不执行数据库迁移、不部署服务。

## 9. 旧表观察期前的遗留清理（2026-09-07 已在开发库执行）

本次以实际数据库目录补查迁移清单，发现原 33 张旧表之外还有 `interview_report`（12 行）、`interview_report_version`（13 行）、`studio_human_interview_interviewer_invitation`（0 行）。三表未在当前 schema 声明，仍有 7 条外键指向旧招聘表；它们对用户、组织等在线资源也有外键。另有旧主表的两个触发器未被前一次外键解耦覆盖。

已新增并执行 [retire_recruiting_archive_dependencies](../apps/web/drizzle/20260907023000_retire_recruiting_archive_dependencies/migration.sql)，保留全部旧表和旧行：

- 12 条旧报告和 13 条版本完整复制到 `recruiting_event`，action 为 `migration.report_archived`。`detail.sourceTable/sourceId/legacySource` 保留全部源字段、报告内容、文档链接和原版本/提交/冲突状态。所有旧报告均匹配同组织的新招聘记录。
- 这批历史报告包含不同旧契约，以及 `migration_conflict`、`creation_uncertain` 等状态，因此只作历史审计档案，不覆盖新会话、当前评分、人工确认结果，也不重放提交、创建文档或发送通知。
- 使用源表名和源 ID 生成确定性事件 ID。重复执行校验完整 JSON 相等；冲突拒绝覆盖。目标招聘缺失/跨组织、两张旧报告表不成对存在、其他环境旧邀请表非空都会中止事务，要求先完成对应数据映射，不静默丢弃。
- 解除三张额外档案表的全部 18 条外键（其中 7 条指向原招聘旧表），消除指向旧表及在线资源的引用。旧行中的历史 ID 仍原样保存，但不再作为数据库外键。
- 移除 `studio_interview_skill_count_decrement` 和 `studio_interview_sync_search` 两个触发器。前者会在删除旧行时修改在线技能计数；移除后旧档案不再通过这两个触发器影响在线数据。共享函数保留，未改其他表的触发器。
- `recruiting-read-model.ts`、`recruiting-records.ts`、`recruiting-assessment.ts` 的旧表类型依赖已解除，改用 [recruiting-record-fields.ts](../packages/database/src/recruiting-record-fields.ts) 的新实体/领域 DTO 契约。已验证字段集合、可空性和字段类型与原接口完全一致。
- 在线旧表边界测试新增检查纯类型 import，并将三张额外物理表纳入禁止直接 SQL 访问的范围。

执行证据：[脱敏校验报告](../docs/reports/2026-09-07-recruiting-archive-retirement/verification.json)。先运行事务回滚演练，再正式提交；两次均校验 36 张旧表及 `studio_org_skill` 的行数/完整行哈希相同。25 条归档事件重跑无新增或覆盖。正式执行后再次查询数据库：跨原 33 张旧表的外键为 0、依赖视图为 0、旧主表自定义触发器为 0；额外三表外键为 0。49 条旧表内部外键仍保留，属于观察期档案内部结构。

本次更新了 Drizzle 迁移记录；未部署其他环境。迁移文件对缺少额外旧表的环境可跳过归档，但非空旧邀请或未迁移招聘记录需要先处理，不能直接把开发库验收结果用于生产。

### 观察一个月后如何删除

- 观察期从实际环境全部 Web/Server/Worker/Agent 切换到新版本、旧消费者停用之后计算。本次没有配置定时监控，也没有执行任何删表。
- 旧 schema、旧表之间的 relations、原回填工具和历史 SQL 暂留作观察与取证。现在在线编译和查询均不再依赖旧表定义；最终退役时应同步移除这些旧 schema/relations 和回填执行入口，并追加正式 DROP 迁移。历史迁移文件保留，保证新环境可重放迁移链。
- 删除范围需包含这次发现的三张额外档案表，共 36 张；按依赖顺序或明确的同一批 DROP 清单处理内部外键，不用泛化 CASCADE 隐藏未知依赖。先备份并在目标环境复查访问日志、外键、视图和触发器。
- Qdrant/队列里的 `studio_interview` 仍是兼容协议值，数据库侧映射到 `recruiting_record`，不构成对旧物理表的查询。删物理表不要求修改它；若后续统一协议命名，应独立迁移向量 payload/ID 与任务去重键，不能直接全局替换。
- 原始旧表不是新系统的实时备份；新增招聘、评价和面试都只写新模型。25 条报告归档事件随新招聘记录按既有删除规则管理，不替代独立备份。
