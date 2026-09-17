# 黄笑眉面试记录丢失：诊断与修复方案

检查日期：2026-09-14。代码基线：`a509737c`。本文所有事件时间均为北京时间。

本次只读检查线上 PostgreSQL 和 Sentry；在本机临时 PostgreSQL 中复制表结构、使用虚构数据复现。未修改线上数据，未部署代码，未发送通知。用户随后授权代码修复，并明确不再处理该候选人的线上恢复；现已完成下述实现与本地验证。

## 结论

第一次面试确实正常结束，Agent 收集了 **56 条对话**。结束报告三次请求均收到 HTTP 500，未完成数据库事务提交。直接原因是**线上通知写入代码与数据库唯一索引不匹配**：线上执行 `ON CONFLICT (dedupe_key)`，数据库已经改为 `(queue_namespace, dedupe_key)` 唯一索引，PostgreSQL 拒绝该 SQL。

通知创建与对话保存、轮次完成状态更新在同一个事务中，因此通知错误导致整份面试报告回滚。随后，前端本地已结束状态与后台“面试中”状态不一致，反馈提交被拒绝；刷新又复用了原房间。新 Agent 的报告最终覆盖了旧会话中的残留数据。

需要修正早期判断：不是“已成功保存的 56 条全文后来全部被删除”。证据表明第一次全文上报没有提交成功；当前能确定被后续报告替换的是同一会话行及其题目结果等残留数据。首次检查点的具体内容已经无法从当前表还原。

## 直接证据与时间线

招聘记录：`30a80b85-a992-4d88-84cf-2b81eb3531fe`；岗位：市场营销策划。

轮次：`6e9f6d03-dd15-4ce3-a2f7-16dc1df730be`，仅一轮「AI HR 初面」。

会话：`interview_30a80b85-a992-4d88-84cf-2b81eb3531fe_6e9f6d03-dd15-4ce3-a2f7-16dc1df730be_6664`。

| 时间                         | 已确认事实                                                | 来源                                              |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| 9 月 11 日 22:29:30          | 轮次进入面试中，保留首次 session_started_at               | 数据库轮次、招聘事件                              |
| 22:31:58                     | 会话行已经创建                                            | 数据库 created_at；符合题目检查点先创建会话的路径 |
| 22:52:15                     | Agent 关闭，记录 `turns=56`                               | Sentry Agent breadcrumb                           |
| 22:52:15、16、18             | `/api/agent/report` 三次返回 500                          | Sentry Agent breadcrumb，与 Web 三次异常时间一致  |
| 22:52:18                     | 最终失败日志：`turn_count=56 close_reason=task_completed` | ARC-LIVEKIT-AGENT-T                               |
| 22:57:59                     | 同一会话又上报 5 条对话，`system_shutdown`，仍重试失败    | ARC-LIVEKIT-AGENT-Q                               |
| 9 月 14 日 15:37:31–15:38:10 | 同一会话再次运行，保存两句 AI 开场白，无候选人回答        | 当前会话、逐句记录、证据快照                      |

这说明她在 9 月 11 日当晚就出现过一次新的短会话，不能只把 9 月 14 日的记录称为“第二次”。数据库仍只有一个轮次和一个复用的会话 ID。

Sentry 证据：

- [首次 56 条对话上报失败，ARC-LIVEKIT-AGENT-T](https://wakuwork.sentry.io/issues/7726573821/)；事件 `cf7f26ad76d94ee8a4aabbc04310ae7d`。
- [同房间后一次 5 条对话上报失败，ARC-LIVEKIT-AGENT-Q](https://wakuwork.sentry.io/issues/7715581303/)；事件 `35115b5e2b66412c8c3225b3ece7a000`。
- [Web 通知 SQL 异常，ARC-WEB-H](https://wakuwork.sentry.io/issues/7715750554/)；首次面试第三次请求事件 `bf78d4fe02924261bc980794d93cd685`。

Web 事件异常链明确包含 `PostgresError: there is no unique or exclusion constraint matching the ON CONFLICT specification`，外层失败 SQL 含她的招聘记录 ID，冲突目标为 `on conflict ("dedupe_key") do nothing`。这不是基于相近时间推测的无关异常。

## 代码和数据库如何共同触发故障

### 1. 直接原因：新索引与旧写入代码不兼容

[迁移文件](../../apps/web/drizzle/20260911094000_notification_queue_namespace/migration.sql) 删除单列去重索引，新增 `(queue_namespace, dedupe_key)` 唯一索引。线上当前索引与该迁移一致。

事故请求仍执行单列冲突目标。历史代码 `557ee64c^` 中的通知 DAO 确实采用该写法；[当前 DAO](../../apps/server/src/server/interview-notifications/dao.ts) 已采用复合冲突目标。因此直接修复首先是核对并更新所有线上写入实例，而不是重复修改本地已有的正确代码。

可确认的是事故请求运行的 SQL 与迁移后结构不兼容；无法仅凭 Sentry 确定具体部署命令、哪次容器更新遗漏或是否存在混合版本实例。事件的 release 字段为空，当前线上版本是否已全部一致仍需部署侧验证。ARC-WEB-H 在 9 月 14 日仍出现过事件，但不能把该分组的所有事件都等同于黄笑眉的事故。

### 2. 放大原因：通知错误回滚核心面试数据

[persistReport](../../apps/server/src/server/routes/agent/route-runtime.ts) 在同一事务里依次写入会话、替换逐句记录、标记轮次完成、更新招聘节点、创建通知，最后写审计事件。通知 SQL 失败会回滚前面的所有操作。

[报告路由](../../apps/server/src/server/routes/agent/route.ts) 在 persistReport 成功返回后才创建证据快照。因此这次也没有留下包含 56 条对话的证据快照。

### 3. 反馈与刷新暴露了状态不一致

[interview-room.tsx](../../apps/web/src/components/features/interview/interview-room.tsx) 收到 ROOM_DELETED / PARTICIPANT_REMOVED 后，在组件状态中直接标记 completed。反馈入口可以出现，但该状态不等于数据库已完成。

[反馈接口](../../apps/server/src/server/routes/interview/routes/feedback/route.ts) 要求数据库状态为 completed，否则返回 409。线上反馈三个字段均为空。本地已复现相同 409，但没有捕获她浏览器当时的反馈 HTTP 请求，因此“她那次点击确实返回 409”仍是高度吻合的推断；“按钮完全没有发请求”等 UI 细节未做真实设备复现。

刷新后组件状态和 ref 丢失。[computeCanResume](../../packages/shared/src/interview/interview-record.ts) 对“in_progress 且保留房间/参与人标识”直接返回 true，不检查会话年龄或原 Agent 是否仍存活。[token 接口](../../apps/server/src/server/routes/interview/route.ts) 同样复用现有标识。前端按 canResume 自动启动。

另一个缺口是 beforeunload 只判断 userEndedRef，未判断 Agent 已结束；interrupt 请求还能给 interrupted 状态重新写 disconnectedAt。即使原断连信号缺失，过期的 in_progress 记录也不应获得无限续连资格。

### 4. Agent 进程结束后没有可靠重放来源

[agent.py](../../apps/livekit-agent/src/agent.py) 将完整转写保存在 SessionState.turns 内存中；题目结束时单独上传题目结果检查点，但不是全文。[send_report](../../apps/livekit-agent/src/report.py) 总共尝试三次，失败后记录错误并返回，没有持久化待重传全文。

`retry-summaries` 只能重试已入库对话的摘要，无法恢复从未成功入库的 56 条全文。热重连的 transcript_replay 也只重放同一进程内存，不能恢复已经退出的旧 Agent。

### 5. 后续报告没有区分不同 Agent 执行实例

同一个房间名用作 conversationId。新 Agent 的 startedAt、transcript、dataCollectionResults 直接替换旧值；逐句记录先删除再重建。题目检查点已有 answered，也会被新报告整体写成 unasked。

成功保存并创建过快照的旧全文仍可存在于历史快照中；但题目检查点没有独立版本快照。这解释了“旧全文未提交 + 旧检查点后来被覆盖”为什么最终只剩开场白。

## 本机复现与对照

只从线上导出了 public schema 的结构，复制到本机 `127.0.0.1:55439/interview_test_diagnosis`；所有候选人及对话均为虚构。Hono 路由、DAO、Drizzle 和 PostgreSQL 为真实实现，摘要生成及缓存副作用使用空实现，没有发送真实 LiveKit 连接或通知。

诊断脚本和临时数据库放在 `/tmp/interview-diagnosis.C9ckf6/`，属于本次临时诊断材料。本次结束时已停止临时数据库；在该目录尚未被系统清理时，可从仓库根目录这样重跑：

```sh
pg_ctl -D /tmp/interview-diagnosis.C9ckf6/pg -l /tmp/interview-diagnosis.C9ckf6/pg.log -o '-h 127.0.0.1 -p 55439' start
bun /tmp/interview-diagnosis.C9ckf6/repro.ts
bun /tmp/interview-diagnosis.C9ckf6/notification-rollback.ts
pg_ctl -D /tmp/interview-diagnosis.C9ckf6/pg stop -m fast
```

首个脚本使用当前代码，两次运行均得到同样 5 个 FAIL（这些是用于捕获缺陷的安全预期，不代表已修复）：

| 检查                                  | 实际结果                  |
| ------------------------------------- | ------------------------- |
| 后台尚未完成时提交反馈                | 409，面试尚未结束         |
| 三天前的 in_progress 原房间获取 token | 200，仍是原房间           |
| 刷新状态是否允许恢复                  | canResume=true            |
| 新短报告是否保留旧题目检查点          | answered 被替换为 unasked |
| 新短报告是否保留已保存的用户回答      | 只剩两个 agent turn       |

通知开启的当前代码另运行一次，也能保存报告并产生证据快照；上述状态/覆盖缺陷仍存在。

第二个脚本重放事故的最小 SQL 冲突目标，在同一事务内先保存测试回答、标记轮次完成，再插入通知：

```text
dedupe_key                  -> 42P10；轮次 in_progress；transcript 0 条
queue_namespace, dedupe_key -> 成功；轮次 completed；transcript 1 条
```

这组对照只改变冲突目标，证实数据库不兼容及事务回滚因果关系。此前反馈路由现有 4 个测试也已通过；它们验证接口规则，没有覆盖整个事故链路。未执行真实候选人页面、手机浏览器或生产部署复现。

## 建议修复顺序

### P0：消除线上 SQL / schema 不一致

1. 核对 Web API 所有实例、独立 Server、Worker 的构建版本和实际通知 DAO，确保均使用 `(queue_namespace, dedupe_key)`；当前本地代码已正确，优先修正部署一致性。
2. 发布前在与线上一致的 schema 上打开通知开关，验证真实 `/report` 201、对话保存、轮次完成、快照及通知事件创建；验证相同事件重试幂等，以及不同 namespace 可使用相同 dedupeKey。
3. 不直接补回全局单列唯一索引作为长期修复，它会破坏 namespace 隔离语义。以后此类索引替换采用兼容分阶段发布：先扩展列和新索引、升级所有写入者，在仍有旧约束时禁止跨 namespace 同键写入，最后移除旧约束并启用新语义。
4. 给线上构建配置可查询的版本标识和 Sentry release；就绪检查覆盖关键 schema 契约。不要通过在候选人记录上重放测试报告做发布验证。

### P1：报告先可靠接收，再处理通知和摘要

1. 为每份报告保存不可变接收记录，包含 roundId、独立 session/attemptId、reportId、版本或序号、内容 hash、接收时间和原始报告。先持久化接收，再确认成功；处理失败可从该记录重放。
2. 正文、题目结果、终态和可重试的最小后续工作标记完成持久化后，再异步生成通知模板、收件人投递、摘要和文档。通知业务失败不能撤销已接收的面试证据。
3. 不在已经报 PostgreSQL 错误的事务内简单 catch 后继续写；需明确事务边界。若暂时隔离非关键写入，必须使用正确 savepoint 或提交后的持久化重试机制，不能改成不可恢复的 fire-and-forget。
4. Agent 退出前把完整报告写入持久化待发送存储；三次失败后保留，由独立重试进程重新发送。进程重启后仍应可恢复。题目检查点保留版本，全文可按稳定 turnId 增量保存，最终报告用于核对和补齐。

### P1：持久化结束状态，收紧续连资格

1. 明确“通话结束”和“报告处理完成”为不同状态维度。接收到可信的结束事件后持久化终态，报告可以显示处理中/处理失败，不能因此继续签发连接凭据。
2. 客户端显式结束、Agent 结束、管理端结束复用同一结束流程，保留准确原因，不把 Agent 结束冒记成候选人主动结束。
3. canResume 与 token API 采用同一策略：必须是同一仍存活的 session/Agent，且处于固定恢复窗口；读取或重复刷新不能延长窗口。没有心跳/租约、超过会话上限或已结束的旧房间不能直接重新调度空白 Agent。
4. beforeunload 在已结束、正在结束、Agent 已结束时不再发 interrupt。刷新页面仅恢复服务端允许恢复的会话；新一次正式面试需要新的执行实例，必要时由招聘方创建新轮次。

### P1：阻止不同执行实例互相覆盖

1. roomName 不再同时承担 Agent 执行实例身份。回调携带独立 attempt/session 标识及稳定报告身份；旧回调只归档到旧实例，不能改变新实例状态。
2. 已结束实例的不同内容报告保留为版本或隔离为冲突，不能自动覆盖有效版本。相同报告重试幂等。
3. 同一执行实例按题目 revision 和 turnId 合并；不同执行实例不按 questionId 混合。短报告、缺失字段、unasked 不能抹掉已有 answered 证据。
4. 不采用简单“新报告字数更多就覆盖”的判断，它无法正确处理修订、去重、重排和不同面试实例。

### P2：反馈体验与恢复提示

1. 页面展示“已结束，正在保存结果”，并持久化/重试结束确认；报告处理尚未完成不妨碍已结束会话提交反馈。
2. 反馈按轮次幂等保存。相同内容重复提交返回已有结果；仍在有效面试中的请求不能仅凭浏览器状态绕过校验。
3. 请求错误在当前可见层明确展示，提交中禁用重复点击并有超时提示；保留草稿，刷新后可恢复。单独验证手机上的 Dialog/AlertDialog 交互，不能把接口复现当作“点击无反应”的完整 UI 复现。

## 必须通过的验收场景

- 通知数据库操作故障时，已接收全文仍可找回，结束状态不会退回面试中。
- Agent 最终报告第一次、全部三次失败，以及重启后重传，全文均不丢失。
- Agent 正常结束后立即提交反馈、立即刷新、网络断开后刷新，都不产生新的空白面试。
- 正常面试中刷新，仍可在有效窗口内恢复原 Agent；过期状态及重复刷新不能无限续期。
- 旧报告迟到、新旧 Agent 同房间或同轮次、重复报告、短报告覆盖、题目 checkpoint 与最终报告乱序均保留证据。
- 当前完成状态、招聘节点和人工判定不被迟到回调回退。
- 新旧发布版本与数据库迁移的组合有部署兼容验证；通知隔离命名空间的幂等语义保持。

## 黄笑眉数据恢复的边界

已确认首次有 56 条对话，但当前数据库、旧表、逐句表和证据快照没有首次全文，反馈也未保存。Sentry 取到的是条数、原因和 SQL 错误，不是这 56 条原文。

恢复应优先查首次 Agent 是否有独立保存的原始报告、持久卷或日志，以及是否存在独立录音对象。由于第一次数据库事务回滚，数据库备份不能被承诺含有这份从未提交的全文；事故前备份可能保留当时已提交的题目检查点。当前库未启用 WAL 归档，但这不能排除宿主机或云平台另外配置的备份。

恢复出的材料应作为带来源的历史证据导入并复核，不能用简历或当前两句开场白推造第一次面试回答。本次没有执行数据恢复或重生成评价。

## 已实施的代码修复（2026-09-14）

- 新增 `ai_interview_report_receipt`：原始报告独立提交后才确认接收，以内容 hash 幂等保存。主结果写入失败保留 pending；通知失败保留 applied；Worker 每 30 秒恢复到期任务。原始 payload 不被后续报告更新。归属在持有轮次锁时校验，轮次移除后接收记录仍随工作区保留。
- 正文、逐句表、题目结果和轮次完成状态在核心事务内提交；证据快照、通知和分析在提交后处理。通知 SQL 错误不再回滚核心结果。相同房间中先到但尚未处理的报告优先，防止新报告抢先成为当前结果。
- Agent 为执行实例生成 UUID，并传入题目检查点与完整报告。已有实例标识或开始时间不一致、正文不是已有逐句记录前缀的报告只归档。已回答题目不会被 unasked / interrupted 标记抹掉。
- Agent 发送前原子写入本地 outbox；仅在收到成功响应后删除文件。三次发送失败仍保留，独立于面试进程的补发进程定时重试；Agent 重启后也会扫描旧文件。待发送文件为 0600，文件中不保存回调密钥，不向不同 CALLBACK_BASE_URL 重放。
- 候选人明确开始/续连前不再允许预热请求签发 token。启动窗口后，续连必须确认原 Agent 在线；LiveKit 查询失败返回 503，不据此开启新会话或结束原会话。续连 token 不携带重新派发 Agent 的配置；已结束房间转 completed，重复 interrupt 不延长首次断连时间。
- 结束状态独立持久化；浏览器报告 Agent 结束时，后端验证房间状态，不把它记录成候选人点击结束。已结束页面不发送 interrupt。过期时保留房间关联，使迟到报告仍能正确归属原轮次。
- 反馈提交先重试结束确认，HTTP 错误不会被忽略，也不会通过重新加载页面状态把反馈弹窗关闭。请求有 15 秒超时；错误显示在确认弹窗中，允许原样重试；草稿按轮次保存于 sessionStorage。后端相同分类/文字的重试返回原提交结果，不改变首次时间；不同内容仍拒绝覆盖。

### 验证结果

- Server：8 个相关测试文件、28 个测试通过，包含隔离 PostgreSQL 实际路由/DAO 验证。覆盖通知索引故障与恢复、原始报告接收、证据快照、覆盖保护、反馈幂等、旧房间 token、固定重连期限、结束原因和检查点格式。
- Web：3 个相关测试文件、8 个测试通过。覆盖反馈恢复/失败/重试，以及已有的开始面试和准备视图行为。
- Agent：3 个相关测试文件、16 个测试通过。覆盖全部三次失败时先落盘、回调代理配置、独立补发进程实际重启后发送成功、不同环境禁止重放。
- Server / Web / Worker / DB schema 类型检查；Server RPC 声明构建；变更文件 lint/format、Python Ruff、`git diff --check` 已执行。
- 新 migration 已在仅有线上表结构和虚构数据的隔离库执行；再次运行 Drizzle schema 生成得到 “No schema changes”。生成时剔除了先前手写迁移已包含的通知 namespace / JD 字段 SQL，避免重复迁移。
- 本地独立浏览器页面使用实际反馈组件和样式：确认刷新后分类/文字恢复，提交中按钮禁用，失败提示出现在当前弹窗，再次提交成功展示已提交反馈。

### 发布条件与边界

本次未提交、推送或部署，未修改黄笑眉的数据，也未恢复或重生成其评价。上线时需先执行 `20260914082932_agent_report_receipts` migration，再更新 Web/Server、Worker 与 Agent，确保所有通知写入者使用当前复合唯一键。Worker 须开启现有后台处理开关；Agent 的 `AGENT_REPORT_OUTBOX_DIR` 须挂载可跨容器替换保留的具名卷或持久目录（镜像声明了卷路径，运维仍需明确挂载）。

outbox 保护最终回调已经生成后的故障，不承诺恢复 Agent 在最终报告生成前被强制杀死时仍只存在于内存的全文。未新增逐句持久化或检查点完整版本历史；冲突原始报告需由招聘方核对后再选择，当前不会自动合并不同执行实例。未验证真实手机、真实语音服务联调或生产发布兼容组合。
