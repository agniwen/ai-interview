# context

请求范围的工作区上下文类型和取值工具。中间件写入 Hono 变量后，路由通过这里拿到已经校验过的成员、组织和用户，再把它们作为显式参数传给 application 或 DAO。

## 边界

- 只依赖 `http-context.ts` 中的 Hono 环境类型，不访问数据库。
- application 和 DAO 不能直接 import 本目录；它们只接收路由传进来的值。
