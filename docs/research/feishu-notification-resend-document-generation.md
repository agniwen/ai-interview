# Platform 飞书通知重发与评价表生成链路调研

日期：2026-07-20

## 结论

可以做到，而且**当前代码已经实现了用户描述的基础行为**：Platform 飞书通知 Debugger 点击“重新发送通知”后，会先检查该条通知是否已经保存 `feishu_document_url`；有 URL 时直接复用，没有时才创建、写入并授权一份新的飞书评价表，然后用该 URL 发送通知卡片。

因此，不需要新增另一条文档生成链路。后续若要进入更严格的生产级使用，重点应放在服务级测试和并发/部分失败场景下的强幂等，而不是重复实现功能。

## 文档当前在何时生成

主流程不是在 LiveKit 通话断开时创建文档，而是在 AI 报告生成完毕后创建：

1. `runSummaryJob()` 生成 summary 和 evaluation。
2. 把会话的 `summaryStatus` 更新为 `ready`，同时写入 `transcriptSummary` 与 `evaluationCriteriaResults`。
3. 随即以 fire-and-forget 方式调用 `notifyInterviewSummaryReady()`。[源码：interview-summary-job.ts 第 121–161 行](../../apps/server/src/server/routes/agent/utils/interview-summary-job.ts#L121)
4. 通知函数要求上下文存在、状态为 `ready`、存在创建人和面试轮次；之后为每个飞书收件账号 claim 一条通知，调用文档 ensure 逻辑，再发送卡片。[源码：feishu-interview-notifications.ts 第 656–717 行](../../apps/server/src/server/routes/agent/utils/feishu-interview-notifications.ts#L656)

这意味着自动生成的精确业务时点是：**AI 报告已落库并变为 `ready`，准备发送飞书 summary-ready 通知时**。

另有一个受 `X-Agent-Secret` 保护的通知恢复接口，它可针对指定会话再次调用同一通知函数，或者批量重试 `failed`/`pending` 通知。[源码：agent/route.ts 第 334–357 行](../../apps/server/src/server/routes/agent/route.ts#L334) [源码：feishu-interview-notifications.ts 第 733–769 行](../../apps/server/src/server/routes/agent/utils/feishu-interview-notifications.ts#L733)

## Debugger “重新发送通知”完整链路

1. `/platform/notifications` 页面渲染通知表格。[源码：platform.notifications.tsx 第 63–101 行](../../apps/web/src/routes/platform.notifications.tsx#L63)
2. 行操作中的“重新发送通知”调用 React Query mutation。[源码：notifications-grid.tsx 第 313–326 行](../../apps/web/src/components/features/platform/notifications/notifications-grid.tsx#L313)
3. mutation 请求 `POST /api/platform/notifications/:id/resend`。[源码：notifications-grid.tsx 第 170–189 行](../../apps/web/src/components/features/platform/notifications/notifications-grid.tsx#L170)
4. Platform 路由受 admin middleware 保护，并把该请求交给 `resendInterviewSummaryNotification(id)`。[源码：platform/route.ts 第 628–637 行](../../apps/server/src/server/routes/platform/route.ts#L628) [源码：notifications/route.ts 第 31–42 行](../../apps/server/src/server/routes/platform/routes/notifications/route.ts#L31)
5. 重发服务校验：通知存在、类型为 `summary_ready`、带 conversation、provider 是飞书、报告已经 `ready`、存在面试轮次；不满足时在创建文档前退出。[源码：feishu-interview-notifications.ts 第 498–547 行](../../apps/server/src/server/routes/agent/utils/feishu-interview-notifications.ts#L498)
6. 服务把通知状态置为 `pending`，调用 `ensureInterviewEvaluationDocument()`，再将返回 URL 写入飞书卡片并发送；成功后更新 message ID、发送时间和 `sent` 状态，失败则标记 `failed`。[源码：feishu-interview-notifications.ts 第 549–586 行](../../apps/server/src/server/routes/agent/utils/feishu-interview-notifications.ts#L549)

## “有则复用，无则创建”当前如何工作

`ensureInterviewEvaluationDocument()` 是自动通知和手动重发共用的唯一入口：

- 先按 `notificationId` 查询 `interview_notification.feishu_document_url`。
- URL 非空：立即返回，不调用飞书创建 API。
- URL 为空：从面试上下文生成评价表 block，创建飞书 Docx、写入 block、把收件人加为编辑协作者，然后把 `documentId` 和 `documentUrl` 保存到该通知记录。[源码：feishu-interview-notifications.ts 第 390–436 行](../../apps/server/src/server/routes/agent/utils/feishu-interview-notifications.ts#L390)

数据库已经为通知记录提供 `feishu_document_id` 和 `feishu_document_url` 两列，并通过“面试记录 + 会话 + 通知类型 + 收件人 + provider”唯一索引约束通知记录身份。[源码：schema.ts 第 1676–1718 行](../../packages/db-schema/src/schema.ts#L1676)

这里的复用粒度是**每条通知记录**，不是全局每场面试一份文档。因此同一场面试如果有多个飞书 provider/收件账号，可能各自生成一份文档；同一条 Debugger 记录重发时才会稳定复用自己的文档。

底层飞书调用顺序是：

1. 使用 `tenant_access_token` 创建新版文档。
2. 向文档根 block 及各 callout 父 block 分批追加内容。
3. 以收件人的 Open ID 增加 `edit` 协作者。
4. 返回 `documentId` 和 URL。[源码：feishu-docx.ts 第 110–175 行](../../apps/server/src/server/routes/feishu/utils/feishu-docx.ts#L110)

飞书官方资料确认：新版文档是一棵 block 树；创建接口支持应用或用户 access token，文档接口存在每应用 5 次/秒的特殊频控；增加协作者接口支持 `tenant_access_token`、`openid` 和 `edit` 权限角色，但要求应用与用户满足可见性且调用身份有添加协作者权限。[飞书：创建文档](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create) [飞书：新版文档数据结构](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/docx-structure) [飞书：获取文档基本信息与频控](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/get?lang=zh-CN) [飞书：增加协作者权限](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)

## 建议的技术方案

### 第一阶段：确认现状并补齐回归测试

保留现有调用链，不新增接口或按钮。补充 `resendInterviewSummaryNotification()` 服务级测试，至少覆盖：

1. `feishu_document_url` 已存在：不调用 Docx 创建，卡片使用原 URL。
2. URL 为空：只创建一次，保存 ID/URL，卡片使用新 URL。
3. 报告不是 `ready` 或缺少轮次：不调用飞书 API。
4. 飞书创建/授权/发卡失败：通知变为 `failed` 且错误可在 Debugger 看到。
5. 已有 URL 的通知即使状态为 `sent`，手动点击重发也复用文档并刷新消息 ID/发送时间。

当前已有测试覆盖 Docx 的“创建、写块、授权”和限频重试，[源码：feishu-docx.test.ts 第 8–101 行](../../apps/server/src/server/routes/feishu/__tests__/feishu-docx.test.ts#L8)；Platform 路由测试只 mock 了重发服务，尚未覆盖 ensure 的创建/复用分支。[源码：notifications route test 第 53–66 行](../../apps/server/src/server/routes/platform/routes/notifications/__tests__/route.test.ts#L53)

### 第二阶段：如业务要求“绝不重复”，增加强幂等

基础语义当前已满足，但以下竞态仍可能重复创建：

- 两个管理员从不同标签页/客户端同时重发同一记录，都可能在 URL 为空时通过检查并各自创建文档。前端的 pending 禁用只能保护当前组件实例。
- 飞书已经创建文档，但写 block、授权或数据库更新失败；由于 ID/URL 只在所有飞书步骤成功后落库，下次重试无法识别已创建的文档，会留下孤儿文档并再建一份。[源码：feishu-docx.ts 第 114–166 行](../../apps/server/src/server/routes/feishu/utils/feishu-docx.ts#L114)

建议在 `ensureInterviewEvaluationDocument()` 外围增加数据库级互斥（例如以 notification ID 获取 PostgreSQL advisory transaction lock），锁内重新读取 URL，再决定是否创建。若还要覆盖“飞书创建成功、后续步骤失败”，则将创建过程拆为可恢复状态：

1. 创建空文档后立即持久化 `document_id` 和 `creating` 状态。
2. 后续重试如果已有 ID，则继续写入/授权该文档，而不是再创建。
3. 写入需要额外记录步骤状态，或先清理应用管理的模板区域，避免部分写入后重复追加 block。
4. 完成后保存 URL 和 `ready` 状态，再发送卡片。

若当前仅用于人工 Debugger，且能接受极低概率的孤儿文档，第一阶段通常足够；若会被自动重试、多人同时操作或计入审计，则建议实现第二阶段。

## 风险与验证点

- **陈旧 URL**：当前只判断数据库 URL 是否非空，不验证文档是否被删除、应用权限是否被撤销、HR 是否仍有编辑权。可选方案是在重发时调用“获取文档基本信息”，仅对 404/无权限提供明确的“重建或人工处理”策略，不应遇到任意网络错误就自动重建。
- **授权可见性**：官方要求 tenant 身份与被授权用户互相可见；权限或可见性错误会导致整次 ensure 失败，通知被标记 `failed`。
- **旧数据**：迁移前已有通知记录的 URL 为空；第一次重发会按预期补建文档。
- **报告更新**：已存在 URL 时当前不会更新文档内容。如果管理员重新生成了 AI 报告，再点击“重发”仍会发送原文档。需要先明确产品语义是“复用历史快照”还是“同步最新报告”；后者应是显式“更新文档”动作，不能与“有则不生成”的需求混在一起。
- **多收件人**：复用以 notification ID 为单位；验证时应分别检查不同收件账号/provider 的文档归属和权限。
- **可观察性**：建议在 Debugger 列表或详情显示 `feishu_document_url`、文档创建/复用结果，并把“重新发送通知”成功提示区分为“已复用文档”和“新建文档后发送”，便于人工确认。

## 验收矩阵

| 场景                    | 预期结果                                               |
| ----------------------- | ------------------------------------------------------ |
| 新通知、URL 为空        | 创建一份文档，保存 ID/URL，授权 HR，卡片链接指向新文档 |
| 已有 URL，再次重发      | 不调用创建接口，卡片继续指向同一 URL                   |
| 旧通知、迁移后 URL 为空 | 第一次重发补建，第二次重发复用                         |
| 报告未 ready            | 返回明确错误，不创建文档、不发卡片                     |
| 缺少 schedule entry     | 返回明确错误，不创建文档、不发卡片                     |
| 创建或授权失败          | 状态为 failed，Debugger 显示可诊断错误                 |
| 两个请求并发重发        | 若实施强幂等，应只存在一个 document ID                 |
| 文档被删除/权限撤销     | 按选定策略报错或显式重建，不静默发送坏链接             |
