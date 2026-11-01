# @app/database

后端运行时共享的 Drizzle PostgreSQL 基础包：数据库工厂与 `Database` 类型、共享包使用的环境数据库上下文、连接池参数解析，以及通用查询工具。

## 主要入口

- `.`：`createDatabase(client)` 和 `Database` 类型。
- `./context`：共享包读取数据库的环境上下文。宿主用 `setDefaultDatabase(db)` 注册本进程的连接；某条调用链需要换库时用 `withDatabase` / `bindDatabase` 覆盖。包内模块直接 `import { db } from "@app/database/context"`。
- `./connection-options`：根据 `POSTGRES_*` 环境变量计算连接池参数，供宿主创建连接池时使用。
- `./serialize`、`./pagination`、`./list-text-filters`：DTO 日期序列化、排序分页、列表文本筛选等通用查询工具。

## 职责与边界

- 不读取 `DATABASE_URL`，也不创建或缓存连接池；这些属于宿主运行时（Server 的 `infrastructure/db`、Worker 的 `src/db.ts` 和 `src/workflow-database.ts`）。
- 不放业务 DAO：招聘领域数据在 `@app/recruiting`，业务流程在对应的处理包里。
- 依赖 canonical schema `@app/db-schema`。

## 如何修改

- schema 或 relation 变化改 `@app/db-schema`，不要在这里重复声明表。
- 修改 `./context` 的语义会影响所有共享包，要同时验证 Server、Worker 以及 `resume-processing`、`recruiting-workflows` 的测试。

```bash
bun run --filter @app/database typecheck
bun run --filter @app/database test
```
