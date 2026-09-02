# @app/web

AI Hiring Copilot 的招聘端 Web 应用，基于 TanStack Start、React、TanStack Router/Query、Vite 和 Tailwind CSS。它负责页面与浏览器状态，并在集成运行时把 `@app/server` 挂载到 `/api`。

## 职责

- 呈现招聘台、人才库、岗位、面试、日程、配置和智能体等用户工作流。
- 在 `src/routes/` 定义 TanStack Router 路由、loader、search validation 和薄页面组合。
- 在 `src/components/features/` 维护 feature-owned UI、hooks 和客户端状态。
- 在 `src/lib/client/` 放可复用浏览器工具，在 `src/lib/start/` 放 TanStack Start 服务端适配。
- 维护 Web 环境加载、国际化、SSR/客户端入口、构建与数据库迁移命令。

## 边界

- `src/routes/` 只能包含路由模块，不放可复用组件、页面 section、dialog group、列表 renderer 或状态模型；`-` 前缀不是绕过该规则的方法。
- 后端业务行为和持久化属于 `apps/server`；Web 不直接复制 DAO 或权限判断。
- 跨前后端契约放 `@app/shared` / `@app/db-schema`，不要在 fetch 调用旁临时声明重复类型。
- `routeTree.gen.ts` 是生成文件，不手工编辑。
- `apps/web/drizzle/` 拥有 PostgreSQL 迁移；schema 的 canonical 定义仍在 `@app/db-schema`。

## 修改与新增指南

| 需求                     | 修改位置                                                                     |
| ------------------------ | ---------------------------------------------------------------------------- |
| 新增页面或 URL           | `src/routes/` 新建薄路由，再在 `src/components/features/<feature>/` 实现页面 |
| 新增 feature UI 或状态   | `src/components/features/<feature>/`                                         |
| 新增通用 UI              | 先确认有多个使用方，再放共享 component/lib 目录                              |
| 新增数据读取或 mutation  | 使用 typed RPC/TanStack Query；后端实现放 `apps/server`                      |
| 新增 Start server helper | `src/lib/start/`，明确环境边界，避免浏览器 bundle 引入 server-only 模块      |
| 修改数据库               | 先改 `@app/db-schema`，再用 `db:generate` 生成并审阅迁移                     |

修改 TanStack Start/Router 行为前，按根目录 `AGENTS.md` 运行匹配的 TanStack Intent 指南。不要手写推测中的框架 API。

## 常用命令

```bash
bun run --filter @app/web dev
bun run --filter @app/web typecheck
bun run --filter @app/web test
bun run --filter @app/web build
bun run --filter @app/web db:generate
bun run --filter @app/web db:migrate
```

涉及路由、SSR 或公开 RPC 的修改至少运行 typecheck 和相关测试；涉及构建边界、server-only import 或部署产物时再运行完整 build。
