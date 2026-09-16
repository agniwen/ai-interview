# 历史包袱清理与安全优先级

核查日期：2026-09-15。代码基线：`a2ea668eb`。本轮完成低风险代码清理；未提交、未部署、未修改环境配置或业务数据。

## 本轮已完成

1. 移除岗位 DAO 的四个废弃别名及 Server 包装：`listAllJobDescriptions`、`loadJobDescriptionById`、`jobDescriptionIdsExist`、`fetchJobDescriptionsByCodes`。岗位管理、表单和题目模板使用原别名实际指向的管理端函数；招聘读取继续使用发布状态过滤。更新数据库作用域测试，验证调用仍经过 Server 数据库绑定。
2. 移除 Web/Desktop 的空字符串 `cossControlOverlayClass`，及 Checkbox、RadioGroup、Calendar、Web InputOTP 中的无效引用。保留其他样式、属性和事件处理。
3. 删除无源码调用方的 Desktop `components/title-bar.tsx` 转导出文件；现有调用均使用 `components/layout/chrome.ts`。
4. 删除无源码调用方的 `legacyJobDescriptionUpdateSchema` 及其专用导入。当前保存契约、仍有调用的结构化协议和历史结果读取未改动。

代码位置：

- [岗位 DAO 实现](../../packages/resume-processing/src/internal/studio/job-descriptions/dao.ts)
- [Server 数据库绑定](../../apps/server/src/server/routes/studio/routes/job-descriptions/dao.ts)
- [岗位保存契约](../../packages/shared/src/job-descriptions.ts)
- [Web 样式](../../apps/web/src/components/ui/coss-style.ts)
- [Desktop 样式](../../apps/desktop/src/renderer/src/components/ui/coss-style.ts)

## 数据库核查结果

读取各应用自己的 `.env`，凭据未输出或保存到本报告。所有数据库查询均在 `READ ONLY` 事务中执行，验证 `transaction_read_only=on`，每条语句超时限制为 8 秒。仅检查结构与聚合数量，没有读取候选人内容。

| 项目                                 | Server/Web 配置：`ainterview` | Worker 配置：`ainterview-dev` |
| ------------------------------------ | ----------------------------: | ----------------------------: |
| 岗位总数                             |                           129 |                           128 |
| qualitative + published 岗位         |                           129 |                           128 |
| 无 JD 版本的岗位                     |                             0 |                             0 |
| 旧升级草稿                           |                             5 |                             5 |
| 草稿关联岗位为 qualitative           |                             5 |                             5 |
| 当前结果仍为 legacy 的招聘记录       |                            47 |                            47 |
| 当前结果仍为 structured 的招聘记录   |                           394 |                           395 |
| 当前结果为 qualitative-v2 的招聘记录 |                           374 |                           249 |
| 33 张旧归档表中非空表数              |                            31 |                            31 |
| 旧 studio_interview 行数             |                         1,802 |                         1,802 |
| 旧 resume_evaluation_version 行数    |                         1,855 |                         1,855 |
| meeting_session.processing_owner     |         device 63 / worker 16 |                    字段不存在 |

这些是查询时的快照，不保证之后不变。配置指向不同数据库并不自动说明部署错误，但不能用一个库的迁移状态推断另一个库，更不能假设本地 Worker 所连库已支持当前 Echo 所有权协议。

旧格式评价确实仍被作为当前结果使用，历史展示不能删除。旧升级草稿均挂在 qualitative 岗位上，是待核查的归档候选，不是旧升级入口仍有用户使用的证据。归档表非空也不能证明存在运行时消费者；删除前还需迁移逐项核对、消费者调查和保留策略。

## 后续优先级：从安全到高风险

以下是首轮实施顺序，不是故障严重程度。首轮仅实施第一项；第二轮的进一步拆分与结果见文末。

| 顺序 | 清理对象                                      | 风险及本轮判断                                               | 下一步可验证的退出条件                                                                                          |
| ---- | --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1    | 废弃别名、空样式、无人引用文件与 Schema       | 低，已完成                                                   | 调用者改用等价实现，类型检查与相关测试通过                                                                      |
| 2    | 旧岗位预览、评分草稿、发布、升级写入口        | 中；岗位均已 qualitative，适合作为下一轮重点                 | 核对全部 HTTP/脚本消费者和部署访问记录；明确处理 5 份残留草稿；保持单次保存、权限、JD 版本与审计契约            |
| 3    | 旧评价生成分支                                | 中高；数据库没有旧模式岗位，但不能据此判定所有旧任务已退出   | 检查 Redis 等待、延迟、失败重试任务和所有生成入口；确认都携带正确 JD 版本；单独退出旧生成逻辑，保留全部历史读取 |
| 4    | Web/Desktop 重复组件                          | 中；当前同路径 TS/TSX 文件 110 个，41 个完全相同，含测试文件 | 按组件核对依赖、Tailwind 扫描、平台差异、打包与视觉效果，再抽取共同部分；内容相同不代表适合整批搬移             |
| 5    | resume-processing 的旧内部布局、Server 转接层 | 中；当前作用域绑定仍是必要依赖边界                           | 选择一个完整能力逐步收敛接口，验证 Server/Worker 调用及 AsyncLocalStorage 作用域；不能直接删绑定层              |
| 6    | 聊天 UIMessage / ArcMessage 转换              | 中高；正常新消息写入仍调用旧名转换器                         | 先明确输入协议和存储协议边界，覆盖消息、附件、工具结果及重生成路径；历史消息已迁移也不代表转换器可删            |
| 7    | 真人面试旧录音任务格式                        | 高；本轮未核查 Redis 存量和旧生产者                          | 旧生产者退出、旧版等待/延迟/失败可重试任务清零；核对混音/分轨播放与重试回归                                     |
| 8    | Echo 旧服务端入口和设备所有权拦截             | 高；主库仍有 Worker 所有记录，另一个库缺所有权字段           | 区分仍有效的 Worker 任务和待迁移 Echo 任务；核对部署版本、旧客户端、恢复及同步行为；保留跨所有者隔离            |
| 9    | 归档表、历史评价结构及读取兼容                | 最高；旧表仍有数据，旧评价仍是当前结果                       | 先界定审计保留要求、完成新旧迁移对账与备份恢复验证；物理删表或删除结果需要单独的数据变更方案                    |

相关实现：

- [旧岗位生命周期入口](../../apps/server/src/server/routes/studio/routes/job-descriptions/route.ts)
- [评价生成分支](../../packages/resume-processing/src/internal/studio/resumes/utils/review-generation.ts)
- [包数据库作用域](../../packages/resume-processing/src/database.ts)
- [聊天消息写入](../../apps/server/src/server/routes/chat/routes/conversations/route.ts)
- [录音任务协议](../../packages/meeting-processing-queue/src/human-interview-recording.ts)
- [Echo 所有权拦截](../../apps/server/src/server/routes/meetings/routes/device/legacy-guard.ts)
- [新旧数据库表定义](../../packages/db-schema/src/schema.ts)

### 可复核的只读查询

以下示例应分别在确认过的目标库上以只读事务执行；检查字段是否存在后再运行与该字段相关的查询。

```sql
BEGIN READ ONLY;
SET LOCAL statement_timeout = '8s';
SELECT current_database(), current_setting('transaction_read_only');

SELECT evaluation_mode, lifecycle_status, count(*)
FROM job_description
GROUP BY 1, 2;

SELECT split_part(e.contract_version, ':', 1) AS contract, count(*)
FROM recruiting_record r
JOIN recruiting_resume_evaluation e ON e.id = r.current_evaluation_id
GROUP BY 1;

SELECT j.evaluation_mode, count(*)
FROM job_description_evaluation_upgrade_draft d
JOIN job_description j ON j.id = d.job_description_id
GROUP BY 1;
ROLLBACK;
```

## 验证

- 类型检查通过：Server、Web、Desktop（Node + Renderer）、Worker、resume-processing、shared。
- 直接相关测试 23 项通过：Server 岗位 DAO 绑定 1 项、resume-processing 数据库作用域 2 项、shared 岗位保存/结构化契约 18 项、Web Checkbox/Calendar 2 项。
- 变更文件 lint/format 与 `git diff --check` 通过。
- 额外检查简历路由行为测试：12 项通过、3 项失败；已在未修改的 `a2ea668eb` 上复现相同失败。涉及完整表单绑定岗位返回 400，以及测试替身缺少新数据库实现需要的事务/查询能力；没有为本次清理修改这些既有测试。
- 未启动浏览器或 Electron 做人工视觉验收；组件改动仅去除空字符串类名和无人引用入口，已有 Web 组件测试通过。
- 未运行连接真实数据库并写入测试数据的集成套件，未执行实际模型调用、迁移或队列变更。

## 第二轮：进一步核查与清理

核查时间：2026-09-15 16:27–16:29（Asia/Shanghai）。保留首轮所有未提交改动。

### 已完成的低风险清理

- 移除岗位表单中没有调用方的 `recordEvaluationPreview`、`toStructuredDraftValues` 和 `JobDescriptionRegeneratePreviewModal`。
- 移除 `JobDescriptionSubmitAction`、未使用的提交动作参数及仅承载该参数的 `onSubmitMeta`。表单继续走原有保存函数、校验和请求体。
- 移除 DataGrid 的 `PINNED_EDGE_LEFT_BORDER_CLASS` / `PINNED_EDGE_RIGHT_BORDER_CLASS` 兼容别名；运行时本来就使用 start/end，保留左右滚动边界行为测试。
- 将岗位表单 Tab 测试描述改为当前表单语义，继续覆盖旧 preview Tab 不被接受。

### 新增队列及数据库证据

Redis 使用各应用自己的 URL 和代码定义的队列作用域，以直接只读命令检查列表/有序集合及任务 payload 的类型。没有构造可能初始化队列元数据的 BullMQ Queue，没有重试、删除或重新入队。检查 wait、active、paused、delayed、prioritized、waiting-children、failed；未检查 completed 和其他未配置的作用域。仅输出聚合数，不输出任务 ID 或 payload 内容。

| 检查项                                           | Server 配置作用域                                   | Worker 配置作用域                        |
| ------------------------------------------------ | --------------------------------------------------- | ---------------------------------------- |
| resume-review-generation 等待任务                | 24，全部为 resume_pool_import_questions             | 0                                        |
| resume-review-generation 失败任务                | 0                                                   | 1，resume_upload                         |
| 评价队列其他已检查状态                           | 0                                                   | 0                                        |
| human-interview-recording 已检查状态             | 全部为 0                                            | 全部为 0                                 |
| 数据库 queued/processing 评价                    | 1 条 qualitative-v2 queued，缺少 JD 版本            | 1 条 qualitative-v2 queued，缺少 JD 版本 |
| human_interview_meeting.recording_tracks 为 NULL | 68 条，其中 65 条没有 processing_meeting_session_id | 同左                                     |

数据库统计继续使用带超时的只读事务。这些查询不是跨 PostgreSQL/Redis 的原子快照。没有断言失败任务与 queued 评价是一对，也没有断言上述 65 条会议满足完整恢复条件；是否可恢复还取决于录音状态、文件完整性和终态错误标记。

### 风险修订与可执行顺序

1. **旧岗位前端尾部代码：低风险，已完成。** 当前保存页面无需旧评分预览 helper、旧确认弹窗或提交动作分流。这部分不依赖历史数据，也不改变 HTTP 接口。
2. **评价入口的 JD 版本完整性：建议下一轮先处理，风险中等。** [回填脚本](../../apps/server/src/scripts/backfill-recent-resume-evaluations.ts) 仍不传 `jobDescriptionVersionId`；[生成入口](../../packages/resume-processing/src/internal/studio/resumes/utils/review-generation.ts) 没有版本时会读取岗位模式，非 structured 随后进入 legacy 路径。应先覆盖并修正旧工具对 qualitative 岗位的调用，再核查 queued 记录是否仍有效；没有这些前置工作不能直接删除旧分支，也不能自动重评数据。
3. **旧岗位后端写接口：中等风险，可以独立做退役方案。** 当前 Web/Desktop 客户端搜索未发现预览、规则草稿或升级发布调用；旧 lifecycle/upgrade 逻辑又限制 structured draft 或 legacy published 岗位。岗位数据已迁移只能降低风险，尚未核查外部客户端和部署访问日志，不能据此宣称所有接口可立即删除。5 份残留草稿的读取/归档应与写接口退役分开。
4. **真人录音旧格式：仍为高风险，不能因队列为空而删。** [Worker 恢复 DAO](../../packages/meeting-processing/src/human-interview-recording-dao.ts) 会从无 tracks 的双文件会议重新构造旧任务，[Worker](../../apps/worker/src/index.ts) 定时执行恢复；[LiveKit 回调](../../apps/server/src/server/routes/livekit/route.ts) 的录音结果入口也保留旧 payload 生产路径。先迁移生产与恢复链路，再考虑移除消费者。
5. **历史结果、归档表、Echo 所有权隔离：维持原判定。** 本轮没有新的证据支持删除。聊天格式转换和包数据库绑定仍有正常调用，不作为死代码处理。

### 第二轮验证

- 修改前相关基线 10 项测试通过；修改后岗位 Tab、岗位 HoverCard、DataGrid 边界共 13 项测试通过。
- Web 类型检查通过；修改文件 lint/format、差异空白及报告相对链接检查通过。
- 本轮没有修改 Server/Worker 运行时代码，也没有修改数据库或队列数据；未做浏览器或 Electron 实机验收。

## 队列任务年龄复核

2026-09-15 17:06（Asia/Shanghai）只读检查用户指定的 24 个等待任务和 1 个失败任务；下面时间均为北京时间。

| 对象                  | 数量 | 入队时间                     | 最后执行与当前状态                                                          |
| --------------------- | ---: | ---------------------------- | --------------------------------------------------------------------------- |
| Server 面试题生成任务 |    4 | 2026-08-20 00:25:15–00:25:18 | 等待约 26.7 天；无开始/结束时间，启动及失败次数均为 0                       |
| Server 面试题生成任务 |   20 | 2026-08-21 00:11:22–00:53:19 | 等待约 25.7 天；无开始/结束时间，启动及失败次数均为 0                       |
| Worker 简历评价任务   |    1 | 2026-08-20 22:09:58          | 最后启动及失败于当日 22:14:06，之后约 25.8 天无执行；启动次数 3、失败计数 1 |

这些是 Redis 任务自身的 timestamp、processedOn、finishedOn、ats、atm 和 failed 集合时间，不是候选人创建时间。按用户提出的久置任务可视为无用的标准，这 25 个任务可列为过期清理候选，不再作为近期活跃消费者的证据；本次尚未删除或重试任务。其年龄不能单独证明旧生产代码及恢复链路已退出，也不能证明数据库中的 queued 评价就是同一批任务。

## 第三轮：25 个任务已确认失效并清理

用户明确授权确认无用后清理。本轮将任务 payload 中的招聘记录 ID 和工作区逐一关联到 PostgreSQL，再跨两个数据库复核 ID（不限定工作区），排除查错库或工作区条件不匹配。

### 已确认的事实

- **24 个题目任务属于测试夹具遗留。** 全部工作区 ID 为 `resume_pool_bind_org_a`，与 [bind.test.ts](../../apps/server/src/server/routes/studio/routes/resume-pool/__tests__/bind.test.ts) 的 `ORG_A` 一致。该工作区和全部目标记录都已不存在。当前该测试已注入 `enqueueCandidateQuestionGeneration` mock，不再通过这个调用点写真实队列；本轮未执行会写真实数据库的集成测试。
- **1 个失败评价任务已无业务对象。** 失败类别是 stalled（任务处理停滞），关联招聘记录不存在；任务原工作区仍存在，不能把它同样认定为测试任务。没有证据可以进一步确定记录当时被删除的原因。
- 两个库中，这 25 个 ID 在 `recruiting_record`、`studio_interview`、`recruiting_migration_map`（源/目标 ID）及 `recruiting_resume_evaluation` 中的匹配数均为 **0**。因此不是迁移换号后遗漏查询，也与先前发现的两条 queued 评价无关。
- 对当前消费路径进行了只读回放，明确禁用外部 HTTP、模型生成及写操作。24 个任务经过实际题目生成入口返回 `missing_profile`；1 个任务经过 Worker 分派和实际评价 lifecycle，以只读查询适配器确认目标不存在后返回 `skipped:missing_record`。结果：`ORPHAN_REPLAY_PASSED 25/25`。这不是模型重跑，也没有重新入队。

### 清理操作与验证

1. 保存每个任务的原始 Redis 序列化内容、hash、日志（若存在）、TTL、队列位置/失败分值及操作结果。备份目录：`/Users/wen/.codex/backups/ai-interview/orphan-queue-20260915-cp8LRH`，目录仅当前用户可访问，文件权限 0600；不含环境配置或连接凭据。
2. 删除前再次确认数据库无目标记录、任务数据与原时间戳未改变、任务仍处于预期状态、没有父子依赖或锁。
3. 使用 BullMQ `Job.remove({ removeChildren: false })` 定向删除；其原子脚本会拒绝删除被 Worker 锁定的任务。未清空队列、未重试任务、未更改数据库记录。
4. Server 删除 **24** 个，Worker 删除 **1** 个；逐个验证任务 hash、wait 索引和 failed 索引均不存在。完成时两个作用域的 wait/active/failed 数量均为 **0**。

这批遗留任务已经处理完毕，不再构成旧执行分支的保留依据。正常招聘导入仍会生成有效题目任务，旧录音恢复链路也另有生产者，因此本轮没有把整个任务协议或业务功能删除。先前两条 queued 评价和升级草稿均未修改。
