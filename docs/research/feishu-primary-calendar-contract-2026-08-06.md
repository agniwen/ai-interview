# 飞书 Calendar v4 主日历接口契约核验

核验日期：2026-08-06

## 结论

飞书官方定义的“查询主日历信息”接口是：

```http
POST /open-apis/calendar/v4/calendars/primary?user_id_type=open_id
Authorization: Bearer <tenant_access_token>
```

不是 `GET`。官方成功响应中的日历 ID 路径是：

```text
data.calendars[0].calendar.calendar_id
```

响应结构示例：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "calendars": [
      {
        "calendar": {
          "calendar_id": "feishu.cn_xxx@group.calendar.feishu.cn"
        },
        "user_id": "ou_xxx"
      }
    ]
  }
}
```

官方 Node SDK 当前代码也将该操作实现为 `POST`，并将返回值声明为
`data.calendars[].calendar.calendar_id`。

## 为什么 `GET /calendars/primary` 会返回 `data.calendar_id`

`GET /open-apis/calendar/v4/calendars/:calendar_id` 是另一个接口，即“查询指定日历信息”。它的成功响应直接返回一个 calendar 对象，因此日历 ID 路径是：

```text
data.calendar_id
```

所以，如果线上实际向 `/calendars/primary` 发的是 `GET`，并收到：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "calendar_id": "..."
  }
}
```

代码就必须从 `data.calendar_id` 读取，不能读取 `data.calendar.calendar_id`，也不能读取 `data.calendars[0]`。不过，官方“查询指定日历信息”文档要求路径参数为真实 `calendar_id`，没有把字符串 `primary` 明确记录为受支持的特殊别名。若要完全遵循公开契约，应改用上面的 `POST` 主日历接口。

## 应用身份语义

- 使用 `tenant_access_token` 时，当前身份是应用机器人；返回的是应用机器人的主日历，不是登录 HR 的个人主日历。
- 应用身份调用前必须开启机器人能力。
- 官方资源说明指出：开启机器人能力的应用默认拥有一个与应用同名的主日历，而且该主日历不可删除。
- 官方文档没有定义“`code = 0` 且主日历列表为空”代表一种正常业务状态。对于已开启机器人能力的应用，空列表不应被当作正常成功；应保留完整响应并按契约异常处理。
- 未开启机器人能力时，官方列出的错误是 HTTP 404、错误码 `190007`（`app bot_id not found`），而不是成功但返回空日历。
- `user_id_type=open_id` 只影响 `POST` 主日历接口返回的 `user_id` 类型；应用身份下该值是应用机器人对应的 open ID。它不是 `GET /calendars/:calendar_id` 的官方查询参数。

## 权限

“查询主日历信息”开启以下任一权限即可：

- `calendar:calendar:read`：读取日历信息。
- `calendar:calendar:readonly`：获取日历、日程及忙闲信息。

建议使用最小且覆盖查询需求的 `calendar:calendar:read`；如果后续还需要读取日程和忙闲，则使用 `calendar:calendar:readonly`。此外必须启用应用机器人能力。

`GET /calendars/:calendar_id` 还接受“更新日历及日程信息”对应的更高权限，但仅为了查询主日历不需要申请更高权限。

## 官方依据

- [查询主日历信息](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/calendar-v4/calendar/primary)
- [查询日历信息](https://open.feishu.cn/document/server-docs/calendar-v4/calendar/get?lang=zh-CN)
- [日历资源介绍](https://open.feishu.cn/document/server-docs/calendar-v4/calendar/introduction?lang=zh-CN)
- [API 权限列表](https://open.feishu.cn/document/server-docs/application-scope/scope-list?lang=zh-CN)
- [larksuite/node-sdk：Calendar v4 生成代码](https://github.com/larksuite/node-sdk/blob/main/code-gen/projects/calendar.ts)
