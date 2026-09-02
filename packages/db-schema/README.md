# @app/db-schema

AI Hiring Copilot PostgreSQL 持久化模型的唯一 canonical 定义，包含 Drizzle tables/relations、数据库枚举和与持久化结构紧邻的值对象契约。

## 职责与边界

- `src/schema.ts` 定义表、列、索引、外键和主 schema 导出。
- `src/relations.ts` 定义 Drizzle relations。
- 其它 `src/*.ts` 保存数据库枚举、JSON 字段结构和持久化相邻的 schema/type。
- 本包不包含 DAO、HTTP schema、页面类型或业务流程。
- PostgreSQL 迁移文件由 `apps/web/drizzle/` 管理；修改本包不会自动修改数据库。

## 如何修改或新增

1. 修改或新增表/列时先更新 `src/schema.ts` 及相关枚举/relations。
2. 从根目录运行 `bun run db:generate`，审阅生成的 SQL，不手工接受破坏性变更。
3. 需要数据回填或多阶段兼容时写显式迁移，并确保新旧应用版本可安全过渡。
4. 业务 API 所需但不属于持久化的契约应放 `@app/shared`。
5. 新增可导入模块时遵循现有 `./*` export，并避免从 schema 模块引入运行时应用代码。

验证：

```bash
bun run --filter @app/db-schema typecheck
bun run db:generate
```

生成迁移前确认目标环境文件，迁移后按变更范围运行 Server/Worker 集成测试。
