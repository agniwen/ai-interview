# 飞书原生审批双向同步可行性核验

核验日期：2026-08-21

范围：只核验飞书开放平台的官方服务端 API；目标是让本系统发起审批、在飞书处理，并将审批状态、处理意见和实际流转路径回写本系统。本文不代表当前项目已经实现该能力。

## 结论

**基本业务闭环可以跑通，也可以实时触发回写；但事件订阅采用的是用户身份，不是应用的 `tenant_access_token`。**

飞书原生审批 v4 官方 API 已足以支持以下闭环：

1. 系统按一个已启用、非自由流程的飞书审批定义创建实例，得到 `instance_code`。
2. 系统持久化本地审批单与 `approval_code`、`instance_code`、创建请求 `uuid` 的映射。
3. 系统按 `instance_code` 拉取审批详情，取得实例状态、各审批任务、评论和时间线，并以此回写本地状态与审计记录。
4. 系统按 `approval_code` 读取审批定义，取得定义中的节点及审批方式；再将其与实例 `task_list` 中的实际任务组合，展示“定义的流程”和“本次实际走到哪里”。

因此，状态、评语、审批人和实际流转可以同步回来。需要特别澄清的是：**飞书返回的 `comment_list` 与 `timeline[].comment` 才是可回写的审批意见；飞书云文档评论不是审批意见的来源。**

飞书官方维护的 [LarkSuite CLI 事件参考](https://github.com/larksuite/cli/blob/main/skills/lark-event/references/lark-event-approval.md)列出了两个精确事件：`approval.instance.status_changed_v4` 和 `approval.task.status_changed_v4`。不过它们只能以 `user_access_token` 建立订阅：订阅者必须是该实例的发起人/审批人，或审批定义管理员。故“应用创建后自动订阅并覆盖所有人”的实现并不成立；必须设计用户 OAuth 授权与订阅生命周期，或退回到轮询。无论使用事件还是轮询，都应在收到事件后再拉取实例详情，详情接口才是评论和完整实际流程的权威来源。

## 官方能力逐项核验

| 需求                          | 飞书官方能力                                                                                      | 可同步的数据                                                                  | 结论       |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| 从本系统发起飞书审批          | `POST /open-apis/approval/v4/instances`，输入 `approval_code`、发起人和表单，响应 `instance_code` | 实例主键                                                                      | 可行       |
| 获取审批最终状态              | `GET /open-apis/approval/v4/instances/:instance_id`                                               | `PENDING`、`APPROVED`、`REJECTED`、`CANCELED`、`DELETED`                      | 可行       |
| 获取每个节点/审批人的执行状态 | 同一详情接口的 `task_list`                                                                        | 任务 ID、审批人 `user_id/open_id`、任务状态、节点 ID/名称、审批方式、起止时间 | 可行       |
| 获取意见/附件                 | 同一详情接口的 `comment_list` 和 `timeline`                                                       | 评论人、评论文本、时间、附件；时间线理由、关联任务、转交/加签/回退等动作      | 可行       |
| 识别配置审批流                | `GET /open-apis/approval/v4/approvals/:approval_code`                                             | 定义状态、`node_list`、会签/或签/顺序/抄送、自选审批人范围                    | 可行       |
| 实时触发回写                  | `approval.instance.status_changed_v4` / `approval.task.status_changed_v4`                         | 实例/任务变更；收到后仍需拉详情补全意见和路径                                 | 有条件可行 |

### 1. 创建实例

官方“[创建审批实例](https://open.feishu.cn/document/server-docs/approval-v4/instance/create?lang=zh-CN)”接口为 `POST /open-apis/approval/v4/instances`，使用 `tenant_access_token`，支持自建应用。请求必须包含审批定义 `approval_code`、发起人 `user_id` 或 `open_id`，以及与该定义匹配的 `form`；成功响应返回 `instance_code`。

`uuid` 是租户内唯一的幂等键：同一个值只能创建一个实例，冲突返回 `60012`。本系统应在调用前生成并落库，而不是在网络失败后直接重发新的 UUID。

创建还有两个实际门槛：

- 审批定义必须启用，否则返回 `1390015`。
- 飞书明确不支持“自定义审批流程 / free process”，返回 `1390013`。也就是说，流程必须先由飞书审批管理后台（或审批定义 API）配置；本系统可以填表和填发起人自选审批人，但不能在每次创建时任意拼出一套新流程。

### 2. 回读状态、审批人、评语和实际流转

官方“[获取单个审批实例详情](https://open.feishu.cn/document/server-docs/approval-v4/instance/get?lang=zh-CN)”接口为 `GET /open-apis/approval/v4/instances/:instance_id`，其中路径参数就是 `instance_code`。它直接返回：

- 实例状态：`PENDING`、`APPROVED`、`REJECTED`、`CANCELED`、`DELETED`。
- `task_list`：任务 ID、审批人 `user_id/open_id`、任务状态、`node_id` / `node_name` / `custom_node_id`、审批方式，以及开始/完成时间。任务状态包括 `PENDING`、`APPROVED`、`REJECTED`、`TRANSFERRED`、`DONE`。
- `comment_list`：评论 ID、评论人、评论内容、评论时间和附件。
- `timeline`：通过/拒绝、转交、前加签/并加签/后加签、减签、回退、撤回、删除、抄送等操作；每项可关联 `task_id`、`node_key`、操作人、理由（`comment`）和时间。

所以，系统不该只存一个“通过/拒绝”的扁平状态。最低限度应把实例快照按 `instance_code` 归档，并把 `task_list`、`comment_list`、`timeline` 以稳定的远端 ID（任务/评论 ID，或时间线的可比较字段）做幂等 upsert。这样可保留转交、加签、回退等会改变实际审批路径的事实。

接口详情页还标注了 `1390009 no operation permission`：除应用 scope 外，目标审批定义自身的“审批操作权限”也必须允许该应用/调用身份读取。因此权限配置和流程管理员配置都要在联调验收中验证。

### 3. 读取审批定义与当前流程

官方“[查看指定审批定义](https://open.feishu.cn/document/server-docs/approval-v4/approval/get?lang=zh-CN)”接口为 `GET /open-apis/approval/v4/approvals/:approval_code`。它可返回定义的启用状态、表单控件、`node_list`，其中包括节点名称/ID/自定义 ID、是否由发起人自选审批人、审批方式（`AND`、`OR`、`SEQUENTIAL`、`CC_NODE`）和可选审批人范围。

这只能说明**定义中的设计流程**。本次实例的**实际当前节点和实际审批人**应以实例详情的 `task_list` 与 `timeline` 为准，因为转交、加签、减签、回退等都可能使实际路径偏离初始定义。

## 推荐的一期流程

```text
本地业务动作
  -> 读取/校验 approval_code 对应定义（上线前缓存，定义变更后再刷新）
  -> 本地创建 approval_request（状态 creating，写 uuid）
  -> POST 创建飞书审批实例
  -> 原子保存 instance_code，状态 pending
  -> 定时 GET 实例详情
  -> 幂等写入 instance/task/comment/timeline 快照
  -> 投影为本地业务状态和审批页面
```

实时方案还需补上：授权用户以 `user_access_token` 分别调用 `POST /open-apis/approval/v4/instances/subscription` 与 `POST /open-apis/approval/v4/tasks/subscription`，设置 `subscription_type` 为 `INVOLVED_APPROVAL`（该用户为发起人或审批人）或 `MANAGED_APPROVAL`（该用户管理该审批定义）。前者对应实例状态事件 `approval.instance.status_changed_v4`，后者对应任务状态事件 `approval.task.status_changed_v4`。同一个状态变更若同时命中两种关系可能重复投递，必须按 `event_id` 去重。

建议始终保留降级轮询：只覆盖本系统创建且仍处于 `PENDING` 的实例；一旦进入终态，额外再拉取一次详情后停止常规轮询。用户刷新审批详情时可以补拉一次。这样既应对用户未授权或订阅失效，也避免全租户扫描。

不建议用“[查询实例列表](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/approval-v4/instance/query)”作为单实例实时同步的主通道：官方说明该查询可能延迟、无法保证实时性，且会过滤被撤销实例。它适合后台对账与发现遗漏，而不是决定某一业务单的即时状态。

## 所需权限与租户配置

以下是官方文档列出的 API 权限，任一同组权限可满足对应接口；一期建议选择够用的最小集合，并在飞书开发者后台完成发布/管理员审批：

| 用途                   | 可用 scope（任一）                                                         | 备注                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 创建实例               | `approval:approval` 或 `approval:instance`                                 | 创建接口要求之一；通常优先评估 `approval:instance` 的覆盖范围                                           |
| 读取单个实例           | `approval:approval`、`approval:approval:readonly` 或 `approval:instance`   | 读取审批人 `user_id` 还需 `contact:user.employee_id:readonly` 字段权限；优先使用 `open_id` 可减少该需求 |
| 读取审批定义           | `approval:approval`、`approval:approval:readonly` 或 `approval:definition` | 用于表单/节点核验与展示                                                                                 |
| 查询实例列表（仅对账） | `approval:approval.list:readonly`                                          | 仅自建应用，且不保证实时                                                                                |
| 订阅实例状态事件       | `approval:instance:read`                                                   | 仅能以用户身份订阅；用户须为相关实例的发起人/审批人或审批定义管理员                                     |
| 订阅任务状态事件       | `approval:task:read`                                                       | 仅能以用户身份订阅；同上                                                                                |

另外必须由飞书审批管理员确保：目标审批定义是启用状态、对目标发起人可见、应用调用身份拥有该定义的审批操作/数据读取权限。仅开 API scope 不足以保证详情拉取成功。

## 未决点与验收清单

1. **事件订阅身份**：必须确定由谁完成 OAuth 授权和持续订阅。若审批流由多人处理，只有已授权且满足“发起人/审批人/审批定义管理员”关系的用户会覆盖其可见实例；因此生产上更适合选择受控的审批定义管理员身份，或将轮询作为漏事件对账。
2. **发起人身份**：创建接口接受 `tenant_access_token` 加显式 `user_id/open_id`。需要在联调中验证应用的通讯录可见范围覆盖真实 HR/候选相关发起人，以及多部门人员是否需传 `department_id`。
3. **模板契约**：先在飞书固定一张审批定义及其字段 ID；发布前用“查看指定审批定义”校验本系统表单映射。模板改动需要检测并阻断或进入兼容迁移，不能静默按旧字段提交。
4. **状态映射**：本地必须明确 `CANCELED` / `DELETED`、回退、转交、加签对业务结果的含义；不能把 `APPROVED` 之外的所有状态都粗暴归为拒绝。
5. **端到端验收**：至少实测创建、通过、拒绝并填写意见、转交、加签或回退、撤回、附件评论，以及重复投递/网络超时下 UUID 幂等。每一步都以详情接口回读结果作为断言。

## 官方来源

- [创建审批实例](https://open.feishu.cn/document/server-docs/approval-v4/instance/create?lang=zh-CN)
- [获取单个审批实例详情](https://open.feishu.cn/document/server-docs/approval-v4/instance/get?lang=zh-CN)
- [查看指定审批定义](https://open.feishu.cn/document/server-docs/approval-v4/approval/get?lang=zh-CN)
- [查询实例列表](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/approval-v4/instance/query)
- [审批事件与用户级订阅参考（飞书官方维护的 LarkSuite CLI）](https://github.com/larksuite/cli/blob/main/skills/lark-event/references/lark-event-approval.md)
