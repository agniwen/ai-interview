# @app/server

AI Hiring Copilot 的 Hono 后端运行时。它拥有 HTTP/RPC 边界、认证与工作区授权、业务路由编排、数据库访问和外部集成适配；既可由 `apps/web` 挂载到 `/api`，也可作为独立 Bun 服务运行。

## 职责

- 在 `src/server/app.ts` 组合全局基础设施和业务路由，导出稳定的 `AppType` RPC 契约。
- 在 `src/server/routes/` 按 URL 所属业务能力组织 Hono 垂直切片。
- 在 route-owned DAO 中执行持久化，在 `application/` 中承载可复用的完整业务动作。
- 负责 Better Auth、工作区/权限中间件、队列投递、对象存储、AI 和第三方服务的服务端适配。
- 通过 `./rpc-client`、`./web/runtime` 等显式出口向其它工作区包提供受控能力。

## 边界

- `src/server/app.ts` 只做组合，不放 feature handler 或 feature middleware。
- 保持 `.route("/api", apiRoutes)`；不要改为 `.basePath("/api")`，否则 URL 和 `hc<AppType>` 类型会分叉。
- Hono `Context`、`Request` 和 `Response` 不得进入 application 或 DAO。
- 新的共享业务契约放 `@app/shared`；数据库 schema 放 `@app/db-schema`；可被 Worker 复用的处理流程放对应 `packages/*`。
- 不新增顶层 `services/`、`controllers/` 或 `repositories/` 技术分层目录。

## 修改与新增指南

1. 先找到最接近的 URL owner：`src/server/routes/<capability>/`。
2. 新的真实子资源放 `routes/<child>/route.ts`；普通 collection/detail CRUD 留在同一 capability，可用 `collection-route.ts`、`detail-route.ts` 拆分。
3. `route.ts` 负责验证、读取请求上下文、调用 DAO/application、映射稳定错误和显式状态码。
4. 多步状态变更、事务、跨入口复用或副作用排序放 `application/<verb>.ts`；数据库原语放 `dao.ts` 或 `dao/`。
5. 外部 provider 只有在形成真实可替换边界时才放 `adapters/`，生产组合放 owning route 或 `default-<verb>.ts`。
6. 测试放在被证明的层旁边：route 测 HTTP，application 测业务结果，DAO/integration 测作用域和事务。

修改公开 Hono 路由时要保持路径、方法、状态码、响应和 RPC 推断；若 `AppType` 改变，还要 typecheck `@app/web`。

## 常用命令

```bash
bun run --filter @app/server dev:standalone
bun run --filter @app/server typecheck
bun run --filter @app/server test
bun run --filter @app/server build
```

涉及数据库的集成测试需要有效的 `DATABASE_URL`。独立运行入口为 `src/index.ts`，RPC 客户端入口为 `src/rpc-client.ts`。
