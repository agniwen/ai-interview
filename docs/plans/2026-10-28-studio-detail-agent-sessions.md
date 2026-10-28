# Studio 详情页 Agent 会话方案

状态：岗位创建/编辑、沟通题创建/编辑、表单题编辑已接入（面板名称 Hireseer Agent）；表单题创建仍为弹窗，未接入
日期：2026-10-28
已确认：会话为 **团队共享**（2026-10-28），决策记录见 [ADR 0045](../adr/0045-use-shared-subject-threads-for-studio-detail-agents.md)

## 背景

Studio 已有右侧 sidepane（见 [侧面板规范](../studio-side-pane.md)）。计划在部分详情页/编辑页的 sidepane 中接入对话式 agent，让招聘人员通过聊天读取页面内容、让 agent 协助填写配置，交互参考 Metaview Screening 的 Agent 面板。

本文只解决 **会话（session）如何管理**，以及与之直接相关的权限、并发、agent 写入方式和前端挂载方式。

## 参考：Metaview Screening 的做法

2026-10-28 通过界面与前端代码确认：

| 方面       | Metaview 做法                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| 会话粒度   | 一个 screen（assessment）= 一个会话，会话 ID 直接用 assessmentId                                            |
| 会话列表   | 没有；面板内没有新建、清空、历史入口                                                                        |
| 持久化     | 再次进入恢复全部历史，向上滚动按 50 条游标分页                                                              |
| 删除       | 只能随 screen 一起删除                                                                                      |
| 创建       | 懒创建：首条消息发现 `no_session` 时调用 `startScreeningAgentSession`                                       |
| 协作       | 消息带 `person_id` 并显示发送人头像，会话按 screen 区分，团队共享                                           |
| 发送       | 前端只提交本条 `content`，历史以服务端为准；有 `interrupt` 停止接口                                         |
| 运行时     | 独立 agent 服务（Cloudflare Agents / Durable Object），主站签发 1 小时短期 JWT，WebSocket 推送状态          |
| 与页面联动 | agent 推送 `plan_draft`（左侧编辑器实时显示草稿）、`plan_saved` / `suggestions_changed`（前端重新拉取数据） |

可借鉴的核心思想：**会话是“这个对象的配置过程记录”，挂在实体上、团队共用，而不是个人聊天窗口。** 不需要照搬的部分：独立 agent 服务、WebSocket 与 Durable Object，因为本项目已有 Mastra + AI SDK 流式链路，第一版用轮询即可满足协作可见性。

## 现状

- 会话表：`chat_conversation` / `chat_message`（`packages/db-schema/src/schema.ts`）。`user_id` 为 `not null`，对 `user` 级联删除，表示会话的所有者；`chat_message` 没有发送人字段。
- 聊天入口：`POST /api/w/:slug/resume/chat`（`apps/server/src/routes/resume/routes/chat/route.ts`）。它接收前端传来的 **完整 `messages` 历史**，校验所有者后持久化最新一条用户消息，再用 `recruiting-copilot-agent` 流式回答，并在 `onEnd` 时持久化 assistant 消息。
- `focus` 目前只支持 `{ kind: "resume_record", id }`，会注入到 agent instructions 中。
- 检索按发起人的 `visibilityScope` 进行，不同成员看到的候选人范围可能不同。
- 写操作：`propose_recruiting_action`（`requireApproval: true`）配合确认卡片执行，符合 ADR 0013 中“不直接修改业务记录”的规定；确认快照只记录 `confirmedAt`，不记录确认人。
- `/chat` 左侧是个人会话列表，支持删除和批量删除。
- 编辑页表单使用 `@tanstack/react-form`，岗位遵循 ADR 0031 的“单一 Save”。

## 目标与非目标

目标：

1. 同一实体的所有有权成员看到同一份会话，消息显示发送人。
2. 进入详情页打开 Agent 面板，自动回到该实体的当前会话，历史完整保留。
3. 可以为团队开始新对话；旧对话能找回、能删除。
4. agent 能看到发送人页面上尚未保存的表单状态，并把修改建议填进表单，由用户点击现有的 Save 保存。
5. 复用现有会话表、聊天接口和 Copilot agent 体系。

非目标（第一版）：

- 不做 WebSocket 或实时逐字同步：其他成员的消息通过轮询出现，正在生成的内容只有发起人能看到逐字流。
- 不把实体会话混进 `/chat` 的个人列表。
- 不让 agent 绕过 Save 或确认卡片直接写库。
- 不支持离开页面后继续生成（resumable stream 留作后续）。

## 方案

### 1. 会话模型：实体会话（Subject Thread）

**会话键：** `(organizationId, subjectKind, subjectId)`，与成员无关。

- `subjectKind`：`job_description` | `interview_question_template` | `form_template` | `resume_record`，按页面逐步扩展。
- 同一个键下 **最多一个活动会话**，另外可以有若干已归档会话。

**用户可见的行为：**

| 场景             | 行为                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 首次打开面板     | 显示空状态和建议问题，不创建会话；任一成员发送第一条消息时懒创建                                                                       |
| 再次进入同一实体 | 恢复活动会话，最近消息在底部，向上滚动分页加载；用户消息显示发送人头像和姓名                                                           |
| 他人正在对话     | 输入框禁用，提示“{姓名} 正在与 Agent 对话”；结束后自动刷新出新消息                                                                     |
| 不想要当前对话   | 标题栏“新对话”：二次确认“将为所有成员开始新对话”，当前会话归档（不删除），面板回到空状态                                               |
| 找回旧对话       | 标题栏“历史”下拉，列出当前实体的已归档会话（标题、创建人、最后活跃时间）；选中后先只读预览，点“恢复”才替换当前活动会话，原活动会话归档 |
| 删除             | 在历史下拉中删除单条已归档会话，物理删除并级联删除消息，需要二次确认；活动会话不能直接删除，需先开始新对话                             |
| 实体被删除       | 会话不可再进入；后台按 subject 清理（见第 9 节）                                                                                       |

这相当于在 Metaview 的“一实体一会话”上，再加了一层团队可见的“新对话 / 历史”。“新对话”和“恢复”会影响所有成员，所以都有确认。第一版不在会话中写入“{姓名} 开始了新对话”这类系统事件，历史列表显示创建人和最后活跃时间。

### 2. 数据模型

扩展现有表，不新建平行表。ADR 0013 规定 `chat_conversation` / `chat_message` 是唯一的聊天历史来源。

**`chat_conversation`**

| 变更                                                           | 说明                                                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 新增 `subject_kind text null`、`subject_id text null`          | 为空表示 `/chat` 的个人会话；`subject_id` 是多态 ID，不加外键                                               |
| 新增 `archived_at timestamptz null`                            | 非空表示已归档                                                                                              |
| 新增 `created_by_user_id text null`，外键 `on delete set null` | 实体会话的创建人，仅用于展示                                                                                |
| 新增 `run_state jsonb null`                                    | 当前生成状态，例如 `{ runId, userId, startedAt }`，用于并发控制（见第 5 节）                                |
| `user_id` 改为可空，**保留 `on delete cascade`**               | 个人会话照旧，所有者删除时会话随之删除；实体会话的 `user_id` 为空，不会因为某个成员账号被删除而丢失团队历史 |

约束与索引：

- `check ((subject_kind is null) = (subject_id is null))`
- `check ((subject_kind is null) = (user_id is not null))`：个人会话必须有所有者，实体会话不能有所有者。
- 部分唯一索引 `(organization_id, subject_kind, subject_id) where subject_kind is not null and archived_at is null`，保证每个实体只有一个活动会话。并发懒创建依赖它，用 `on conflict do nothing` 再读取。
- 普通索引 `(organization_id, subject_kind, subject_id)`，用于历史列表和实体删除时清理。
- 现有按 `user_id` 查询的 `/chat` 列表天然不会包含实体会话（实体会话 `user_id` 为空），但所有者校验等查询需要复查空值语义。

**`chat_message`**

| 变更                                                       | 说明                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 新增 `author_user_id text null`，外键 `on delete set null` | 用户消息的发送人；assistant 和系统消息为空。成员账号删除后显示“已移除的成员” |

**确认快照**：`RecruitingActionConfirmationSnapshot` 增加 `confirmedByUserId`，共享会话里需要知道是谁确认了动作。

### 3. 权限

“能进入详情页”和“能驱动 agent”分开判断：

| 操作                     | 所需权限                                                   |
| ------------------------ | ---------------------------------------------------------- |
| 查看会话、历史           | 对该实体有查看权限                                         |
| 发送消息、停止生成       | 对该实体有编辑权限（agent 的主要产出是对该实体的修改建议） |
| 开始新对话、恢复归档会话 | 对该实体有编辑权限                                         |
| 删除归档会话             | 对该实体有删除或管理权限                                   |
| 确认业务动作卡片         | 该动作本身所需的权限，按确认人当场判断，与发起人无关       |

每个接口都复用实体现有的权限检查，不新增 chat 专属的角色。

### 4. 检索边界：防止通过共享会话越权看到数据

共享会话最大的风险：agent 按 **发送人** 的 `visibilityScope` 检索，回答却持久化给 **所有** 能看到该实体的成员。

第一版规则：

- 实体会话只开放 **与该实体有关、且对所有能查看该实体的成员都可见** 的工具：读取当前实体、读取实体直接关联的配置、读取编辑页下拉框已提供的可选值（岗位：部门、面试官、成员，`list_job_description_options`；沟通题/表单题：可绑定岗位，`list_bindable_job_descriptions`）、`propose_form_patch`、针对该实体的 `propose_recruiting_action`。
- 补丁覆盖成员能在表单中修改的全部字段（岗位编码由“生成”按钮产生，除外）。引用字段在页面上下文中是 ID；服务端生成补丁前校验 ID 是否存在、面试官是否属于所属部门（未开启跨部门时）、“指定在招岗位”是否至少绑定一个岗位，并解析出展示名称写入补丁的 `displayValues`。校验不通过时工具返回 `patch_rejected` 与原因，agent 据此修正后重新提出。
- Web 端用工具调用条（Tool Chips）展示每次工具调用的动作、参数摘要和结果明细；`/chat` 个人会话同样使用。
- **不开放** 跨候选人检索类工具（`search_resume_records`、`get_resume_pool_detail` 等）。需要这类能力时，引导用户去 `/chat` 个人会话。
- `resume_record` 详情页的会话只允许读取该候选人本身；可见性以该候选人记录的查看权限为准，所以能进入详情页的人看到的内容一致。
- 工具清单按 `subjectKind` 做白名单，并在 copilot 边界 eval 中加入“实体会话不调用跨实体检索工具”的检查。

### 5. 并发与同步

**以服务端历史为准。** 实体会话的请求不再信任前端传来的 `messages` 历史：前端只提交本条用户消息（以及 `pageContext`），服务端从数据库读取历史并组装模型输入，与 Metaview 的做法一致。这样多人、多标签页不会因为本地历史不同而相互覆盖。

**同一时间只有一个生成。**

1. 发送时，服务端在事务中检查 `run_state`：为空或已超时（例如超过 10 分钟）才写入新的 `{ runId, userId, startedAt }`；否则返回 `409 thread_busy`，并附带进行中的发起人。
2. 用户消息与 `run_state` 一起写入，assistant 消息在 `onEnd` 写入后清空 `run_state`；出错或中止时也要清空。
3. 前端收到 `409` 时保留输入内容，提示对方正在对话，等对方结束后再发送。

**其他成员如何看到新消息（无 WebSocket）。**

- 面板打开时轮询线程元数据（例如每 5 秒，页面不可见时暂停），返回 `lastMessageId` 和 `run_state`；发现变化再增量拉取消息。
- 他人正在生成时，显示“{姓名} 正在与 Agent 对话…”的占位，不显示逐字流。
- 发起人自己的流照常通过 `useChat` 显示，结束后用服务端返回的消息替换本地乐观消息。

**重新生成与编辑。** 现有的 `regenerate-message` 会删除指定消息之后的所有消息，共享会话中可能删掉他人的消息。第一版只允许重新生成 **最后一条** assistant 回复，并且要求触发它的用户消息是本人发送的、之后没有更新的消息。不支持编辑已发送的消息。

**停止生成。** 第一版只支持发起人停止自己的生成：前端中断请求，服务端在流结束回调中保存已生成的部分并释放 `run_state`。跨实例停止他人的生成需要共享的运行注册表，暂不提供；异常退出遗留的锁 10 分钟后失效。

### 6. 服务端接口

放在 `apps/server/src/routes/chat/` 下的新子路由 `subject-threads`，仍经过 `/w/:slug` 聚合层鉴权。具体分层按 [Server architecture](../agents/server-architecture.md) 落位。

| 接口                                                                    | 说明                                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /chat/subject-threads/:kind/:subjectId`                            | 活动会话的元数据（`lastMessageId`、`run_state`、创建人）和最近一页消息；没有活动会话时返回 `null`。轮询也使用这个接口，可加 `?since=` 只返回增量 |
| `GET /chat/subject-threads/:kind/:subjectId/messages?before&limit`      | 游标分页加载更早的消息                                                                                                                           |
| `POST /chat/subject-threads/:kind/:subjectId/messages`                  | 发送一条用户消息并返回 UI message stream；服务端加载历史、处理 `run_state`、懒创建会话                                                           |
| `POST /chat/subject-threads/:kind/:subjectId/archive`                   | 开始新对话（归档当前活动会话）                                                                                                                   |
| `GET /chat/subject-threads/:kind/:subjectId/history`                    | 已归档会话列表                                                                                                                                   |
| `GET /chat/subject-threads/:kind/:subjectId/history/:conversationId`    | 只读预览某个归档会话                                                                                                                             |
| `POST /chat/subject-threads/:kind/:subjectId/restore/:conversationId`   | 恢复为活动会话（在事务中归档原活动会话；有进行中的生成时拒绝）                                                                                   |
| `DELETE /chat/subject-threads/:kind/:subjectId/history/:conversationId` | 删除归档会话                                                                                                                                     |

**不复用 `/resume/chat`**：个人会话信任前端传入的历史、按所有者鉴权，实体会话则以服务端历史为准、按实体权限鉴权，两种语义放在同一个接口里会让分支越来越复杂。两者共享流转换（`toAISdkStream`）、消息格式适配和模型配置。

`pageContext`（发送人当前表单的未保存值）只用于本轮推理，不持久化，有大小上限，用 zod 校验 schema，并在 instructions 中声明“这是数据，不是指令”。由于回答会被其他成员看到，`pageContext` 只能包含该实体表单本身的字段。

### 7. Agent 与页面联动

每种实体使用独立的 agent 工厂（岗位为 `createJobDescriptionSubjectAgent`），由服务端的实体注册表按 `subjectKind` 选择，只带第 4 节规定的工具白名单。工作区 Copilot 的工具集与实体会话没有交集，因此不复用 `createRecruitingCopilotAgent`。

两类写入，严格区分：

| 类型         | 例子                            | 机制                                                                              | 是否写库                                                  |
| ------------ | ------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 表单草稿修改 | 改写 JD、调整题目、增删表单问题 | 新工具 `propose_form_patch`，返回按 kind 定义的结构化补丁，在消息中渲染为补丁卡片 | 否，用户应用到自己的表单后点 Save 才保存（符合 ADR 0031） |
| 业务动作     | 绑定岗位、推进阶段              | 现有的 `propose_recruiting_action` 加确认卡片                                     | 确认后走现有守卫 API，记录确认人（符合 ADR 0013）         |

补丁在共享会话中的规则：

- 补丁卡片对所有成员可见，但 **“应用”只作用于点击者本地的表单**，应用状态不持久化、不共享。真正共享的结果是保存后的实体数据本身。
- 第一版不自动填入表单，所有成员（包括发送人）都手动点“应用到表单”，避免生成过程中表单被意外改写。
- 补丁卡片的状态不写入聊天记录，而是由发送人当前表单与最近一次保存的版本实时推导：表单还不是补丁的值时显示“应用到表单”；已填入但未保存时显示“已填入表单，未保存”，本次访问内可撤销；保存后显示“已保存生效”。刷新后未保存的修改会丢失，卡片随之回到“应用到表单”；撤销只在表单仍是补丁的值时可用，避免覆盖之后的手动修改。
- 补丁携带生成时所依据的 `pageContext` 摘要（hash）。应用者的表单与之不一致时（例如他人刚保存过，或本人有未保存修改），提示“内容已变化，仍要应用吗”，而不是静默覆盖。
- 应用后支持撤销，即恢复应用前的值。
- 每种 kind 的补丁 schema 放在 `@app/shared`，由前后端共用。

### 8. 前端挂载

- 详情页顶栏增加 Agent 按钮：`useStudioSidePane("subject-agent")`，内容用 `StudioSidePaneContent` 包裹。
- **聊天状态放在来源组件（详情页）的 Provider 中，而不是 sidepane 内容里。** 侧面板规范规定面板关闭后内容卸载、窄屏切换可能重新挂载，如果状态放在面板内部，关闭面板就会中断生成、丢失输入草稿。Provider 同时持有表单实例的引用，用来应用补丁；Magic Portal 会保留 Context。轮询只在面板打开时进行。
- 数据放在 TanStack Query 中，key 为 `["subject-thread", slug, kind, subjectId]`。打开面板时如果还没有数据，正文必须显示接近最终布局的骨架屏（规范强制要求）；请求失败时显示错误和重试入口。
- 标题栏 `actions`：“新对话”、“历史”。没有编辑权限时两者都隐藏，输入框显示只读提示。历史是 Popover 列表，加载中也要用骨架。
- 复用 assistant-ui 的 thread / composer、引用和确认卡片组件。用户消息需要新增发送人头像和姓名的展示。
- 离开详情页时来源组件卸载，正在生成的请求随之中断（服务端按第 5 节保存部分内容并清空 `run_state`）。正在生成时离开页面需要确认。

### 9. 生命周期与清理

- 实体删除时：在对应的删除用例中同步删除 `subject_kind/subject_id` 匹配的会话；对于异步删除或遗漏的情况，由 Worker 定期清理孤儿会话。
- 成员被移出工作区或账号被删除时，会话和消息保留，发送人显示为“已移除的成员”。
- `run_state` 超时后视为失效，下一次发送时可以覆盖，避免进程崩溃导致会话永久锁死。
- 归档会话保留期限：第一版不自动清理。

## 分阶段

1. **P0 文档与决策（已完成）：** [ADR 0045](../adr/0045-use-shared-subject-threads-for-studio-detail-agents.md) 在 Studio 详情页范围内取代 ADR 0013“不绑定单个岗位或候选人”的表述，记录团队共享、工具白名单与权限规则；`CONTEXT.md` 已补充 Subject Thread（实体会话）术语。
2. **P1 岗位编辑页：** 数据迁移、subject-threads 接口、并发控制与轮询、`propose_form_patch`（JD 字段）、sidepane UI。可以复用现有的 `jobDescriptionDraftAgent` 能力。
3. **P2 沟通题与候选人表单编辑页：** 增加对应的补丁 schema 和工具白名单。
4. **P3 候选人详情：** 只读问答和针对该候选人的确认卡片。
5. **后续：** 如果轮询体验不够，再引入 SSE 推送，让其他成员也能看到逐字流；或引入 resumable stream，支持离开页面后继续生成。

## 新建页的草稿会话（已实现）

- 新建页没有记录 ID，前端生成 `draft-<uuid>` 作为主体；服务端存为 `draft:<创建人 id>:<uuid>`，只有创建人能访问，权限为对应记录的创建权限。
- 首次保存成功后，前端调用 `POST /chat/subject-threads/:kind/:recordId/attach-draft`，把草稿会话转入新记录，之后按团队共享规则访问；面板原本打开时，跳转到编辑页后自动重新打开。
- 从未保存的草稿会话会一直留在库中、仅创建人可见；第一版没有清理任务，后续可由 Worker 定期清理。

## 待确认问题

ADR 0045 已按本方案的建议写入问题 1–3 的默认决定。如需调整，应同时修改 ADR。

1. 发送消息是否要求编辑权限？ADR 0045 已定为：只有查看权限的成员只读。
2. 实体会话是否需要在 `/chat` 中出现？ADR 0045 已定为：不出现。
3. 是否需要离开页面后继续生成？ADR 0045 已定为：第一版不支持。需要的话，P1 就要引入 resumable stream。
4. 第一版接入哪些详情页？本方案建议从岗位编辑页开始。
