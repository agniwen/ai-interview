# access

Server 侧的工作区访问控制：把 Better Auth 的权限判断、工作区访问策略和招聘可见范围组合起来，供中间件和路由使用。

## 职责

- `workspace-permissions.ts`、`workspace-access-policy.ts`：基于 Better Auth 判断成员能否访问某个工作区资源和动作。
- 招聘可见范围（`resolveRecruitingVisibilityScope` 等）在 `@app/resume-processing/review/support/access-recruiting-visibility`，路由直接从包里 import。当前规则：owner/admin 可见全部；其他成员可见自己、全部直接/间接下级，以及开启“数据共享给同级”的同级本人创建的数据；虚线汇报上级也能看到该成员及其下级（汇报设置存于 `workspace_member_reporting`，虚线关系存于 `workspace_member_dotted_manager`），noAccess 与非成员不可见（ADR-0043）。

## 边界

- 与宿主无关的角色和权限快照规则在 `@app/recruiting/access/*`，这里只组合 Server 特有的部分（Better Auth、请求上下文）。
- 不接收 Hono `Context`；中间件先取出用户、组织和角色，再调用这里的函数。
