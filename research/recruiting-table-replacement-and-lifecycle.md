# 招聘旧表替代关系与流程数据生命周期

更新时间：2026-09-07

代码基线：`dev` 分支，`9a8decb9`

## 1. 结论

本次招聘流程更新不是简单改表名，而是把旧的 `studio_interview` 大宽表拆成独立的人才、简历、招聘流程、节点、评价、面试和 Offer 等实体。

当前业务代码已经切换为只读写新表。旧表共 36 张，仍作为只读历史档案保留，尚未物理删除，也不是新系统的实时双写备份。

## 2. 核心替代关系

| 废弃旧表 | 新表 | 关系 |
| --- | --- | --- |
| `studio_interview` | `candidate` | 候选人姓名、电话、邮箱等身份信息 |
| `studio_interview` | `candidate_resume` | 简历文件、正文、结构化 Profile、解析状态；以后换简历会创建新版本 |
| `studio_interview` | `recruiting_record` | 人才、简历、岗位之间的招聘关系，以及当前节点和结束状态 |
| `studio_interview` | `recruiting_node_state` | 8 个流程节点各自的当前有效状态和结论 |
| `studio_interview` | `recruiting_resume_evaluation` | 旧版、结构化、定性评价以及规则筛选结果 |
| `studio_interview` | `recruiting_interview_preparation` | 面试准备题 |
| `studio_interview` | `recruiting_fulfillment` | 流水、背调、入职信息和当前选定 Offer |
| `studio_interview` | `recruiting_event` | 迁移时保存旧主表完整快照；以后保存流程审计 |
| `resume_evaluation_version` | `recruiting_resume_evaluation` | 历史成功评价版本 |
| `resume_evaluation_failure` | `recruiting_resume_evaluation` | 历史失败评价尝试 |
| 无直接旧表 | `recruiting_material` | 新增的流水、背调报告、Offer 文件元数据表 |

核心语义如下：

- `recruiting_record` 表示“一名人才针对一个岗位的一次招聘过程”。
- 当前状态由 `recruiting_record.current_stage` 和 `recruiting_node_state` 共同决定。
- AI/真人面试历史、Offer 历史和评价历史不会自动成为当前流程依据，必须通过节点表中的 `effective_ai_round_id`、`effective_human_round_id` 或 `effective_offer_id` 明确选中。
- `recruiting_record.current_evaluation_id` 指向最近一次有效成功评价，`active_evaluation_id` 指向当前排队或执行中的评价尝试；失败尝试不会覆盖成功结果。

## 3. 附属旧表替代关系

| 业务域 | 旧表 | 新表 |
| --- | --- | --- |
| AI 面试 | `studio_interview_schedule` | `ai_interview_round` |
| AI 会话 | `interview_conversation` | `ai_interview_conversation` |
| AI 对话消息 | `interview_conversation_turn` | `ai_interview_conversation_turn` |
| 面试上下文 | `interview_context_snapshot` | `recruiting_context_snapshot` |
| 面试证据 | `interview_evidence_snapshot` | `recruiting_evidence_snapshot` |
| 真人轮次 | `studio_human_interview_round` | `human_interview_round` |
| 真人轮次面试官 | `studio_human_interview_round_interviewer` | `human_interview_round_interviewer` |
| 真人会议 | `studio_human_interview_meeting` | `human_interview_meeting` |
| 会议关联轮次 | `studio_human_interview_meeting_round` | `human_interview_meeting_round` |
| 会议面试官 | `studio_human_interview_meeting_interviewer` | `human_interview_meeting_interviewer` |
| 会议事件 | `studio_human_interview_meeting_event` | `human_interview_meeting_event` |
| 真人评价快照 | `studio_human_interview_evaluation_snapshot` | `human_interview_evaluation_snapshot` |
| 评价文档同步 | `human_interview_document_sync` | `human_interview_evaluation_document_sync` |
| Offer | `studio_offer_draft` | `recruiting_offer` |
| 通知接收人 | `studio_interview_notification_recipient` | `recruiting_notification_recipient` |
| 通知业务事件 | `interview_notification_event` | `recruiting_notification_event` |
| 通知投递任务 | `interview_notification` | `recruiting_notification_delivery` |
| 轮次邮件日志 | `studio_round_email_log` | `recruiting_round_email_log` |
| 表单提交 | `candidate_form_submission` | `recruiting_form_submission` |
| 问题模板绑定 | `interview_question_template_binding` | `recruiting_question_template_binding` |
| 招聘活动审计 | `interview_audit_log` | `recruiting_event` |
| 人才池导入 | `resume_pool_import` | `recruiting_pool_import` |
| 上传批次 | `resume_upload_batch` | `recruiting_upload_batch` |
| 上传批次项 | `resume_upload_batch_item` | `recruiting_upload_batch_item` |
| 邮件导入消息 | `mail_ingest_message` | `recruiting_mail_message` |
| 岗位匹配运行 | `resume_job_match_run` | `recruiting_job_match_run` |
| 岗位匹配候选 | `resume_job_match_candidate` | `recruiting_job_match_candidate` |
| 语义索引状态 | `resume_semantic_index` | `recruiting_search_index` |
| 重复简历匹配 | `resume_duplicate_match` | `recruiting_duplicate_match` |
| 通用会议招聘上下文 | `meeting_recruiting_context` | `recruiting_meeting_context` |

完整的可执行复制映射位于 `apps/server/src/scripts/recruiting-migration/model.ts`。

## 4. 额外发现的三张历史表

最初 33 张迁移源表之外，数据库中还发现：

- `interview_report`
- `interview_report_version`
- `studio_human_interview_interviewer_invitation`

处理方式：

- `interview_report` 和 `interview_report_version` 的历史行原样归档到 `recruiting_event`，事件类型为 `migration.report_archived`。
- 旧报告只作为历史审计，不会被提升成当前面试结论或当前评价，不会重新创建文档、发送通知或触发流程推进。
- `studio_human_interview_interviewer_invitation` 在开发库中为空，因此没有做行级迁移。新流程中的面试官分配和确认由 `human_interview_round_interviewer` 及通知表承担。
- 三张表的外键已经解除，但原表和原行仍保留。

## 5. 当前流程节点

```text
screening
  → ai_interview
  → second_interview
  → final_interview
  → income_proof
  → offer
  → background_check
  → onboarding
  → closed
```

`closed` 是流程结束状态，不是一条普通的可推进业务节点。结束前所在节点记录在 `recruiting_record.closed_from_node`。

## 6. 各流程动作的数据生命周期

| 动作 | 创建或写入 | 删除、保留或失效行为 |
| --- | --- | --- |
| 新建招聘记录 | 创建 `candidate`、`candidate_resume` v1、`recruiting_record`；一次创建 8 条 `recruiting_node_state` | 不删除数据 |
| 上传简历 | 创建 `recruiting_upload_batch`、`recruiting_upload_batch_item`；解析后填充简历，并按条件创建评价和索引 | 不删除数据 |
| 从人才池导入 | 创建或复用招聘记录，并创建 `recruiting_pool_import` 和活动事件 | 普通重复导入复用已有 `recruiting_record`；显式重新导入才创建另一条；人才池原记录不移动、不删除 |
| 替换已解析简历 | 创建新的 `candidate_resume` 版本，并让 `recruiting_record.resume_id` 指向新版 | 旧简历版本保留；清空当前评价和活跃评价指针 |
| AI 简历评价 | 创建或继续更新 `recruiting_resume_evaluation`；成功时更新 `current_evaluation_id`，处理中更新 `active_evaluation_id` | 失败不会删除或覆盖上一次成功评价 |
| 筛选通过并推进 | screening 节点更新为 `completed/pass`，目标节点变为 `pending`，创建 `recruiting_event` | 不物理删除数据 |
| 直接进入复试 | screening 记为通过，AI 节点记为 `skipped`，复试节点变为 `pending` | 不创建虚假的 AI 面试轮次 |
| 发起 AI 初面 | 创建 `ai_interview_round`、问题模板绑定、上下文快照、启动事件；按配置创建通知事件和投递记录 | 不删除旧 AI 轮次；节点仅绑定当前有效轮次 |
| AI 会话执行 | 创建 `ai_interview_conversation`、对话 turn、证据快照和报告相关事件 | 迟到回调可以保存历史内容，但不能重新激活已经失效的轮次 |
| 删除 AI 轮次 | 物理删除指定 `ai_interview_round` | 删除前清空会话、快照和事件中的轮次引用，取消待发通知；会话、快照和操作历史继续保留；删除最后一轮时流程回到 screening |
| 创建真人面试轮次 | 创建 `human_interview_round` 和 `human_interview_round_interviewer`；节点绑定该轮次 | 不删除数据 |
| 安排真人会议 | 创建 `human_interview_meeting`、`human_interview_meeting_round`、`human_interview_meeting_interviewer`；后续产生会议事件 | 不删除数据 |
| 取消真人面试 | 将轮次和相关会议更新为 `cancelled`，清除当前节点的有效轮次引用 | 不删除轮次、会议或历史评价；进行中的会议禁止取消 |
| 完成真人面试 | 更新轮次为 completed；创建或更新评价快照、文档同步和通知；同步节点结果 | 不删除历史轮次；`inconclusive` 进入待评价，不直接通过或淘汰 |
| 流水或背调 | 更新 `recruiting_node_state` 和 `recruiting_fulfillment`；上传材料时创建 `recruiting_material` | 推进时不删除材料 |
| 创建 Offer | 创建新版本 `recruiting_offer`；upsert `recruiting_fulfillment.selected_offer_id` | 尚未结束的旧 Offer 版本改为 `superseded`，不物理删除 |
| 发出、议价、接受 Offer | 更新 Offer 状态和节点状态；接受后节点为 `completed/pass` | 不删除数据 |
| 撤回 Offer | Offer 标记为 `expired`，清空 fulfillment 和节点中的当前 Offer 指针，节点恢复 pending | 不删除 Offer 历史，也不自动退回面试节点 |
| 某节点失败或放弃 | 节点记为 completed/fail 或 withdrawn；招聘记录转为 closed；创建事件 | 不删除轮次、评价、材料或 Offer |
| 确认入职 | upsert `recruiting_fulfillment`；onboarding 节点记为 completed/pass；招聘记录变为 closed/hired | 不删除数据 |
| 回退或重新打开 | 复用原 `recruiting_record`；目标节点恢复 pending；下游节点变为 inactive；写入 `recruiting_event` | 不删除历史轮次、评价、Offer 和材料；只清空当前有效依据、部分 fulfillment 当前字段，并取消已失效通知 |
| 结束招聘 | 更新招聘记录、当前节点和事件 | 明确不删除轮次、材料、评价或 Offer |

## 7. 删除整条招聘记录

删除 `recruiting_record` 是主要流程中少数真正执行物理删除的动作。

### 保留

- `candidate`
- `candidate_resume` 的所有版本
- 对象存储中的简历文件
- AI conversation 和 conversation turn，但会解除招聘记录、AI 轮次等关联
- 可独立存在的真人会议记录
- 旧的 36 张历史档案表及其数据

### 删除或级联清理

- `recruiting_node_state`
- `recruiting_resume_evaluation`
- `recruiting_interview_preparation`
- `recruiting_fulfillment`
- `recruiting_material`
- AI 和真人面试轮次，以及对应从属关联
- 真人评价快照和评价文档同步记录
- `recruiting_offer`
- 表单提交和问题模板绑定
- 人才池导入关系
- 通知接收人、通知事件、通知投递
- 轮次邮件日志
- 招聘会议上下文
- 招聘活动事件，包括迁移报告归档事件
- 招聘上下文和证据快照

### 删除前后的特殊处理

- 先清空招聘记录上的当前评价、活跃评价等循环引用。
- 未结束的 `recruiting_upload_batch_item` 先标记为 `cancelled`，再清空 `recruiting_record_id`，避免迟到 Worker 重新创建招聘记录。
- AI 会话和 turn 会把招聘记录、轮次引用置空后保留。
- `recruiting_search_index` 及 Qdrant 向量由接口在主记录删除后做 best-effort 清理。
- 旧档案已经与在线业务表解除外键，因此删除新招聘记录不会级联修改旧档案。

## 8. 物理删除旧表的状态

当前的“废弃”含义是：

1. 在线业务代码不再读写旧表；
2. 旧表指向岗位、用户、工作区、邮箱账号、会议等在线资源的外键已经解除；
3. 旧主表会修改在线数据的两个触发器已经移除；
4. 旧表和旧行仍保留在数据库中，等待观察期结束后正式 DROP。

最终退役范围应包含全部 36 张旧表。执行前应确认所有 Web、Server、Worker 和 Agent 消费者都已经切换到新版本，并检查访问日志、数据库依赖和备份。删除时应使用明确的表清单和依赖顺序，不应使用泛化的 `DROP ... CASCADE` 隐藏未知依赖。

Qdrant 和队列中的 `sourceType: "studio_interview"` 仍是兼容协议值，数据库访问层会将其映射到 `recruiting_record`。这个字符串不代表运行时仍在读取旧物理表。

## 9. 主要代码与文档依据

- `research/merge-new-table.md`
- `research/recruiting-old-table-retirement-audit.md`
- `docs/plans/2026-09-05-recruiting-record-split.md`
- `docs/adr/0036-copy-recruiting-data-into-independent-tables.md`
- `apps/server/src/scripts/recruiting-migration/model.ts`
- `apps/server/src/scripts/recruiting-migration/transform.ts`
- `packages/db-schema/src/schema.ts`
- `packages/database/src/recruiting-records.ts`
- `packages/database/src/recruiting-pipeline.ts`
- `packages/database/src/recruiting-assessment.ts`
- `apps/server/src/server/routes/studio/routes/interviews/dao/ai-round-lifecycle.ts`
- `apps/server/src/server/routes/studio/routes/interviews/dao/human-interview-rounds.ts`
- `apps/server/src/server/routes/studio/routes/interviews/dao/offer-drafts.ts`
