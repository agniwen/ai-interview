# 飞书 VC v1 预约会议接口契约核验

查阅日期：2026-08-05

核验范围：`POST /open-apis/vc/v1/reserves/apply` 的主持人请求结构、成功响应主键、无效主持人校正信息、`tenant_access_token` 支持情况，以及请求结果无法确认时的重试边界。

证据基线：飞书开放平台官方文档，以及 `larksuite` 官方组织维护的 Go / Node SDK 生成代码。本文不改业务代码。

## 结论

| 核验项             | 准确契约                                                                                           | 实现含义                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `assign_host_list` | `Array<{ id?: string; user_type?: number }>`，不是 `string[]`；同租户飞书用户的 `user_type` 为 `1` | 以 `open_id` 调用时应发送 `[{ id: openId, user_type: 1 }]`                                                    |
| 预约 ID            | 成功响应字段为 `data.reserve.id`                                                                   | 不应读取 `reserve_id`；本地字段可以继续命名 `feishuReserveId`，但取值来源必须是 `reserve.id`                  |
| 主持人校正信息     | `data.reserve_correction_check_info.invalid_host_id_list?: string[]`                               | 即使 `code=0` 且已创建预约，也必须检查该列表；非空表示外部预约已存在、但主持人要求未完整满足                  |
| 应用身份           | 官方 Go SDK 明确允许 `tenant_access_token`，且 `owner_id` 在应用身份下生效并必填                   | 当前 Bot 应用身份方案受支持；`owner_id` 必须是同租户合法飞书用户                                              |
| 创建幂等性         | 官方请求仅暴露 `user_id_type` 查询参数，body 中也没有客户端幂等键；创建接口为 `POST`               | 不能把重复调用视为幂等；并发、超时、响应解析失败和成功响应落库失败都可能导致重复预约                          |
| 未知结果恢复       | 官方“获取预约”必须提供已经取得的 `reserve_id`；预约资源没有按客户端请求键查询的接口                | 请求已发出但 `reserve.id` 未可靠落库时，应进入 `unknown`，禁止自动再次调用 `apply`，只能人工/外部对账后再处理 |

## 1. `assign_host_list` 是对象数组

官方 Node SDK 为预约接口生成的 TypeScript 类型是：

```ts
assign_host_list?: Array<{
  user_type?: number;
  id?: string;
}>;
```

同一段生成代码显示这是 `meeting_settings` 的字段。[官方 Node SDK：预约请求类型](https://github.com/larksuite/node-sdk/blob/edd979849dd42a3ee90fb5f0b398adaeda8dae9a/code-gen/projects/vc.ts#L756-L794)

官方 Go SDK 也把它建模为 `[]*ReserveAssignHost`，单个 `ReserveAssignHost` 包含：

- `user_type`：用户类型；注释说明仅支持同租户 Lark 用户，示例值为 `1`。
- `id`：用户 ID；当查询参数为 `user_id_type=open_id` 时，这里应传对应应用下的 `open_id`。

来源：[官方 Go SDK：`ReserveMeetingSetting.AssignHostList`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L9672-L9687)；[官方 Go SDK：`ReserveAssignHost`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L9373-L9416)

因此正确的请求片段应为：

```json
{
  "meeting_settings": {
    "assign_host_list": [
      {
        "id": "ou_xxx",
        "user_type": 1
      }
    ]
  }
}
```

## 2. 成功预约 ID 位于 `data.reserve.id`

官方 Node SDK 的成功响应类型明确为：

```ts
data?: {
  reserve?: {
    id?: string;
    meeting_no?: string;
    url?: string;
    app_link?: string;
    // ...
  };
}
```

来源：[官方 Node SDK：预约响应类型](https://github.com/larksuite/node-sdk/blob/edd979849dd42a3ee90fb5f0b398adaeda8dae9a/code-gen/projects/vc.ts#L800-L820)

官方 Go SDK 的 `Reserve` 同样把预约主键映射为 JSON 字段 `id`，注释为“预约ID”。[官方 Go SDK：`Reserve.Id`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L9083-L9096)

飞书“获取预约”官方文档的响应示例也使用 `data.reserve.id`，后续查询接口的路径则是 `GET /open-apis/vc/v1/reserves/:reserve_id`。也就是说，`reserve_id` 是后续接口的路径参数名称，不是创建响应中 `reserve` 对象的 JSON 字段名。[官方：获取预约](https://open.feishu.cn/document/server-docs/vc-v1/reserve/get?lang=zh-CN)

## 3. 必须处理 `reserve_correction_check_info.invalid_host_id_list`

官方 Node SDK 将预约响应中的校正信息定义为：

```ts
reserve_correction_check_info?: {
  invalid_host_id_list?: Array<string>;
};
```

来源：[官方 Node SDK：预约响应校正信息](https://github.com/larksuite/node-sdk/blob/edd979849dd42a3ee90fb5f0b398adaeda8dae9a/code-gen/projects/vc.ts#L803-L819)

官方 Go SDK 的同名模型也明确说明 `invalid_host_id_list` 是“指定主持人无效 id 列表”。[官方 Go SDK：`ReserveCorrectionCheckInfo`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L9521-L9548)

处理顺序应注意：

1. 只要响应已经包含有效的 `data.reserve.id`，远端预约就已经存在，应先持久化预约检查点。
2. 再检查 `invalid_host_id_list`。
3. 列表非空时不能标记整体 `ready`，也不能再次调用创建接口；应保留现有 `reserve.id`，通过修正身份后调用“更新预约”，或进入需人工处理的状态。

这是“远端资源已创建但业务要求未完全满足”，不是“创建没有发生”。

## 4. `tenant_access_token` 受支持

官方 Go SDK 在预约接口的资源代码中声明：

```go
apiReq.SupportedAccessTokenTypes = []larkcore.AccessTokenType{
  larkcore.AccessTokenTypeUser,
  larkcore.AccessTokenTypeTenant,
}
```

来源：[官方 Go SDK：预约接口支持的 token 类型](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/resource.go#L998-L1004)

请求模型同时明确写明：`owner_id` 在使用 `tenant_access_token` 时生效且必传，指定对象必须为同租户下的合法飞书用户；使用 `user_access_token` 时该字段不生效。[官方 Go SDK：`ApplyReserveReqBody.OwnerId`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L16619-L16625)

飞书官方权限列表也把 `vc:reserve`（更新会议预约信息）列为同时支持“应用身份”和“用户身份”，并列出预约会议 API。[官方：API 权限列表](https://open.feishu.cn/document/server-docs/application-scope/scope-list?lang=zh-CN)

因此，使用现有应用的 `tenant_access_token` 创建预约是官方 SDK 当前支持的调用方式。应用身份下必须传 `owner_id`，而主持人的 open ID 也必须属于同一租户、同一应用身份空间。

## 5. 创建接口没有可见的幂等键

官方 Node SDK 生成的预约调用只接受：

- query：`user_id_type`
- body：`end_time`、`owner_id`、`meeting_settings`

它随后向 `/open-apis/vc/v1/reserves/apply` 发起 `POST`。[官方 Node SDK：完整预约调用](https://github.com/larksuite/node-sdk/blob/edd979849dd42a3ee90fb5f0b398adaeda8dae9a/code-gen/projects/vc.ts#L756-L837)

官方 Go SDK 的请求 builder 也只有 `user_id_type` 查询参数，没有 `idempotency_key`、客户端请求 ID 或等价的去重字段。[官方 Go SDK：`ApplyReserveReqBuilder`](https://github.com/larksuite/oapi-sdk-go/blob/8dfbfff01d210b20ec9473bf383d38d1b54aa37b/service/vc/v1/model.go#L16583-L16616)

由此可以得出的工程结论是：**飞书公开契约没有提供可供调用方依赖的创建幂等机制。** 这是根据官方请求模型作出的推论，不是飞书对重复请求行为的额外承诺。实现必须在本地解决并发抢占，并把调用结果不确定的情况与明确失败区分开。

建议状态边界：

| 阶段                                          | 结果判断                    | 是否可以自动再次调用 `apply`                 |
| --------------------------------------------- | --------------------------- | -------------------------------------------- |
| 尚未向飞书发送请求，且本地获得同步执行权失败  | 明确未创建                  | 可以，在重新获得合法执行权后                 |
| 飞书明确返回非零业务错误，且完整响应已读取    | 明确失败                    | 视错误类型决定；不会因为本次响应产生成功预约 |
| 请求已经交给 HTTP 客户端，但网络超时/连接中断 | 不确定                      | 不可以                                       |
| HTTP 成功但响应 JSON 读取或解析失败           | 不确定                      | 不可以                                       |
| 得到 `reserve.id`，但保存检查点失败           | 已创建，但本地未可靠记录 ID | 不可以                                       |
| `reserve.id` 已可靠保存，后续日历/参与人失败  | 已创建且可恢复              | 不再调用 `apply`，从保存的预约检查点继续     |

为避免两个请求同时创建预约，本地同步开始前还需要原子抢占（数据库 compare-and-set、行锁或带过期时间的 lease）。仅把状态无条件更新为 `creating` 不构成互斥。

## 6. 无法确认创建结果时，没有按客户端键恢复的官方接口

飞书“获取预约”接口要求路径参数 `reserve_id`，即只有已经拿到预约 ID 才能查询详情。[官方：获取预约](https://open.feishu.cn/document/server-docs/vc-v1/reserve/get?lang=zh-CN)

官方 VC 概述中，预约资源公开的方法是预约、更新、删除、获取预约和获取活跃会议；没有按客户端请求 ID 查询刚才创建结果的接口。[官方：视频会议概述](https://open.feishu.cn/document/server-docs/vc-v1/video-conferencing-overview?lang=zh-CN)

官方 SDK 的预约请求也没有客户端请求键。因此，如果请求已发出但 `reserve.id` 没有被应用可靠取得并持久化，公开契约不足以安全判断“未创建”。此时建议：

1. 将状态标记为 `unknown`，禁止普通重试入口再次调用 `apply`。
2. 保留应用 ID、owner、主持人、主题、请求发出时间和 trace/request 日志，供管理员在飞书侧核对。
3. 对账确认没有远端预约后，才由有权限的人工操作把状态恢复为可创建。
4. 若从日志或人工核对中找回 `reserve.id`，应补写检查点，再从日历创建阶段继续，而不是重新预约。

## 修复验收清单

- [x] 请求测试断言 `assign_host_list` 是 `{ id, user_type: 1 }[]`。
- [x] 响应测试只从 `data.reserve.id` 读取预约 ID。
- [x] `invalid_host_id_list` 非空时保存已有预约 ID，但不得进入 `ready` 或再次创建预约。
- [x] 对同一真人面试的同步用数据库原子抢占串行化；并发调用至多发送一次 `POST /reserves/apply`。
- [x] HTTP 请求一旦开始发出，直到 `reserve.id` 完成持久化之前的超时、解析错误和数据库错误均进入 `unknown`。
- [x] 已持久化 `reserve.id` 后的重试只恢复日历/参与人步骤，不再调用预约接口。
- [x] `pending` / `creating` 的恢复使用 10 分钟 lease 超时语义，前台恢复入口不会无条件重入。
