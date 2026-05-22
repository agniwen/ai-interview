# 招聘 Copilot — 重构 & 安全收口工作计划

> 上下文：把候选人状态从单一 `status` 迁移到 `pipelineStage + outcome` 二轴模型，并基于 2026-05-21 全流程审计的发现做安全 / 一致性收口。

---

## ✅ 已完成

### A. 数据展示层切换到新模型

- [x] **简历库分布图**：`ResumeLibraryMetrics.byStatus`（旧 enum）→ `byPipeline: { stage, outcome, count }[]`
  - `src/lib/shared/studio-resumes.ts` — 类型替换
  - `src/server/routes/studio/routes/resumes/dao/metrics.ts` — `loadByStatus → loadByPipeline`，GROUP BY pipelineStage × outcome；`loadConversion` 排除 `outcome='archived'`
  - `src/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-charts.tsx` — StatusCard 重写为 6 桶漏斗：简历筛选 / AI 面试 / 真人复面 / Offer / 已录用 / 已淘汰&撤回
  - Card 标题：「简历状态分布」→「面试流程分布」

### B. 数据修正（一次性 SQL 已落库）

- [x] **宋涛 + 李中鑫**：有 AI schedule 但 `pipeline_stage='screening'` → 修正为 `ai_interview`
- [x] **张慧 + 白一凡**：`pipeline_stage='ai_interview'` 但无任何 round → 回退为 `screening`
- [x] **代码兜底**：`DELETE /interviews/:id` + `/bulk-delete` 删完轮次后调用 `resetOrphanedAiInterviewParents` 自动回退候选人到 screening，防止再生孤儿

### C. AI 阶段锁的 UI 完整化

- [x] `studio-person-detail-panel.tsx` — interview 模式「轮次概览」+ resume 模式「AI 面试轮次」tab 内：发送邮件 / 复制链接 / 二维码 / 重置轮次 全部按 `aiStageLockedReason` 禁用 + 显示锁定原因文本
- [x] `RoundEmailAction` / `InterviewLinkQrButton` 新增 `lockedReason` / `disabled` props
- [x] `actions-column.tsx` ActionMenuItem 支持 `disabled` + `disabledReason`
- [x] `interview-management-page.tsx` — 行级「编辑」/「复制面试链接」按候选人 pipelineStage 禁用
- [x] `StudioCandidateRecord` + `StudioInterviewRoundListRecord` 增加 `pipelineStage / outcome` 字段并在 DAO 中 SELECT

### D. 审计 Batch 1 — 关键安全收口（低成本高价值）

- [x] **S1**：`/api/interview/match-job-description` + `/generate-questions` 加 `authMiddleware`
  - 之前任何人都可烧 LLM token / 枚举 JD
- [x] **S3**：`loadCandidateInterviewRecord` + `loadScheduleEntriesForRedirect` 加 `pipelineStage === 'closed'` 守卫
  - 已结案候选人 `/livekit-token` + `/resolve` 入口直接 404，无法进会议室
- [x] **S4**：`POST /round-emails/:roundId/send` 服务端 stage 校验
  - 过了 AI 阶段返回 409，防止 UI 绕过给已 rejected 候选人发邮件
- [x] **S5**：`POST /launch-interview` 加 closed 守卫
  - 强制 closed 候选人必须走 reactivate，避免 closedMeta / closedAt 不被清空的脏状态
- [x] **S8**：transition close/reactivate 完整 dual-write
  - 进 closed → 写 `status='archived'`
  - 退出 closed → 清空 `humanInterviewScheduledAt / humanInterviewerId / offerSentAt / offerAcceptedAt / writtenTestScheduledAt / writtenTestScore`，`status='ready'`
- [~] **L3**：暂不修 — `resolvePublicInterviewScope` 返回的 candidateId 仅服务端内部使用，真实泄露面在 `loadInterviewRoundDetail.candidate.id`，跟 [S2] 一起统筹

### E. 审计 Batch 2 — 事务 / 原子性硬伤

- [x] **S7**：`maybeAdvanceToHumanInterview` + `maybeAdvanceToOffer`
  - 把 select + check + update 的 TOCTOU 序列改成单条 UPDATE 带 WHERE（`pipelineStage IN (advanceable) AND outcome='in_pipeline'`）
  - 并发 close 现在变成 no-op，不再触发 DB CHECK 约束的 23514
- [x] **S6.1**：候选人期望 PATCH (`/candidate-expectations`)
  - read+merge+write 包进 transaction + `SELECT ... FOR UPDATE`
- [x] **S6.2**：transition 路由
  - read + no-op detect + closedMeta merge + write + audit log 全部进 transaction，candidate 行 `FOR UPDATE`
  - 返回 discriminated `{kind: "ok" | "noop" | "not_found"}`
- [x] **S6.3**：`editHumanInterviewRound` + `editOfferDraft`
  - 两个 DAO 内部 read+merge+write 进 transaction，目标行 `FOR UPDATE`
  - 顺手解 existing.scheduledAt（Date）/ existing.expiresAt（Date）的类型不匹配
- [x] **M2**：schedule entry 服务端 stage 守卫
  - `PATCH /:id` — 联查 parent stage，past AI → 409
  - `DELETE /:id` — transaction 内 `FOR UPDATE { of: studioInterview }` parent，past AI → 409
  - `POST /bulk-delete` — 一次 SELECT 全部 parents（`FOR UPDATE`），任一超过 AI 阶段就整批拒绝（409），避免 partial 删除
- [x] **M5**：`cancelOfferDraft` 完整 rewrite
  - 事务内：lock 草稿 → expired → 查其它非终态草稿
  - 若都没了：按「有 human round → human_interview；否则有 AI schedule → ai_interview；否则 screening」回退候选人 stage
  - UPDATE 带 WHERE `pipelineStage='offer' AND outcome='in_pipeline'` 兜底

### 验证

- typecheck ✅ / lint ✅ / 396 tests passing

---

### J. 面试报告评估扩展（岗位绑定 + 全局绑定题）

- [x] **报告评估纳入预设题**
  - 之前 `runSummaryJob` 只读 `studioInterview.interviewQuestions`（候选人级简历个性化题），岗位绑定 / 全局绑定的模板题虽然在面试中被问过，但**不参与结构化打分**（只可能被模型在 `overallScore` / `overallAssessment` 里隐式糅合）
  - 新增 `loadInterviewPresetQuestionsWithScope`（`apps/.../studio/routes/interview-questions/dao/bindings.ts`）：在原 `loadInterviewPresetQuestions` 基础上多 join 一次 `interview_question_template`，让每条预设题携带 `scope: "global" | "job_description"`
  - `interview-summary-job.ts` 把"个性化题 + 岗位题 + 全局题"按源前缀（`[个性化]` / `[岗位题]` / `[全局题]`）合并后传给 `generateInterviewReport`；模型对每条独立打分，前缀写入 `evaluationCriteriaResults.questions[].question` 字段
  - **故意不调** `ensureApplicableBindings`：面试已结束，只评估当时实际绑定且未禁用的题；新建的全局模板不应回灌历史报告
  - 不去重；同题在个性化和模板里同时存在则被分别评

### K. Voice Agent — 计时收口 / 录像 bug / 角色错乱 / 调试开关

> 全部代码改动在 `apps/livekit-agent/src/agent.py` 和 `apps/livekit-agent/src/interview_agent.py`。

#### K.1 线上事故诊断（数据驱动）

事故场景：候选人面试到 23+ 分钟，**模型完全无响应**，**录屏继续录到 35:57**，最终 web 端 `webhook_received_at` 比 `ended_at` 晚 12 分钟到达。

通过 SQL（`interview_conversation` 行）+ 转录 timeInCallSecs + LiveKit Agents 源码反查得到的根因：

| 现象                            | 根因                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "模型不响应"                    | `turn_detector + endpointing` **过宽容**：候选人破碎中文表达（"嗯/呃/那个..." + 中途停顿）被 turn detector 持续判为"还没说完"，累积成最长 **4 分 44 秒不关闭的 user turn**，期间 agent 全程沉默                 |
| 23 min 硬切告别词从未播出       | `_enforce_time_limit` 在 23 min 触发 `generate_reply` 想说告别词，但当时 user turn 仍被占用，回复被 enqueue 在用户 turn 之后；session 在 23:51 直接被关，告别词没机会播                                         |
| 录屏比 session 长 12 分钟       | LiveKit 框架 `agent_session.py:988` emit `close` 事件后**还要 await `session_host.aclose()` 的内部清理**；这段实测能拖 12 分钟。`_on_session_end` 因此延迟，里面的 `stop_recording` 也延迟，egress 一直录空房间 |
| `webhook_received_at` 晚 12 min | 同上 — `_on_session_end` 里调 `send_report` 才发 webhook                                                                                                                                                        |

**这反转了原 `todo.md` 的优化方向**：早期假设是"抢答"，要抬高 `unlikely_threshold` / `endpointing.min_delay`；真实数据显示症状是相反的"过宽容"。`todo.md` 里那几条（unlikely_threshold=0.35 / min_delay=1.0 / Silero VAD 默认值 / `on_user_turn_completed` 规则兜底）**作废**，对应改动方向反过来。

#### K.2 时间线收口（避免长 user turn 僵局 + 修硬切告别词没机会播）

- [x] **`max_delay` 8s → 5s**（`agent.py:283`）：单次 EOT 长等上限砍到 5s，避免破碎表达累积出多分钟僵局
- [x] **`_enforce_time_limit` 加 `session.interrupt()` + `session.clear_user_turn()` + 有限 `wait_for_playout`**：硬切前先把 pipeline 抢回来（之前会被 user turn 阻塞），告别词播 20s 超时就放弃直接关
- [x] **新增 `_force_wind_down` 18:30 主动收尾定时器**：原 `on_user_turn_completed` 注入的收尾提示只在用户说话时触发；候选人沉默或 user turn 被挂住时模型永远收不到。定时器到点强制让 agent 开口提示收尾，命中 `wrap_up_started=True` 时静默退出（避免和模型自调的 `enter_wrap_up` 重复发声）
- [x] **`InterviewAgent.wrap_up_started` property**：暴露 `_wrap_up_started` 给 agent.py 外层定时器读取

#### K.3 LLM 角色错乱修复

- [x] **`_enforce_time_limit` + `_force_wind_down` 都改用 `session.say` 而非 `generate_reply`**
  - 源码确认 `agent_activity.py:2237` `chat_ctx.add_message(role="system", content=[instructions])`：`generate_reply(instructions=...)` 会**多注入一条 `role="system"`**
  - 在压缩调试时间线 + 多个 system overlay 叠加下，`deepseek-v4-flash` 会丢失对"面试官"角色的锚定，回成候选人口吻
  - `session.say()` 走纯 TTS，0 LLM 调用，无角色漂移
- [x] **硬切告别词不再拼 `interview_agent.closing_instructions`**：那是给 LLM 看的指令文本（常以"对候选人说："开头），字面 TTS 播会念出指令前缀。改用固定字面话术："非常感谢你今天的分享。因为时间关系，本场面试到此结束。我们会综合评估你的表现并尽快反馈结果，祝你一切顺利。"
  - 注意只有**硬切兜底**改了；模型走 `end_call` 工具正常结束的路径仍然走 LLM + `closing_instructions`，候选人体验跟全局结束语配置一致

#### K.4 录像多录 12 分钟修复 + 前端无法退出修复

- [x] **close listener 即时 `stop_recording`**（`agent.py:_on_close`）：close 事件触发瞬间起 `asyncio.create_task` 调 `stop_recording`，不等框架内部 `session_host.aclose` 清理完。`stop_recording` 本来就幂等（`recording.py:99-109` 已 ended 时回退到 list_egress），`_on_session_end` 那次重复调安全
- [x] **`_enforce_time_limit` 复刻 `EndCallTool` 的完整关闭序列**（`end_call.py:111-129`）
  - 之前 `session.aclose()` + 直接 `ctx.delete_room()`：room API 调用发出去了，但 **`_shutdown_fut` 永远没被解锁** → worker job 没进入官方关闭流程 → 前端 SDK 收到的生命周期事件不完整 → UI 卡在"面试中"
  - 现在按官方做法：
    1. `session.shutdown()` 触发 graceful drain
    2. `ctx.add_shutdown_callback(_delete_room_on_shutdown)` 把删 room 注册成 shutdown 回调
    3. `ctx.shutdown(reason="task_completed")` 设置 `_shutdown_fut`，让 worker 走完 `session 关 → on_session_end → shutdown_callbacks` 标准链路
  - 前端在 shutdown_callbacks 阶段收到 `RoomDeleted` 事件，正确切换到"已结束"

#### K.5 调试 / 本地化开关

- [x] **`INTERVIEW_DEBUG_FAST=1`**（`interview_agent.py`）：把 20/16/18.5/3 min 时间线压缩到 20/30/45/15 秒，本地 1 分 15 秒能跑完完整 soft_wrap → final_wrap → time_limit → hard_cutoff 流程
- [x] **`INTERVIEW_DISABLE_NOISE_CANCELLATION=1`**（`agent.py`）：本地 dev 模式跑 `uv run src/agent.py dev` 时不接 LiveKit Cloud 的 ai_coustics 凭证下发，插件每 5 秒报一次 `Missing configuration`（源码 `plugin.py:117-119` 印证）；本开关让 `noise_cancellation=None`，消除日志噪声。**生产 LiveKit Cloud 上自动有凭证**，此 var 不需要设

#### K.6 验证

- ruff format / check 全过
- 用 `INTERVIEW_DEBUG_FAST=1 INTERVIEW_DISABLE_NOISE_CANCELLATION=1 uv run src/agent.py dev` 本地跑 console 验证：
  - 30s `_force_wind_down` 念固定提醒
  - 60s `_enforce_time_limit` 念固定告别 + 完整 EndCallTool 关闭序列 + 前端正确退出
  - 不再出现 ai_coustics 日志刷屏
  - 不再有 LLM 角色漂移

#### K.7 仍待评估

- [ ] **角色错乱根因是否仅限于 `generate_reply` 注入路径**：现在压缩时间线下未观察到漂移，但生产 LLM 用 `end_call` 工具正常结束时 instructions 仍走 LLM，仍有理论上的漂移面。需要在生产场景持续观察。如果偶发，可以把 `EndCallTool` 的 `end_instructions` 也换成纯字面话术（牺牲 HR 端"全局结束语"配置）
- [ ] **`_force_wind_down` 的固定提醒是否打断模型当前思路**：实际测试看，当 candidate 正在长 user turn 时，30s 时被打断 + 听到收尾提醒后再继续答，体感是否割裂；如果割裂可以把 `allow_interruptions=False`，但代价是 candidate 想插话也插不进来
- [ ] **`_grace_finalize`（候选人断线 3 分钟宽限到期）是否也要补 `EndCallTool` 完整关闭序列**：当前还是裸 `session.aclose()`。候选人断了之后房间没人，前端也不在，影响小但不一致。建议下一轮顺手补
- [ ] **测试已经退役的「过宽容」假设是否会反弹**：`max_delay=5s` 是否对真正长思考型回答（"我想想"+10 秒）造成抢答；如果反弹再加 `unlikely_threshold` 抬高（但只针对 turn detector 模型层，不动 endpointing）

---

## ⏳ 待做

### F. 审计 Batch 3 — 中等优先（建议下一批做）

- [ ] **M1**：PATCH 接口的 nullable 字段无法清空
  - `editHumanInterviewRound` / `editOfferDraft` / 其他 PATCH 路径：`input.x ?? existing.x` 把显式传入的 `null` 吞掉，feedback/score/notes/bonus/equity 等无法清空
  - 修法：要么 Zod 检测「字段存在但为 null」走清空分支，要么显式比较 `input.x === undefined ? existing.x : input.x`
- [ ] **M3**：重置轮次允许 `status='interrupted'`
  - `interviews/route.ts` reset 路径目前只接受 `'completed'`；HR 没法手动放弃断连超时轮
  - 修法：允许 `status IN ('completed', 'interrupted')`
- [ ] **M6**：真人复面 + Offer 子表所有 mutation 写 audit log
  - `dao/human-interview-rounds.ts`：create / edit / complete / cancel
  - `dao/offer-drafts.ts`：create / edit / send / respond / cancel
  - 目前只有 transition 和 round reset 落 `interviewAuditLog`
- [ ] **M7**：`closedMeta` 内部字段交叉校验
  - `closedMetaSchema` 当前允许 `hiredDetails` 在 `outcome='rejected'` 时写入（反之亦然）
  - 修法：在 transitionInputSchema 的 refine 里按 outcome 限制 closedMeta 子树
- [ ] **M10**：dedup-check 排除自身
  - `queryInterviewDedup` 编辑路径会把候选人自己匹配进 results
  - 修法：加 `excludeId?` 参数；前端 patch 路径调用时传当前 record id

### G. 决策类（需要先对齐再做）

- [ ] **S2** — 公开链接安全收口（**大改**）
  - 问题：`/api/public/*` 暴露候选人完整 PII、面试 transcript、录像 10 分钟 presigned URL；无签名、无过期、无撤销
  - 需要决策：
    - (a) HMAC-signed token 含 `expires_at`
    - (b) HR 端可撤销机制（每候选人 / 每轮次粒度？）
    - (c) 录像 / transcript 等敏感字段是否要二次确认
    - (d) 现有候选人收到的旧链接如何兼容（grandfather 期？）
- [ ] **M4** — `respondOfferDraft('accepted')` 是否级联推进
  - 当前行为：草稿置 accepted，候选人仍在 `pipeline_stage='offer'`（等 HR 二次确认 → 弹 dialog → 走 transition）
  - 这是先前明确的设计选择（避免误操作直接关单），但 audit 指出 HR 关浏览器时会丢
  - 备选：服务端在 accepted 时同时把 candidate 置 `closed/hired`（idempotent），UI 退化为审计提示
- [ ] **M8** — 简历解析失败但 S3 已写入
  - `storeInterviewResume` parse 失败时仍 returns storageKey + null profile，候选人卡死，无重试入口
  - 备选：UI 加「重新解析」按钮 / 让 parse 失败时不写 storageKey / 自动后台重试
- [ ] **M9** — 删除候选人不清 `chat_attachment` + S3 对象
  - 当前 FK cascade 只删 schedules / rounds / offers；attachment 注册行和 S3 对象保留
  - 备选：定期 GC 任务 / 引用计数 / 直接同步删除

### H. 轻微改进（L1-L7，单独时间窗集中扫）

- [ ] **L1**：`transition` 路由的 outcome 默认值推断改为显式必填或文档化
- [ ] **L2**：`manualInterviewQuestions` JSON.parse 后没 zod 校验
- [ ] **L4**：`scheduleEntries` superRefine 第一个错误就 return（UX 改进）
- [ ] **L5**：AI 阶段锁仅基于 `pipelineStage`，若以后 archived 解耦会漏锁
- [ ] **L6**：`pickCurrentScheduleEntry` 在 ScheduleEntryStatus 共用扩展时语义易混
- [ ] **L7**：`cancelHumanInterviewRound` 取消唯一人面轮次不回退 stage（与 M5 同形，可一并修）

### I. 一致性收尾

- [ ] `src/components/screens/resumes-screen.tsx` 是 landing 用的 mock 截图，标签还是旧的「草稿/待开始/进行中/已完成」；与生产图表不一致

---

## 📌 长期收口（候选）

- [ ] 全量 drop legacy `studio_interview.status` 列（确认所有下游消费者迁移完后）
- [ ] 移除其它 deprecated 标量字段（`humanInterview*` / `offer*At` / `writtenTest*`）
- [ ] 把分散的「漏斗派生」逻辑（`describeResumeProgress` / `metrics.byPipeline` / chart 桶）抽到一个统一的 `pipeline-funnel` 模块

---

## 🗂 参考

- 状态机不变量：`pipelineStage='closed' ⇔ outcome ≠ 'in_pipeline'`（DB CHECK + 应用层守卫）
- 推进守卫规则：`maybeAdvanceTo*` 只能从 `screening / written_test / ai_interview [, human_interview]` 单向推进；并发 close 时变 no-op
- 删除轮次回退规则：候选人在 `ai_interview + in_pipeline` 且无任何剩余 schedule 时回退到 `screening`；其它阶段（人为已推进）保持不动
