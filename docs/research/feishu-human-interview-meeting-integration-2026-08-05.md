# 真人面试接入飞书会议与会后纪要：官方能力调研

查阅日期：2026-08-05

证据基线：飞书开放平台、飞书帮助中心及 Lark 官方文档。本文不包含实现改动。

## 结论先行

可以在现有飞书自建应用上增加会议能力，不必为了“创建飞书会议”再创建一个机器人。但是要准确区分三件事：

1. **机器人只是自建应用的一项能力**。真正创建会议的是该应用凭 `tenant_access_token` 或某位员工的 `user_access_token` 调用 VC / Calendar OpenAPI；“机器人能发消息”不自动等于“已有会议权限”。同一个应用可以同时拥有机器人、日历、会议和事件订阅能力，但每项 API 权限仍需单独申请、发版并经租户管理员审核。[官方：申请 API 权限](https://open.feishu.cn/document/server-docs/application-scope/introduction?lang=zh-CN)
2. **直接预约会议和创建飞书日程不是同一条链路**。`POST /vc/v1/reserves/apply` 会返回会议链接、9 位会议号和密码，但官方明确说明它不会生成日程、不会显示在日历中。[官方：预约会议](https://open.feishu.cn/document/server-docs/vc-v1/reserve/apply?lang=zh-CN) 如果公司习惯包括日历邀请、提醒和参与人 RSVP，应改用 Calendar v4 创建日程并设置 `vchat.vc_type=vc`，再单独添加日程参与人。[官方：创建日程](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN)
3. **会议结束、录制完成、纪要生成是三个不同的异步时点**。会议结束事件不代表录制文件或转写已经可用；应至少监听 `recording_ready`，智能纪要则有单独的 `vc.note.generated_v1` 事件。[官方：会议结束](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/meeting_ended?lang=zh-CN) [官方：录制完成](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/recording_ready?lang=zh-CN) [官方：纪要生成](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/events/generated)
4. **“拿到纪要 ID / 文档 token”不等于“拿到正文”**。完整逐字稿最直接的接口是妙记导出接口，返回 `txt` 或 `srt` 二进制流；智能纪要接口只返回纪要文档、逐字稿文档的 `doc_token`，随后还要以实际拥有文档阅读权的身份读取 Docx 内容。[官方：导出妙记文字记录](https://open.feishu.cn/document/minutes-v1/minute-transcript/get) [官方：获取纪要详情](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/get) [官方：获取文档纯文本内容](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)

对本项目，建议先确定产品目标，再选链路：

- 如果只要求保持当前“生成记录 -> 复制链接”的体验，优先用 **应用身份直接预约 VC**，由创建该真人面试的内部 HR 作为 `owner_id`，设置内部面试官为主持人，候选人仅通过链接参会。
- 如果“符合公司的飞书习惯”还意味着进入飞书日历、给内部面试官发送日程邀请和提醒，则应优先用 **用户身份在 HR 的主日历创建日程 + 飞书会议**。应用身份也能在应用日历建日程，但组织者是 Bot，官方禁止它指定主持人，并要求 `allow_attendees_start=true`，体验并不等同于员工本人发起的日程。[官方：创建日程的主持人约束与错误码 193101/193102](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN)

## 本仓库当前基础与缺口

当前代码已经具备复用同一飞书应用的技术基础：

- 已配置两个飞书 OAuth provider，并有按应用获取、缓存 `tenant_access_token` 的服务。当前用户 OAuth scope 只有通讯录基础信息和邮箱权限，尚无 VC、Calendar、妙记、纪要或 `offline_access`。[源码：auth.ts](../../apps/server/src/lib/server/auth.ts) [源码：feishu-access-token.ts](../../apps/server/src/lib/server/feishu-access-token.ts)
- 已有基于 `@larksuite/vercel-chat-adapter@0.1.2` 的机器人长连接，只处理 Chat SDK 所需的消息、卡片动作和 reaction 等事件。[源码：bot.ts](../../apps/server/src/server/routes/feishu/utils/bot.ts) [依赖版本：package.json](../../apps/server/package.json)
- **这个 adapter 不能直接承接 `vc.*` / `minutes.*` 通用事件。** 其公开能力是 Chat adapter；底层 `LarkChannel` 注册的是 `im.message.receive_v1`、卡片、reaction、bot-added 和评论事件，没有暴露通用 `EventDispatcher.register()`。VC/妙记事件需要另用官方 Node SDK 的 `EventDispatcher + WSClient`，或建设官方 Webhook 接收端；不能假设现有 `bot.onDirectMessage()` 长连接会自动收到会议事件。[官方 adapter README](https://github.com/larksuite/vercel-chat-adapter) [官方 Node SDK：事件处理](https://github.com/larksuite/node-sdk#event-processing)
- 现有真人面试记录只保存本地 LiveKit 房间、邀请 token、录制字段和业务状态，没有飞书 `reserve_id`、`meeting_id`、`meeting_no`、Calendar `event_id`、纪要/妙记 token 或飞书同步状态。[源码：human-interview-meetings.ts](../../apps/server/src/server/routes/studio/routes/interviews/dao/human-interview-meetings.ts)
- 现有本地用户 ID 不是飞书用户 ID。飞书 OAuth 返回的 `open_id` 被保存为 OAuth account 的 provider account ID；创建会议时必须取与当前飞书应用匹配的账号标识，不能把本地 UUID 直接传给飞书。

此外，仓库同时存在两个飞书应用。`open_id` 是“用户在某个应用中的身份”，同一用户在两个应用下的 `open_id` 不同；必须把会议的 provider/app 固化在记录上，并使用同一应用签发的 token 和用户 ID。若改用租户内跨应用稳定的 `user_id`，还需申请字段权限 `contact:user.employee_id:readonly`。[官方：预约会议的 `user_id_type`](https://open.feishu.cn/document/server-docs/vc-v1/reserve/apply?lang=zh-CN)

## 两种创建方式

### 方案 A：直接预约 VC，最接近当前“复制链接”流程

接口：`POST /open-apis/vc/v1/reserves/apply`

官方当前接口页同时支持 `tenant_access_token` 和 `user_access_token`。应用身份调用时：

- `owner_id` 必填，且必须是同租户的合法飞书用户；用户身份调用时该字段不生效。
- `end_time` 是预约到期时间，Unix 秒级时间戳；多人会议必填。只支持预约最近 30 天内到期的会议，到期后会议号释放。
- 可设置 `auto_record=true`。
- 可通过 `assign_host_list` 指定主持人，最多 10 个，并且只支持同租户飞书用户。接口会在 `invalid_host_id_list` 中返回无效主持人 ID。
- 返回 `reserve_id`、9 位 `meeting_no`、`password`、浏览器/客户端可打开的 `url`、唤起飞书客户端的 `app_link` 和直播链接。`reserve_id` 不是 `meeting_id`；实际会议 ID 只在会议开始后生成。
- 频控为 1000 次/分钟、50 次/秒。

来源：[官方：预约会议](https://open.feishu.cn/document/server-docs/vc-v1/reserve/apply?lang=zh-CN) [官方：获取预约](https://open.feishu.cn/document/server-docs/vc-v1/reserve/get?lang=zh-CN)

这条链路的最大问题不是能否创建，而是**它没有日程语义**：没有 `scheduledAt` 对应的日历事件、参与人邀请、忙闲占用和日历提醒。当前系统仍需以自己的 `scheduledAt` 为准，飞书的 `end_time` 只是会议号有效期，不是面试开始时间。

官方 VC 概述页（最后更新于 2024-11-08）的能力表把预约、更新、删除、获取预约写成仅 `user_access_token`，但当前具体接口页明确接受两种 token，并专门定义了应用身份必填的 `owner_id`；当前官方 Go SDK 也已经生成预约资源与应用 owner 字段。这是官方文档内部不一致。本文据更具体、更新的接口契约判断 `tenant_access_token` 可用，但仍把生产租户的 API 调试台冒烟测试列为上线前置，不把文档漂移当作已由本地代码验证的事实。[官方：VC 概述](https://open.feishu.cn/document/server-docs/vc-v1/video-conferencing-overview?lang=zh-CN) [官方 Go SDK：VC resource](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/vc/v1/resource.go) [官方 Go SDK：VC model](https://github.com/larksuite/oapi-sdk-go/blob/v3_main/service/vc/v1/model.go)

### 方案 B：创建飞书日程并附带 VC，更符合内部协作习惯

接口：`POST /open-apis/calendar/v4/calendars/:calendar_id/events`，请求中设置：

- `start_time` / `end_time`：秒级时间戳，并显式传 IANA 时区，例如 `Asia/Shanghai`。
- `vchat.vc_type=vc`。
- `meeting_settings.join_meeting_permission=anyone_can_join`，才能覆盖外部候选人场景；另有仅企业内、仅日程参与者两种模式。
- `auto_record=true`；可选等候室、是否允许参与者发起会议。
- 创建日程接口本身不添加参与人，需再调用“添加日程参与人”。

应用身份创建日程还存在以下约束：

- 应用必须已开启机器人能力。
- 当前身份需对目标日历有 `writer` 或 `owner` 权限，日历只能是主日历或共享日历。
- 在应用日历上创建 VC 时可以设置内部员工为会议 `owner_id`，但**不允许设置 `assign_hosts`**；组织者是 Bot 时，`allow_attendees_start` 必须为 `true`。因此“机器人代员工建日程”和“员工本人组织会议”的主持人体验不同。
- 若用员工的 `user_access_token` 在其主日历创建，才能自然地让该员工成为日程组织者并由组织者指定主持人；代价是要获取、刷新并长期保存用户 token。
- 官方还注明：日程标题包含“晋升、绩效、述职、调薪、调级、复议、申诉、校准、答辩”任一词时，系统不会生成会议纪要。真人面试标题应避免误中该规则。

来源：[官方：创建日程](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN)

## 身份、权限与管理员授权

### 应用身份（`tenant_access_token`）

适合后台无人值守建会、接收全局事件、在会议结束后异步拉取结果。token 代表应用，不代表当前 HR；资源归属和可见范围由接口规则、`owner_id` 与应用数据权限共同决定。

建议的最小权限组合：

| 用途                                | 权限                                                                 | 备注                                                      |
| ----------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| 创建/更新预约                       | `vc:reserve`                                                         | 高级权限；直接预约方案必需                                |
| 读取预约                            | `vc:reserve:readonly`                                                | 保存后校验、恢复任务时使用                                |
| 读取会议和订阅会议事件              | `vc:meeting.meetingevent:read` 或 `vc:meeting:readonly`              | 会议结束、录制完成事件均接受其中任一                      |
| 获取录制文件                        | `vc:record:readonly`                                                 | 支持应用身份或用户身份                                    |
| 获取会议关联的智能纪要/逐字稿 token | `vc:meeting.artifact.note:read`、`vc:meeting.artifact.verbatim:read` | 是“字段权限”，需与读取会议权限同时存在                    |
| 导出妙记转写                        | `minutes:minutes.transcript:export`                                  | 新应用应使用该权限，旧 `minutes:minute:download` 不再开放 |
| 读取妙记基础信息                    | `minutes:minutes.basic:read` 或 `minutes:minutes:readonly`           | 用于检查妙记是否 ready、所有者和 URL                      |
| 创建飞书日程                        | `calendar:calendar.event:create`                                     | 仅日程方案需要；应用身份还需机器人能力与日历权限          |
| 读取纪要/逐字稿 Docx                | `docx:document:readonly`                                             | 只有 API scope 不够，调用身份还必须实际有目标文档阅读权   |

应用身份访问妙记还要配置**妙记数据权限范围**。官方明确：默认未配置时无法读取；需要把妙记所有者纳入数据权限范围，发布应用并通过审核后才生效。[官方：配置应用数据权限](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)

### 用户身份（`user_access_token`）

适合“以实际 HR 身份组织日程”和订阅该用户可见的智能纪要。需要：

- 在开发者后台开通对应的用户身份权限并发布。
- OAuth scope 至少加入实际需要的 `vc:reserve` / `calendar:calendar.event:create` / `vc:note:read` / `minutes:minutes.basic:read`，以及后台长期处理所需的 `offline_access`。
- 让已登录用户重新进行增量授权；短期 access token 过期后用 refresh token 轮换，不能假设登录时拿到的 token 永久有效。
- `vc.note.generated_v1` 的订阅不是只在开发者后台勾选事件就完成：还要用**每个目标用户的** `user_access_token` 调用一次纪要订阅 API。妙记的 `minutes.minute.generated_v1` 同样是用户身份订阅模型。

来源：[官方：API 权限类型与审核](https://open.feishu.cn/document/server-docs/application-scope/introduction?lang=zh-CN) [官方：权限列表中的 `offline_access`](https://open.feishu.cn/document/server-docs/application-scope/scope-list?lang=zh-CN) [官方：订阅纪要变更事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/subscription)

### 审核流程

API scope 是按应用独立授权的。自建应用新增权限后，需要提交版本，由租户管理员审核；涉及应用身份读取妙记时还要配置数据范围并再次发版审核。仅修改代码里的 OAuth scopes 或已经有一个能收发消息的机器人，都不会让会议权限自动生效。[官方：申请 API 权限](https://open.feishu.cn/document/server-docs/application-scope/introduction?lang=zh-CN) [官方：配置应用数据权限](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)

## 会后事件与纪要获取链路

### 1. 会议生命周期事件

建议订阅：

- `vc.meeting.meeting_ended_v1`：会议结束。
- `vc.meeting.recording_ready_v1`：录制文件上传完毕；只有收到此事件后，官方才建议获取录制文件。

这两类都是飞书事件订阅事件，可通过官方 Webhook 或长连接方式消费；官方标注“仅通过 Open API 预约的会议会产生此类事件”。事件携带真实 `meeting_id`、会议号、owner；录制完成事件还带录制 URL 和时长。录制 URL 形如 `https://meetings.feishu.cn/minutes/{minute_token}`，可由 URL 取得妙记 token。[官方：会议结束](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/meeting_ended?lang=zh-CN) [官方：录制完成](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/recording_ready?lang=zh-CN)

不要在 `meeting_ended` 后立即拉正文。`GET /vc/v1/meetings/:meeting_id/recording` 在录制仍生成时会返回 `124002 record processing`；小于 5 秒的录制可能不生成文件。[官方：获取录制文件](https://open.feishu.cn/document/server-docs/vc-v1/meeting-recording/get?lang=zh-CN)

### 2. 智能纪要生成事件

`vc.note.generated_v1` 在与已订阅用户相关的纪要生成后推送，覆盖该用户参加的会议，以及录音/上传音视频产生的纪要。接入步骤是：

1. 为应用开通用户身份权限 `vc:note:read`。
2. 用目标 HR/owner 的 `user_access_token` 调用 `POST /vc/v1/notes/subscription`，订阅 `vc.note.generated_v1`。
3. 在应用后台配置同名事件，并由选定的 Webhook 或长连接接收端消费。
4. 收到 `note_id` 后，以有权查看该纪要的用户 token 调用 `GET /vc/v1/notes/:note_id`。

纪要详情返回纪要文档和逐字稿文档的 `doc_token`，并在会议来源下返回对应 `meeting_id`。它不直接返回正文。[官方：纪要生成](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/events/generated) [官方：获取纪要详情](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/get)

### 3. 获取完整正文/转写

若希望得到比 `recording_ready` 更贴近“妙记已经生成”的信号，还可以订阅 `minutes.minute.generated_v1`。Lark 官方 CLI 的事件目录明确把它标为**用户身份**事件，所需 scope 为 `minutes:minutes.basic:read`；事件包含 `minute_token`，会议来源时还带 `minute_source.source_entity_id=meeting_id`。官方 CLI 会在消费开始/结束时自动调用 OAPI 完成该用户的订阅/退订，说明它同样不是一个只靠应用后台勾选即可覆盖全租户的 Bot 事件。[Lark 官方 CLI：Minutes Events](https://github.com/larksuite/cli/blob/main/skills/lark-event/references/lark-event-minutes.md)

`minutes.minute.generated_v1` 适合直接衔接妙记转写导出，`vc.note.generated_v1` 适合取得智能纪要/逐字稿 Docx；两者是不同资源和权限，不应只订阅其中一个却假设能拿到另一种产物。

有三条能力，语义不同：

| 目标                        | 官方接口                                                                   | 返回内容与限制                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 完整逐字转写                | `GET /minutes/v1/minutes/:minute_token/transcript`                         | 返回 `txt` 或 `srt` 二进制流，可选择带说话人和时间戳；5 次/秒；未转写完成返回 `2091003 minute not ready`，无导出权限返回 403 |
| 妙记基础元数据              | `GET /minutes/v1/minutes/:minute_token`                                    | owner、创建时间、标题、时长、URL、`note_id`；未 ready 同样返回 `2091003`                                                     |
| 飞书智能纪要/逐字稿文档文本 | 先取 `doc_token`，再调用 `GET /docx/v1/documents/:document_id/raw_content` | 返回纯文本；需要 `docx:document:readonly` 且调用身份真实拥有文档阅读权；单应用 5 次/秒，超长文档可能返回 `1770033`           |

来源：[官方：导出妙记文字记录](https://open.feishu.cn/document/minutes-v1/minute-transcript/get) [官方：获取单个妙记信息](https://open.feishu.cn/document/server-docs/minutes-v1/minute/get?lang=zh-CN) [官方：获取文档纯文本内容](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)

另一个可用的关联入口是 `GET /vc/v1/meetings/:meeting_id?query_mode=1`。申请字段权限后，其 `related_artifacts` 会返回 `note_doc_token` 和 `verbatim_doc_token`；文档生成前字段值为空字符串。该接口只支持查询最近 90 天内、归属于当前身份的会议。[官方：获取会议详情](https://open.feishu.cn/document/server-docs/vc-v1/meeting/get?lang=zh-CN)

因此没有官方承诺的“会议结束后立刻得到完整纪要”同步接口。应把会后处理建模为 `meeting_ended -> recording_ready -> transcript/note_ready -> fetched`，对 `not ready` 做有上限的延迟重试，并保留人工重试入口。

### 4. Webhook 的幂等和响应要求

飞书事件是“至少发送一次”，即使已成功接收仍可能重复。服务需要在 3 秒内返回 HTTP 200，把耗时拉取交给后台任务，并以 v2 事件的 `header.event_id` 去重。失败时飞书会在 15 秒、5 分钟、1 小时、6 小时后重推，最多 4 次。[官方：事件订阅概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview)

## 主持人、内部/外部参会人与录制限制

- 直接预约的 `owner_id` 和指定主持人必须是同租户合法飞书用户，指定主持人最多 10 人。外部候选人不应被设为 owner/主持人。
- 日程方案中，`join_meeting_permission=anyone_can_join` 才适合将链接给外部候选人；`only_organization_employees` 会拒绝外部用户，`only_event_attendees` 则依赖参与人名单。访客可通过网页链接入会，但可能要登录飞书账号或完成访客验证。[官方：创建日程](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN) [官方：通过网页加入飞书会议](https://www.feishu.cn/hc/zh-CN/articles/360049067679-%E9%80%9A%E8%BF%87%E7%BD%91%E9%A1%B5%E5%8A%A0%E5%85%A5%E9%A3%9E%E4%B9%A6%E8%A7%86%E9%A2%91%E4%BC%9A%E8%AE%AE)
- 等候室等能力受企业版本和管理员策略影响；飞书帮助中心注明会议等候室仅企业版和旗舰版可用。即使 OpenAPI 有字段，也要以目标租户实际权益和后台策略为准。[官方：飞书会议设置说明](https://www.feishu.cn/hc/zh-CN/articles/618086991849-%E5%9C%A8-outlook-%E4%B8%AD%E5%AE%89%E8%A3%85-%E4%BD%BF%E7%94%A8%E9%A3%9E%E4%B9%A6%E4%BC%9A%E8%AE%AE%E6%8F%92%E4%BB%B6)
- `auto_record=true` 只是请求开启自动录制；企业管理员可以限制录制权限。所有参会人会看到录制提醒，外部候选人场景还应在业务侧提前告知录制、转写和使用目的。[官方：生成妙记](https://www.feishu.cn/hc/zh-CN/articles/386045971891-%E7%94%9F%E6%88%90%E5%A6%99%E8%AE%B0) [官方：管理员进行视频会议设置](https://www.feishu.cn/hc/zh-CN/articles/360049067828-%E7%AE%A1%E7%90%86%E5%91%98%E8%BF%9B%E8%A1%8C%E8%A7%86%E9%A2%91%E4%BC%9A%E8%AE%AE%E8%AE%BE%E7%BD%AE)
- 录制生成的妙记最长支持 16 小时；少于 5 秒可能没有录制文件。基础版的语音转写有体验额度，商业版/企业版的妙记语音转写不受时长额度限制但仍受企业存储空间影响。智能纪要属于另一套 AI 权益/额度，并非有录制就必然有 AI 总结。[官方：生成妙记](https://www.feishu.cn/hc/zh-CN/articles/386045971891-%E7%94%9F%E6%88%90%E5%A6%99%E8%AE%B0) [官方：智能纪要用量额度说明](https://www.feishu.cn/hc/zh-CN/articles/808156011479-%E6%99%BA%E8%83%BD%E7%BA%AA%E8%A6%81%E7%94%A8%E9%87%8F%E9%A2%9D%E5%BA%A6%E8%AF%B4%E6%98%8E)

## 工程上容易踩的坑

1. **远端创建没有幂等键**：预约接口请求中没有 `idempotency_key`。若飞书已创建成功但本服务在保存响应前超时，盲目重试可能创建第二个会议。数据库需有 `creating/ready/failed` 状态、唯一业务键和运维恢复路径；不能只在一个事务中假装远端调用与本地写入原子化。
2. **ID 不能混用**：`reserve_id`、`meeting_id`、9 位 `meeting_no`、Calendar `event_id`、`note_id`、`minute_token`、Docx `doc_token` 都是不同资源，应分别持久化。`meeting_id` 在真正开会后才产生。
3. **两套飞书应用的 `open_id` 不通用**：会议记录必须固定 provider/app；同一个 HR 在另一个应用下的 `open_id` 不能传给当前应用。
4. **时间单位不一致**：预约和日程的业务时间为 Unix 秒；会议/纪要事件头的 `create_time` 是毫秒；妙记元数据的创建时间也是毫秒，而纪要详情产物时间是秒。不要靠字段名猜单位。
5. **结束事件不是正文就绪事件**：必须区分 `meeting_ended`、`recording_ready`、`note.generated`，并处理 `124002` / `2091003`。
6. **应用 scope 不等于资源权限**：尤其是 Docx 正文。拿到文档 token 后，`tenant_access_token` 仍可能因应用未被授予该文档阅读权而 403；以实际能看到纪要的 owner 用户 token 读取通常更符合权限模型。
7. **事件会重复且可能延迟**：必须按 `event_id` 幂等；回调只验签、入队、返回 200，不在 3 秒窗口内同步下载转写。
8. **直接预约不会出现在日历**：若产品文案叫“飞书会议”但内部员工期望日历提醒，会形成明显体验落差。

## 推荐的首版落地边界

### 若目标只是替换当前 LiveKit 链接

推荐应用身份直接预约：

```text
创建本地真人面试记录（creating）
  -> tenant_access_token 调用 reserves/apply
     owner_id = 当前内部 HR（同一应用下的飞书 ID）
     assign_host_list = 内部面试官
     auto_record = true
  -> 保存 reserve_id / meeting_no / password / url / provider
  -> 向候选人展示飞书 url
  -> meeting_ended 仅更新会议状态
  -> recording_ready 保存 meeting_id / minute_token
  -> 异步导出 txt/srt；另行等待智能纪要 token
```

这条方案不要求现有用户重新 OAuth，但应用要申请 VC、录制、会议事件、妙记导出权限并配置妙记数据范围。

### 若目标是完整复刻公司飞书日程习惯

推荐以发起 HR 的用户身份创建日程 + VC，并添加内部面试官为日程参与人；候选人仍可只拿公开入会链接，不一定加入内部日历。该方案可自然处理日历提醒、忙闲和主持人，但必须先补齐 user token 刷新、增量授权、授权撤销处理和 per-user 纪要订阅。

不建议首版使用“应用日历 + Bot 作为组织者”来伪装员工日程：官方主持人限制会让它与员工手动创建会议的行为不同。

## 上线前必须实测/确认

1. 用生产目标自建应用在 API 调试台确认 `tenant_access_token + owner_id` 可成功调用 `reserves/apply`，消除 VC 概述页和具体接口页的 token 支持差异。
2. 目标租户是否给 owner/面试官开放录制、妙记转写和智能纪要额度；管理员是否限制外部参会、等候室或自动录制。
3. `minutes:minutes.transcript:export` 的应用数据范围是否已包含所有可能的 meeting owner，并且这些妙记允许导出。
4. 候选人用“无本租户账号、网页访客”从实际会议链接入会；确认默认入会范围、访客验证、等候室和主持人放行行为。
5. 录制完成后，目标应用能否以应用身份读出妙记转写；若不能，是否接受改为 owner 用户身份读取。
6. 当前 Better Auth `genericOAuth` 锁定版本能否自动刷新并原子轮换飞书 refresh token；若不能，用户身份日程/纪要方案在约两小时后会失效。
7. 通过 Calendar API 创建的 VC 是否会收到当前所需的 `vc.meeting.*` 事件。官方事件页只写“通过 Open API 预约”，没有在事件契约中进一步区分 VC 预约 API 与 Calendar API，需真实租户验证。

## 官方资料索引

- [视频会议概述](https://open.feishu.cn/document/server-docs/vc-v1/video-conferencing-overview?lang=zh-CN)
- [预约会议](https://open.feishu.cn/document/server-docs/vc-v1/reserve/apply?lang=zh-CN)
- [创建日程](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN)
- [获取会议详情](https://open.feishu.cn/document/server-docs/vc-v1/meeting/get?lang=zh-CN)
- [会议结束事件](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/meeting_ended?lang=zh-CN)
- [录制完成事件](https://open.feishu.cn/document/server-docs/vc-v1/meeting/events/recording_ready?lang=zh-CN)
- [获取录制文件](https://open.feishu.cn/document/server-docs/vc-v1/meeting-recording/get?lang=zh-CN)
- [纪要生成事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/events/generated)
- [订阅纪要变更事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/subscription)
- [获取纪要详情](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/vc-v1/note/get)
- [获取单个妙记信息](https://open.feishu.cn/document/server-docs/minutes-v1/minute/get?lang=zh-CN)
- [导出妙记文字记录](https://open.feishu.cn/document/minutes-v1/minute-transcript/get)
- [Lark 官方 CLI：妙记生成事件](https://github.com/larksuite/cli/blob/main/skills/lark-event/references/lark-event-minutes.md)
- [获取文档纯文本内容](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content)
- [事件订阅概述](https://open.feishu.cn/document/server-docs/event-subscription-guide/overview)
- [申请 API 权限](https://open.feishu.cn/document/server-docs/application-scope/introduction?lang=zh-CN)
- [配置应用数据权限](https://open.feishu.cn/document/home/introduction-to-scope-and-authorization/configure-app-data-permissions)
- [生成妙记](https://www.feishu.cn/hc/zh-CN/articles/386045971891-%E7%94%9F%E6%88%90%E5%A6%99%E8%AE%B0)
- [智能纪要用量额度说明](https://www.feishu.cn/hc/zh-CN/articles/808156011479-%E6%99%BA%E8%83%BD%E7%BA%AA%E8%A6%81%E7%94%A8%E9%87%8F%E9%A2%9D%E5%BA%A6%E8%AF%B4%E6%98%8E)
