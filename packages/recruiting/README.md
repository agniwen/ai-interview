# @app/recruiting

招聘领域数据层，供 Server、Worker 和各处理包共用：招聘记录、只读投影、流程节点流转、AI 评审确认、Offer 审批状态、引用保留，以及工作区权限和招聘配置（表单、面试题、全局配置）。

## 主要入口

- `./records`、`./read-model`、`./pipeline`、`./ai-review`、`./offer-approval`、`./reference-retention`：招聘记录及其流转。
- `./access/*`：工作区角色、招聘小组权限、权限快照。
- `./forms/*`、`./interview-questions/*`、`./global-config`：招聘配置的读写与版本。

## 职责与边界

- 只包含持久化原语和领域规则，不包含 HTTP、队列消费或外部集成。
- 数据库通过参数传入，或从 `@app/database/context` 获取；本包不创建连接池。
- 表结构属于 `@app/db-schema`；需要编排多个能力的完整流程放在 `@app/recruiting-workflows` 或 Server 的 application 层。

```bash
bun run --filter @app/recruiting typecheck
bun run --filter @app/recruiting test
```

集成测试需要 `RECRUITING_TEST_DATABASE_URL` 指向隔离的测试库，未配置时跳过。
