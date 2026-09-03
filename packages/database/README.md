# @app/database

后端运行时共享的 Drizzle PostgreSQL 数据库构造包，导出统一的 `Database` 类型和连接到 Drizzle schema 的工厂。

## 职责与边界

- 根据一个已创建的 PostgreSQL client 构造 Drizzle database。
- 统一导出 Server、Worker 和 processing 包使用的数据库类型。
- 依赖 canonical schema `@app/db-schema`。
- 不负责读取 `DATABASE_URL`、创建/缓存连接池、事务业务规则或执行迁移；这些属于宿主运行时和 Web 的迁移工具。

## 如何修改或新增

- schema 或 relation 变化改 `@app/db-schema`，不要在这里重复声明表。
- 新的 driver/runtime 适配应接受外部连接，避免包内全局连接和环境变量副作用。
- 数据库查询与 DAO 放到拥有业务能力的 app/processing 包，不放在本包。
- 修改工厂返回类型时同时 typecheck Server、Worker 和依赖该类型的 processing 包。

```bash
bun run --filter @app/database typecheck
```
