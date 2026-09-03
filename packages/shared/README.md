# @app/shared

所有运行时可安全复用的产品契约包，包含 TypeScript 类型、Zod schema、状态机、序列化规则和无环境副作用的通用工具。

## 职责与边界

- 定义 Web、Desktop、Server、Worker 之间共同理解的 API/job/UI-facing 数据结构。
- 保存候选人流程、简历、会议、权限、分页、日期等 isomorphic 规则。
- 可以依赖 `@app/db-schema` 的稳定值类型，但不得依赖任何 `apps/*`。
- 不访问数据库、文件系统、网络、环境变量、Node-only API 或浏览器全局。
- 不放仅有一个调用方的 helper，也不成为业务逻辑“大杂烩”。

## 如何修改或新增

- 新契约按业务名创建 `src/<domain>.ts`，并通过现有 `./*` export 使用。
- 对外输入优先提供 runtime schema 和由其推导的类型，避免只写 TypeScript interface 而无校验。
- 字段重命名/删除需审计所有运行时和已持久化/排队 payload，必要时保持兼容解析。
- 状态机规则应集中在一个模块并覆盖允许/拒绝的 transition 测试。
- 只服务某个后端流程的类型留在所属 processing 包；数据库专属结构放 `@app/db-schema`。

```bash
bun run --filter @app/shared typecheck
bun run --filter @app/shared test
```
