# 真人面试同步创建飞书会议与日程实施计划

> 状态：已实现，待使用真实飞书应用做产品联调。
>
> 2026-08-05 实施结果：数据库迁移、登录来源快照、应用选择、VC 与 Bot 主日历创建、参与人通知、检查点重试、复制链接界面和自动化测试均已完成。本阶段仍按计划不处理会后改期/取消同步、录制、妙记和 AI 智能纪要。
>
> 本阶段保留现有 LiveKit 真人面试房间，同时创建一场飞书会议和一条飞书日程。候选人不加入飞书日程参与人，只向其提供可复制的飞书会议链接。

## Goal

创建真人面试时，在现有本地面试记录和 LiveKit 房间之外，同步完成以下动作：

1. 根据当前登录会话的来源选择对应的飞书应用。
2. 以操作人为会议 owner，以所选真人面试官为主持人，创建一场飞书会议。
3. 在所选应用的 Bot 主日历创建一条日程，并复用已创建的飞书会议链接。
4. 将操作人和所有真人面试官加入日程参与人。
5. 创建完成后，在复制链接界面优先提供飞书会议链接，同时保留现有 LiveKit 候选人和面试官链接。
6. 持久化飞书资源 ID、链接和同步状态；部分失败后可以安全重试，不重复创建已经成功的资源。

最终流程：

```text
用户创建真人面试
  ├─ 创建本地真人面试记录和 LiveKit 房间
  ├─ 确定本次会话对应的飞书应用
  ├─ 解析操作人和真人面试官在该应用下的 open_id
  ├─ 创建飞书会议
  ├─ 在 Bot 主日历创建日程，挂载同一个会议链接
  ├─ 添加操作人和真人面试官为日程参与人
  └─ 返回本地链接、飞书会议链接和飞书同步状态
```

## Source of truth

- [领域上下文](../../CONTEXT.md)
- [飞书真人面试会议接入调研](../research/feishu-human-interview-meeting-integration-2026-08-05.md)
- [飞书 Bot 与 HR 创建会议、收费情况对比](../research/feishu-meeting-bot-vs-hr-and-pricing-2026-08-05.md)
- [飞书预约会议 API](https://open.feishu.cn/document/server-docs/vc-v1/reserve/apply?lang=zh-CN)
- [飞书创建日程 API](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event/create?lang=zh-CN)
- [飞书添加日程参与人 API](https://open.feishu.cn/document/server-docs/calendar-v4/calendar-event-attendee/create?lang=zh-CN)
- [飞书获取主日历 API](https://open.feishu.cn/document/server-docs/calendar-v4/calendar/primary?lang=zh-CN)
- [飞书批量获取用户 ID API](https://open.feishu.cn/document/server-docs/contact-v3/user/batch_get_id?lang=zh-CN)

## Confirmed product decisions

以下决策已经确认，实施时不得自行改变：

1. **LiveKit 与飞书同时创建。** 本阶段不替换现有 LiveKit 真人面试流程。
2. **按登录来源选择飞书应用。**
   - `feishu`：使用第一个应用 `cli_a955211781785bd8`。
   - `feishu-jiguang-hr`：使用第二个应用 `cli_a97aa896aab85bc2`。
   - Google 登录：默认使用第二个应用 `cli_a97aa896aab85bc2`。
   - 密码登录、无法识别来源或历史会话没有来源快照：默认使用第二个应用。
3. **应用身份创建。** 使用所选应用的 `tenant_access_token` 创建会议和日程，不要求用户重新进行飞书 OAuth 授权。
4. **操作人和真人面试官都进入会议与日程。**
   - 操作人作为飞书会议 `owner_id`。
   - 真人面试官加入 `assign_host_list`，作为会议主持人。
   - 操作人和真人面试官均加入飞书日程参与人。
   - 同一个人同时是操作人和面试官时必须去重。
5. **候选人不加入日程参与人。** 创建成功后提供飞书会议直达链接，由招聘人员复制给候选人。
6. **使用 Bot 主日历。** 日程组织者显示为 Bot；本阶段不使用 HR 的 `user_access_token` 在个人主日历创建。
7. **只创建一场飞书会议。** 先调用 VC 预约接口创建会议，再创建日程，并以 `third_party` 会议方式挂载已有飞书会议链接，不能让 Calendar 再生成第二场 VC。
8. **默认面试时长为 1 小时。** 开始时间使用真人面试轮次的排期时间；结束时间为开始时间加 1 小时；时区使用 `Asia/Shanghai`。
9. **本阶段不自动录制。** `auto_record=false`，也不在本阶段接入妙记或 AI 智能纪要。
10. **日程启用正常通知。** 添加内部参与人时由飞书发送日程邀请和提醒。
11. **身份解析采用严格策略。** 操作人或任一真人面试官无法解析为所选应用下的飞书用户时，不创建飞书资源，并明确返回无法解析的人员姓名。
12. **保留同步状态并支持安全重试。** 已成功创建的会议或日程必须复用，不能因后续步骤失败而重复创建。
13. **本阶段不自动同步后续变更。** 创建后若在系统内改期、取消或结束真人面试，不自动更新或删除飞书会议和日程；界面需要明确提醒用户在飞书中同步处理。

## Scope

### Included

- 登录来源快照与飞书应用选择。
- 本地成员到指定飞书应用 `open_id` 的解析。
- 创建飞书 VC 预约。
- 查询 Bot 主日历、创建日程、添加参与人。
- 飞书资源与同步状态持久化。
- 安全重试接口。
- 创建结果 DTO 和复制链接界面扩展。
- 后端接口、飞书 HTTP 契约和前端展示测试。

### Not included

- 用 HR 的 `user_access_token` 创建个人日程。
- 候选人飞书身份解析或候选人日程邀请。
- 自动录制、妙记、AI 智能纪要和会后文档。
- 创建后的飞书改期、取消、删除和会议结束同步。
- 用飞书完全替换 LiveKit。
- 向候选人自动发送邮件或飞书消息。

## Domain model and invariants

### Login provider snapshot

飞书 `open_id` 是应用内身份，同一员工在两个飞书应用下的 `open_id` 不同。因此一次真人面试必须固定使用一个 provider，后续重试也必须复用该 provider，不能根据用户下一次登录方式重新选择。VC 预约创建前保存操作人和面试官的 Open ID 快照；预约检查点存在后，Calendar 和参与人重试必须复用这些快照，不再读取当前账号绑定或通过邮箱重新解析。

新增会话字段：

```text
session.authProviderId nullable text
```

新会话创建时记录本次认证 provider。现有会话字段为空时：

1. 如果用户只绑定了一个飞书 provider，可采用该 provider。
2. 其他情况使用第二个应用 `feishu-jiguang-hr`。

一旦创建真人面试记录，必须把最终选择写入会议记录的 `feishuProviderId`。

### Feishu sync state

建议状态：

```text
pending   本地记录已创建，尚未开始飞书同步
creating  正在调用飞书 API
ready     会议、日程和参与人均创建成功
failed    收到确定失败响应，可以修复后重试
unknown   VC 创建请求结果不确定，禁止盲目重试
```

关键不变量：

- 每条真人面试记录最多绑定一个飞书 provider、一个 VC 预约和一个日程。
- 重试只补齐缺失步骤，不重新创建已有资源。
- 会议 URL 一旦持久化，创建日程时始终复用该 URL。
- Calendar 创建接口必须使用稳定的 `idempotency_key`，长度满足官方 32 至 128 字符要求。
- VC 预约接口没有幂等键。请求超时且无法判断服务端是否成功时，状态置为 `unknown`，不得自动再次预约。
- `ready` 仅表示会议、日程和所有内部参与人均已同步完成。
- 飞书 provider、token 和所有 `open_id` 必须来自同一个应用。
- 所选真人面试官必须属于当前工作区；不能仅按前端提交的用户 ID 查询。
- VC 主持人列表最多 10 人；当前产品真人面试官选择上限继续保持 10 人。

### Suggested persistence fields

在 `studio_human_interview_meeting` 增加：

```text
feishuProviderId          nullable text
feishuSyncStatus          pending | creating | ready | failed | unknown
feishuOwnerOpenId         nullable text
feishuReserveId           nullable text
feishuMeetingNo           nullable text
feishuMeetingUrl          nullable text
feishuAppLink             nullable text
feishuCalendarId          nullable text
feishuCalendarEventId     nullable text
feishuCalendarEventUrl    nullable text
feishuLastError           nullable text
feishuSyncedAt            nullable timestamp
```

真人面试官关联记录可增加 `feishuOpenId` 快照，保证排障时能还原本次同步实际使用的身份。若现有关系表不适合承载快照，则将去重后的参与人快照存入会议记录附近的专用结构；实施时优先选择符合当前 schema 风格的最小改动。

## API contract

### Create human interview meeting

保留现有：

```text
POST /human-interview-meetings
```

请求体不增加由前端选择 provider 的字段；provider 必须由后端根据当前会话确定，避免客户端伪造或跨应用混用。

成功响应在现有本地会议数据和链接基础上增加：

```ts
type FeishuMeetingSync = {
  appLink: string | null;
  calendarEventUrl: string | null;
  meetingUrl: string | null;
  providerId: "feishu" | "feishu-jiguang-hr";
  status: "pending" | "creating" | "ready" | "failed" | "unknown";
};
```

创建语义：

- 本地记录和 LiveKit 创建成功，但飞书出现确定失败时，返回可识别的业务错误，同时保留本地记录及 `failed` 状态供重试。
- 飞书 VC 结果不确定时，返回明确的 `unknown` 状态和人工核查提示。
- 所有飞书步骤成功时返回 `ready` 和可复制的 `meetingUrl`。

### Retry Feishu sync

新增：

```text
POST /human-interview-meetings/:meetingId/feishu-sync
```

约束：

- 校验会议属于当前工作区。
- 固定使用记录上的 `feishuProviderId`。
- `ready` 时直接返回现有结果，不重复调用飞书。
- 已有 `feishuReserveId` / `feishuMeetingUrl` 时跳过 VC 创建。
- 已有 `feishuCalendarEventId` 时跳过日程创建。
- 仅补齐缺失参与人。
- `unknown` 状态默认拒绝自动重试 VC，要求先人工核查；不得把不确定请求当成确定失败。

## Feishu HTTP contract

### 1. Resolve people

输入为操作人和真人面试官的本地用户记录，输出为指定 provider 下的 `open_id`。

解析顺序：

1. 查询 Better Auth `account` 表中同一用户、同一 provider 的账号，使用 `account.accountId` 作为 `open_id`。
2. 如果没有对应账号，使用员工邮箱调用 `POST /contact/v3/users/batch_get_id?user_id_type=open_id`。
3. 对结果按本地用户 ID 去重，同时保留姓名用于错误提示。
4. 任一人员仍无法解析时整体失败，不创建 VC 或 Calendar 资源。

### 2. Create VC reserve

调用：

```text
POST /open-apis/vc/v1/reserves/apply
Authorization: Bearer <tenant_access_token>
```

关键请求字段：

```json
{
  "end_time": "<面试开始时间 + 1 小时的 Unix 秒>",
  "meeting_settings": {
    "assign_host_list": [
      {
        "id": "<真人面试官 open_id>",
        "user_type": 1
      }
    ],
    "auto_record": false,
    "topic": "<候选人姓名> - <轮次名称>"
  },
  "owner_id": "<操作人 open_id>"
}
```

请求使用 `user_id_type=open_id`。成功后立即持久化：

- `id`（本地存入 `feishuReserveId`）
- `meeting_no`
- `url`
- `app_link`
- owner `open_id`

如果 API 明确返回 `invalid_host_id_list`，视为确定失败并展示对应面试官；不能忽略无效主持人后继续创建日程。

### 3. Get Bot primary calendar

调用飞书获取主日历接口，使用同一应用的 `tenant_access_token`，取得 Bot 主日历 `calendar_id`。可以在一次同步中缓存结果，但必须把实际使用的 `calendar_id` 写入面试记录。

### 4. Create calendar event

调用：

```text
POST /open-apis/calendar/v4/calendars/:calendar_id/events
```

关键规则：

- `start_time` 使用排期时间。
- `end_time` 为开始时间加 1 小时。
- 时区固定 `Asia/Shanghai`。
- `free_busy_status=busy`。
- 标题包含候选人和轮次，描述可包含系统真人面试信息。
- 使用稳定 `idempotency_key`，由本地会议 ID 派生，重试时保持不变。
- `vchat.vc_type=third_party`，链接填写已经创建的 `feishuMeetingUrl`。
- 不设置 `vchat.vc_type=vc`，避免 Calendar 再创建第二场会议。

成功后立即持久化 `calendar_id`、`event_id` 和日程 URL。

### 5. Add attendees

调用添加日程参与人接口，将去重后的以下人员以 `open_id` 添加：

- 操作人
- 所有真人面试官

候选人不添加。请求开启正常通知。参与人添加需要支持分批和断点补齐；如果飞书返回部分失败，记录已成功人员，重试时仅处理缺失人员。

## Architecture and file ownership

遵循后端 route-owned module 约束，飞书真人面试同步逻辑放在 interviews 路由内部，不创建顶层 `server/services/`。

建议文件范围：

### Database and shared contracts

- Modify: `packages/db-schema/src/schema.ts`
- Create: Drizzle 生成的迁移文件
- Modify: `packages/shared/src/studio-pipeline-stages.ts`

### Authentication

- Modify: `apps/ai-recruitment-copilot-backend/src/lib/server/auth.ts`
- Reuse: `apps/ai-recruitment-copilot-backend/src/server/routes/feishu/utils/provider.ts`
- Reuse: `apps/ai-recruitment-copilot-backend/src/lib/server/feishu-access-token.ts`

### Human interview backend

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/collection-route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/dao/human-interview-meetings.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/utils/feishu-human-interview-meeting.ts`
- Add tests beside the interviews route using the repository's existing test layout

### Frontend

- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/human-interview-stage-dialogs.tsx`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/human-interview-stage-meetings.tsx`
- Add focused component tests beside the affected feature

## Implementation plan

测试切入点已经确认：

1. 公共 `POST /human-interview-meetings` 行为。
2. 飞书 HTTP service contract。

实施采用小步 TDD，每个任务先写失败测试、确认失败原因正确，再写最小实现使其通过。

### Task 1: Persist login provider on the session

**Changes**

- 在数据库 session 表增加 `authProviderId`。
- 在 Better Auth `session.additionalFields` 暴露该字段。
- 在创建会话时写入实际登录 provider。
- 给历史会话实现受控回退：唯一飞书绑定优先，否则默认 `feishu-jiguang-hr`。

**Tests first**

- 飞书一登录写入 `feishu`。
- 飞书二登录写入 `feishu-jiguang-hr`。
- Google 登录映射到第二个飞书应用。
- 密码或未知来源映射到第二个飞书应用。
- 历史空字段按既定回退规则解析。

**Verify**

- Better Auth 创建的新 session 包含稳定的 provider 快照。
- provider 选择只发生一次，真人面试记录保存后不再随新会话变化。

### Task 2: Add Feishu persistence fields and migration

**Changes**

- 增加飞书 provider、同步状态、VC、Calendar、错误和同步时间字段。
- 如采用参与人 `open_id` 快照，在现有真人面试官关联边界增加最小必要字段。
- 生成 Drizzle migration，不手写迁移结果。
- 扩展共享 DTO，日期字段跨线时转换为 ISO string。

**Tests first**

- 新记录默认状态为 `pending`。
- provider 和各检查点可独立写入和读取。
- `ready` 响应包含飞书会议链接。
- 旧数据迁移后字段为空且不影响现有 LiveKit 行为。

**Verify**

- 检查生成 SQL 的默认值、可空性、索引和约束。
- 运行 `pnpm db:generate` 后确认无手工 schema 漂移。

### Task 3: Resolve provider and Feishu identities

**Changes**

- 实现会话 provider 到飞书应用配置的映射。
- 查询并校验所有所选面试官属于当前工作区。
- 合并操作人和面试官并去重。
- 优先复用同 provider 的 OAuth `account.accountId`。
- 按邮箱批量补查 `open_id`。
- 返回结构化的未解析人员错误。

**Tests first**

- 两个飞书 provider 分别选择正确 app ID。
- Google、密码和未知来源选择第二个 app。
- 同一人员重复出现时只保留一次。
- 跨工作区用户 ID 被拒绝。
- OAuth 账号优先于邮箱补查。
- 邮箱补查成功可继续。
- 任一人员无法解析时不调用创建会议接口，错误包含姓名。

**Verify**

- token、owner、hosts 和 attendees 始终来自同一 provider。
- 不把本地 user ID 当作飞书 `open_id`。

### Task 4: Implement Feishu HTTP service contract

**Changes**

- 在 interviews route-owned utils 中实现可注入 `fetch` 的飞书客户端边界。
- 实现 tenant token 获取、用户 ID 批量解析、VC 预约、主日历查询、日程创建和参与人添加。
- 对飞书非零 `code`、HTTP 非 2xx、缺失关键字段和部分失败返回结构化错误。
- 日志和持久化错误不得包含 tenant token。

**Tests first**

- 精确断言 VC URL、query、authorization 和请求体。
- 精确断言 `owner_id`、主持人列表、`auto_record=false` 和结束时间。
- 精确断言 Calendar 使用 `third_party` 复用已有会议 URL。
- 精确断言稳定且合法的 `idempotency_key`。
- 精确断言操作人和面试官参与人去重结果。
- 覆盖飞书业务错误、HTTP 错误、超时、缺字段和部分参与人失败。

**Verify**

- 所有外部调用都可在测试中以 mock HTTP 验证，不依赖真实飞书环境。
- API 契约与官方当前文档一致。

### Task 5: Orchestrate create flow with checkpoints

**Changes**

- 保留现有本地记录和 LiveKit 创建流程。
- 在本地记录生成后固定 `feishuProviderId`。
- 在身份解析和 VC 创建前，通过数据库条件更新从 `pending` / `failed` 原子抢占为 `creating`；同一会议只有一个请求能获得执行权。
- `creating` 使用 10 分钟租约：已有 `reserve.id` 的过期任务从日历检查点继续；没有预约检查点的过期任务转为 `unknown`，避免重复创建非幂等的 VC 预约。
- VC 成功后立即保存 VC 字段，再创建 Calendar。
- Calendar 成功后立即保存 event 字段，再添加参与人。
- 全部成功后写入 `ready` 和 `feishuSyncedAt`。
- 飞书 ready 后更新关联 round 的 `meetingUrl` 为飞书会议 URL，供现有业务投影复用；LiveKit 链接仍保留在链接 bundle 中。

**Failure matrix**

| 失败点                                        | 持久化状态 | 重试行为                                |
| --------------------------------------------- | ---------- | --------------------------------------- |
| 身份解析失败                                  | `failed`   | 重新解析，不存在远端资源                |
| VC 明确失败                                   | `failed`   | 可重新创建 VC                           |
| VC 请求结果不确定                             | `unknown`  | 禁止盲目重试，先人工核查                |
| VC 已创建、首次检查点失败，但故障处理补写成功 | `failed`   | 复用已补写的 VC 检查点，只重试 Calendar |
| VC 成功、Calendar 失败                        | `failed`   | 复用 VC，只重试 Calendar                |
| Calendar 成功、参与人失败                     | `failed`   | 复用 VC 和 event，只补参与人            |
| 全部成功                                      | `ready`    | 直接返回已有资源                        |

**Tests first**

- 完整成功路径创建且只创建一个 VC 和一个 event。
- VC 成功、Calendar 失败时 VC 检查点已保存。
- 重试 Calendar 时不重复调用 VC。
- event 成功、参与人失败时 event 检查点已保存。
- 重试参与人时不重复创建 event。
- `ready` 重试不调用任何写 API。
- VC 超时且结果不确定时进入 `unknown`。
- 飞书失败不删除已经创建的本地记录和 LiveKit 房间。

**Verify**

- 数据库状态足以在进程重启后继续同步。
- 任一重试都不会因缺少内存状态而重复创建远端资源。

### Task 6: Add retry endpoint

**Changes**

- 增加 `POST /human-interview-meetings/:meetingId/feishu-sync`。
- 使用现有工作区认证和权限边界。
- 返回与创建接口一致的飞书同步 DTO。
- 对 `unknown` 返回明确的不可自动重试响应。

**Tests first**

- 非当前工作区会议返回 404 或当前项目约定的不可见响应。
- 无权限用户被拒绝。
- `failed` 可继续缺失步骤。
- `ready` 幂等返回。
- `unknown` 不触发新的 VC 创建。

**Verify**

- Hono 路由声明显式状态码。
- JSON 输入使用项目约定的 Zod validator；无请求体时保持类型边界明确。

### Task 7: Expose and copy the Feishu link

**Changes**

- 扩展 `HumanInterviewMeetingRecord` 和 link bundle。
- 创建成功后的链接区域将“飞书会议链接”放在最上方。
- 提供独立复制按钮，复制浏览器可打开的 `meetingUrl`，不默认复制 `appLink`。
- 保留现有候选人 LiveKit 链接和面试官 LiveKit 链接。
- 非 `ready` 状态显示明确错误和重试入口。
- 显示阶段性提醒：飞书日程创建后，系统内改期或取消不会自动同步到飞书。

**Tests first**

- `ready` 时显示并可复制飞书会议 URL。
- 飞书链接位于现有 LiveKit 链接之前。
- 飞书失败时现有 LiveKit 链接仍可见。
- `failed` 显示重试操作。
- `pending` 显示“继续飞书同步”，`creating` 显示“检查并恢复同步”。
- `unknown` 显示人工核查提示，不显示普通重试。
- 未创建飞书的历史记录仍能正常打开链接界面。

**Verify**

- 不改变现有创建轮次和 LiveKit 邀请链接行为。
- 前端使用 typed Hono RPC client 和 `rpcFetch`，不新增手写 JSON fetch 包装。

### Task 8: Permissions, migration and live smoke test

两个应用都需要开通并发布相同的最小权限：

| 用途                         | 权限                                         |
| ---------------------------- | -------------------------------------------- |
| 创建 VC 预约                 | `vc:reserve`                                 |
| 读取 VC 预约，用于核查和恢复 | `vc:reserve:readonly`                        |
| 创建日程                     | `calendar:calendar.event:create`             |
| 查询主日历                   | 以飞书控制台对应接口展示的日历读取权限为准   |
| 添加日程参与人               | 以飞书控制台对应接口展示的日历参与人权限为准 |
| 按邮箱查询 open_id           | `contact:user.id:readonly`                   |

此外：

- 两个应用均需启用机器人能力，才能使用 Bot 日历语义。
- 新增权限后需发布应用版本并由租户管理员审批。
- `open_id` 必须由各自应用独立解析，不可复制另一应用的数据。

**Live smoke test**

自动化测试全部通过后，再使用测试数据执行一次真实创建：

1. 分别验证两个应用能获取 tenant token。
2. 以真实操作人和“光芒”面试官解析同应用 `open_id`。
3. 创建一场短期测试 VC。
4. 在 Bot 主日历创建日程并挂载该 VC URL。
5. 验证操作人和面试官均收到/可见日程。
6. 验证候选人无需登录即可通过复制的会议 URL 进入预加入页面。
7. 记录并清理测试日程和预约；清理属于真实外部写操作，执行前再次确认目标资源。

## Verification commands

按任务逐步运行定向测试，最终执行：

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm check
pnpm db:generate
git diff --check
```

若实现没有触及 TanStack Router、Start 或 Query API，不需要额外加载 TanStack Intent；如果实现过程中改变相关 API 用法，必须在编辑前运行 AGENTS.md 中匹配的 Intent guidance command。

## Acceptance criteria

- 通过飞书一登录创建真人面试时，记录固定使用应用 `cli_a955211781785bd8`。
- 通过飞书二、Google、密码或未知来源创建时，记录固定使用应用 `cli_a97aa896aab85bc2`。
- 所有面试官都经过当前工作区成员校验，并解析为所选应用下的 `open_id`。
- 操作人是会议 owner；所有真人面试官是主持人；二者均为日程参与人且不重复。
- 候选人不是日程参与人，但 UI 可复制可访问的飞书会议 URL。
- 一次创建只产生一场飞书会议，Calendar 复用该会议链接。
- 飞书同步成功时状态为 `ready`，并保存 VC、Calendar 关键 ID 和链接。
- 任一步骤失败后，本地面试记录和 LiveKit 链接仍可使用。
- VC、Calendar 或参与人部分成功后重试不会重复创建已存在的远端资源。
- VC 结果不确定时不会自动重复预约。
- 历史真人面试记录和现有 LiveKit 创建、复制链接流程无回归。
- 自动化测试、类型检查、lint/format 和迁移生成检查全部通过。

## Follow-up phases

本计划完成后再单独评估：

1. 系统内改期、取消、结束与飞书会议/日程的双向同步。
2. 改为使用 HR `user_access_token` 在个人主日历创建，由真人 HR 成为日程组织者。
3. 自动录制、妙记、AI 智能纪要订阅和会后内容归档。
4. 停止创建 LiveKit 房间，或仅在飞书创建失败时降级到 LiveKit。
