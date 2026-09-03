# AI 面试结束后生成飞书 Docx：官方能力调研

日期：2026-07-20

证据基线：仅使用飞书开放平台官方文档；项目现状来自本仓库源码。最初为可行性调研，现已同步首版落地状态。

## 结论

**可以做到。** 飞书当前提供完整的服务端 API 链路：创建新版 Docx 文档、向文档写入块内容、在创建时指定文件夹、添加协作者，以及设置链接分享和组织外分享规则。

对本项目，推荐优先采用 **`tenant_access_token`（应用身份）后台自动生成文档**：面试结束事件不依赖某个用户在线，也不需要保存某位员工的长期用户授权。代价是文档归应用身份管理，且创建接口的 `folder_token` 在应用身份下只能指向**应用创建的文件夹**。创建完成后，再把 HR 用户或群组添加为协作者。

如果产品要求“文档直接出现在当前 HR 的个人云空间或其已有文件夹”，则应采用 **`user_access_token`（用户身份）**，并要求该用户对目标文件夹有编辑权限；同时需要处理增量授权、短期 access token、refresh token 轮换和授权失效。

## 项目现状

本项目已经具备复用飞书开放应用的基础：

- 技术栈是 pnpm/Turborepo monorepo：React 19 + TanStack Start/Router/Query 前端，Hono 后端，PostgreSQL + Drizzle 数据层，Better Auth 登录与组织权限，Python LiveKit Agents 语音面试，以及 Mastra 驱动的面试总结/结构化评价工作流。
- 后端是 Hono，认证使用 Better Auth `genericOAuth`；飞书 OAuth 使用 v2 token 端点 `https://open.feishu.cn/open-apis/authen/v2/oauth/token`。
- 当前两个飞书 provider 的用户登录 scope 仍只申请 `contact:user.base:readonly` 和 `contact:user.email:readonly`；文档生成使用应用身份的 `tenant_access_token`，因此不需要把 Docx 权限加入用户登录 scope。飞书开发者后台仍须为应用身份开通并发布相应权限。
- OAuth 返回的 `access_token`、`refresh_token`、各自过期时间与 `scope` 已映射给 Better Auth；数据库 `account` 表也有对应列。见 `apps/server/src/lib/server/auth.ts` 与 `packages/db-schema/src/schema.ts`。
- 项目已将自建应用 `tenant_access_token` 的获取和内存缓存提取为共享服务，并实现 Docx 创建、块写入、协作者授权及限频重试。
- 项目已有明确的最佳接入点：`runSummaryJob()` 在 Mastra 工作流生成 `transcriptSummary` 和 `evaluationCriteriaResults` 后，把 `interviewConversation.summaryStatus` 更新为 `ready`，随后调用 `notifyInterviewSummaryReady()` 发送现有飞书卡片。Docx 导出应从这个“报告 ready”事件分支触发，而不是从 LiveKit 断开或 `/api/agent/report` 刚收到原始转写时触发，否则文档内容可能尚未生成。
- 现成报告字段已经覆盖候选人、岗位、开始/结束时间、面试摘要、总分、整体评价、推荐结论、逐题评分、逐题评价、候选人原话证据，以及可选完整转写，足够组成一份结构化飞书文档。

因此，“已经能用飞书登录”不等于“现在就能写飞书文档”：还必须在开发者后台开通对应身份类型的文档权限，并让新增配置发布生效；若选择用户身份，还要让用户重新走增量授权。

## 首版落地状态

面试总结状态变为 `ready` 后，后端现在会按《面试评价表》模板创建飞书文档，保留 7 项 HR 固定提纲、将 AI 面试结果写入 HR 评价区，并保留业务一面、业务二面、HRD 和 CEO 的人工填写区。“简历”链接指向受登录权限保护的简历文件接口，“AI 面试链接”指向面试详情。文档 ID 与 URL 会写入通知记录，正常重试会复用已创建文档；飞书消息按钮也改为直接打开评价表。

首版不臆造 AI 报告中不存在的薪资、职级或团队结论。要让登录的 HR 自动获得编辑权限，应用身份除 `docx:document` 外还需要 `docs:permission.member:create`。

## 能力与接口

### 1. 创建 Docx

调用 `POST /open-apis/docx/v1/documents` 创建新版文档。请求可带纯文本 `title` 和可选 `folder_token`，返回 `document_id`；创建接口本身**不能同时写入正文**，需要在下一步调用块接口。

可选权限（满足任一即可）：

- `docx:document`：创建及编辑新版文档
- `docx:document:create`：创建新版文档

接口同时支持 `tenant_access_token` 与 `user_access_token`。[官方：创建文档](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create)

### 2. 写入块内容

调用 `POST /open-apis/docx/v1/documents/:document_id/blocks/:block_id/children`，可在父块下创建一批子块；向文档根节点写入时，`block_id` 使用 `document_id`。接口支持文本、各级标题、有序/无序列表、引用、待办、代码、表格、图片等块。单次 `children` 长度为 1～50；官方建议复杂层级内容改用“创建嵌套块”接口。

可选权限（满足任一即可）：

- `docx:document`：创建及编辑新版文档
- `docx:document:write_only`：编辑新版文档

调用身份还必须实际拥有目标文档的编辑权限。接口同时支持两类 token。[官方：创建块](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/create)

创建和块写入接口均有单应用每秒 3 次的频率限制；单篇文档并发编辑也有限制。生成面试报告时应串行或批量写块，并对 429/限频错误采用退避重试。

### 3. 创建到指定文件夹/云空间

创建文档请求的 `folder_token` 用于指定目标文件夹；不传或传空表示根目录。但不同身份有重要差异：

| 调用身份              | 指定目录的规则                                                | 适合场景                                      |
| --------------------- | ------------------------------------------------------------- | --------------------------------------------- |
| `tenant_access_token` | 创建文档接口明确限制：`folder_token` 只能指定应用创建的文件夹 | 统一的“AI 面试报告”应用目录，后台无人值守生成 |
| `user_access_token`   | 用户必须对目标文件夹拥有编辑权限                              | 直接写入某位 HR 的个人空间或其已有业务目录    |

来源：[官方：创建文档的 `folder_token` 说明](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create)。

补充限制：官方明确说明，不能简单地把“应用”直接加为文件夹协作者来获得有效权限。若要让应用访问一个既有文件夹，官方给出的方式是将应用作为群机器人加入群，然后给该群组授予文件夹可管理权限；不过创建 Docx 接口仍明确写有“应用身份仅可指定应用创建的文件夹”，因此本方案不应假设应用可直接在任意既有用户文件夹中创建报告。[官方：增加协作者权限的注意事项](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)

“指定云空间”还可能被理解为知识库（Wiki）。普通 Docx 的 `folder_token` 是云空间文件夹，不等同于知识空间。若最终需求是把报告挂为知识库节点，需要另走 Wiki 节点 API；创建知识空间本身目前仅支持 `user_access_token`，不能用应用身份创建。[官方：创建知识空间](https://open.feishu.cn/document/server-docs/docs/wiki-v2/space/create)

### 4. 设置协作者

调用 `POST /open-apis/drive/v1/permissions/:token/members?type=docx`，可添加用户、群组、部门、用户组等协作者，并授予：

- `view`：可阅读
- `edit`：可编辑
- `full_access`：可管理

最小专用权限为 `docs:permission.member:create`（添加云文档协作者）；`docx:document` 本身**不在该接口列出的可选权限中**。该接口支持两类 token，但调用身份必须有添加协作者权限，且与被授权对象满足可见性要求。`tenant_access_token` 不能添加部门协作者；添加群协作者时，应用需作为机器人处于该群中。`need_notification` 仅在用户身份调用时有效。[官方：增加协作者权限](https://open.feishu.cn/document/server-docs/docs/permission/permission-member/create)

### 5. 设置分享权限

调用新版 `PATCH /open-apis/drive/v2/permissions/:token/public?type=docx`，可以增量更新：

- 是否允许分享至组织外
- 谁可以查看、添加、移除协作者
- 链接分享范围（组织内可读/可编辑、关联组织、互联网可读/可编辑或关闭）
- 谁可评论、复制、创建副本、打印或下载

专用最小权限是 `docs:permission.setting:write_only`；该接口也接受 `docx:document` 等较宽权限，并支持两类 token。最终能否开放到组织外仍受企业安全设置约束。[官方：更新云文档权限设置（Drive v2）](https://open.feishu.cn/document/ukTMukTMukTM/uIzNzUjLyczM14iM3MTN/drive-v2/permission-public/patch)

## Token 与授权模型

### `tenant_access_token`：应用身份

- 代表应用调用 API，数据范围和资源权限属于应用身份，而不是当前登录用户。
- 自建应用通过 `POST /open-apis/auth/v3/tenant_access_token/internal` 以 `app_id`、`app_secret` 获取，无需用户 OAuth。
- 最大有效期 2 小时。剩余时间少于 30 分钟时重新请求会拿到新 token；大于等于 30 分钟时会返回原 token。因此服务端缓存并提前更新即可，不存在 refresh token。[官方：自建应用获取 tenant_access_token](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal)
- 适合面试结束后的异步、批量、无人值守报告生成；需要显式把 HR/群添加为文档协作者。

### `user_access_token`：用户身份

- 代表已登录并授权的用户调用 API，能访问的实际资源还受该用户本人的文档/文件夹权限限制。
- 授权链接的 `scope` 以空格分隔；权限必须先在开发者后台申请开通并发布生效。
- 飞书授权页支持**增量授权**：再次请求新增 scope 时，只展示历史上尚未授权的新权限；如果调用 API 缺少用户授权，官方要求重新发起授权流程。
- access token 和 refresh token 的有效期都不是应硬编码的常数，必须使用响应中的 `expires_in` 与 `refresh_token_expires_in`。官方示例通常为 access token 7200 秒、refresh token 604800 秒，但明确标注为非固定值。
- 刷新仍调用 `POST /open-apis/authen/v2/oauth/token`，使用 `grant_type=refresh_token`；响应会返回**新的 access token 和 refresh token**，应原子替换持久化的旧值。[官方：浏览器网页接入与增量授权、获取/刷新 token](https://open.feishu.cn/document/sso/web-application-end-user-consent/guide)

### 登录 scope 能否追加文档 scope？

**可以，但分两层：**

1. 在飞书开发者后台，为所选身份类型开通所需 API 权限并发布应用；仅修改代码里的 OAuth `scope` 不够。
2. 若用 `user_access_token`，在项目 OAuth scopes 中追加文档权限并让既有用户重新授权。官方明确将此流程称为增量授权，历史权限不重复展示。

若用 `tenant_access_token`，无需把文档 scope 加进用户登录授权 URL；应在开发者后台开通**应用身份权限**，服务端用应用 token 调用。不要把“应用已开通权限”和“某用户已 OAuth 授权”混为一件事。[官方：网页 OAuth 接入指南](https://open.feishu.cn/document/sso/web-application-end-user-consent/guide)

## 建议的最小权限组合

### 推荐方案：应用身份自动生成并定向分享

| 用途                                 | 建议权限                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 创建文档 + 写块                      | `docx:document`                                                                                                     |
| 添加 HR 用户/群协作者                | `docs:permission.member:create`                                                                                     |
| 设置链接分享策略（仅产品确实需要时） | `docs:permission.setting:write_only`；由于 `docx:document` 也是该接口接受的权限，若已经开通可先确认是否还需单独申请 |

以上权限应选择“应用身份”开通。为遵守最小权限原则，若报告只通过明确协作者分享，就不要开启组织外链接分享。

### 用户身份写入 HR 的个人目录

OAuth 请求至少需要加入：

- `docx:document`（创建并写入）
- `offline_access`（需要在用户不在线时长期刷新 token）
- `docs:permission.member:create`（如果需要再添加其他协作者）
- `docs:permission.setting:write_only`（如果需要修改链接分享策略）

并让用户重新完成增量授权。飞书官方网页 OAuth 指南的可刷新授权示例包含 `offline_access`，并返回 refresh token；当前项目的 scope 列表没有显式请求该权限。当前项目已有 token 字段映射和数据库列，但本次代码检查没有发现项目自定义的 v2 refresh 执行路径；实施前应验证 Better Auth `genericOAuth` 在当前锁定版本是否会自动轮换飞书 refresh token，否则需要补充服务端刷新与并发保护。这个判断是项目实现风险，不是飞书 API 能力限制。

## 推荐落地流程

```text
AI 面试结束且报告数据落库
  -> 幂等任务（以 round/conversation id 防重复）
  -> 获取 tenant_access_token
  -> 创建 Docx（标题 + 应用自有 folder_token）
  -> 批量/嵌套写入报告块
  -> 添加 HR 用户或 HR 群为 view/edit 协作者
  -> 可选：收紧或开启链接分享设置
  -> 保存 document_id、URL、生成状态与错误信息
  -> 可选：通过现有飞书通知链路发送文档链接
```

建议将数据库中的面试报告继续作为事实源，飞书 Docx 作为可重建的输出物，而不是唯一存储。创建、写块、授权是多步远程调用，必须用幂等键和可重试状态记录处理“文档已创建但内容/权限未完成”的部分成功场景。

### 建议的文档内容

首版只输出当前系统已经生成的数据，不新增一次 LLM 调用：

1. 候选人、目标岗位、面试轮次、时间和时长
2. 总分、推荐结论、整体评价
3. 面试摘要
4. 逐题评分、评价和候选人原话证据
5. 可选的完整转写与后台详情链接

默认不把完整转写放进文档更稳妥：它包含更多个人信息，文档也会明显变长。可以先只输出报告和证据片段，再由产品设置决定是否附录完整转写。

### 建议的代码落点

- 在后端飞书路由自有目录下新增 Docx client/renderer，例如 `server/routes/feishu/utils/`，保持 Hono 后端可独立运行，不依赖 TanStack Start 请求原语。
- 从 `runSummaryJob()` 成功分支触发独立的 `exportInterviewReportToFeishu()`，并让现有通知卡片在导出成功后带上文档链接；导出失败不应把已经成功生成的面试报告标为失败。
- 建议新增独立导出记录，至少持久化 `conversationId`、provider、`documentId`、URL、状态、错误、尝试次数和时间戳。以 `conversationId + provider` 建唯一约束，避免 agent 重报、summary retry 或进程重启创建多份文档。
- 首版用文本、标题、列表和引用块即可；不必先实现复杂表格、图片或模板系统。块写入应尽量单次批量完成，并对飞书限流做退避重试。

## 待产品确认的选择

实施前只需确认两个会改变鉴权方案的问题：

1. 报告要落在统一的“应用报告目录”，还是每位 HR 自己的已有飞书目录？前者选应用身份，后者选用户身份。
2. 报告默认只分享给指定 HR/群，还是允许组织内持链接访问？前者只需添加协作者，后者还要更新分享权限。
