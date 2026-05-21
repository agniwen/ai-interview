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
