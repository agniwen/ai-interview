# Server 导出边界收敛

## 结果（2026-10-11）

- `@app/server` 只导出 `./rpc-client`（Hono RPC 契约，供 Web 使用）和 `./web/runtime`（Web 宿主入口）。`apps/server/src/exports/tests/package-boundary.test.ts` 用白名单固定这一点。
- `apps/worker` 不再依赖 `@app/server`。Worker 需要的招聘流程都搬进了共享包，Worker 构建产物里不再包含 Server 代码。
- 包按职责分层，规则写在 [`packages/README.md`](../../packages/README.md)，并由同一个边界测试强制执行。

## 起点

改造前，Worker 通过 8 个 `@app/server/*` 入口复用 Server 代码，传递引入约 96 个 Server 源文件。其中一个入口还把 Hono 路由层（`routes/agent/route.ts`、`factory.ts`）打进了 Worker 产物。Web 除了 RPC 之外，还要用 `./env`、`./web/document-sync` 等入口。这些共享代码之间还存在目录级的依赖环（飞书 ↔ 面试、通知 ↔ 面试）。

## 实施步骤

1. **切断 Hono 依赖**：把 agent 报告的 Zod 契约和依赖端口从 `route.ts` 中拆出来，生产组合放到 `default-agent-report-dependencies.ts`，`route-runtime.ts` 只负责组装路由。
2. **统一数据库上下文**：`@app/database/context` 提供进程级的默认数据库，并支持 `withDatabase`/`bindDatabase` 覆盖。Server 在 `infrastructure/db` 中注册连接池；Worker 启动时通过 `src/workflow-database.ts` 注册，沿用这些流程原来使用的连接池参数。`resume-processing` 改用这个共享上下文。
3. **基础设施下沉**：`serialize`、`pagination`、`list-text-filters`、`connection-options` 移入 `@app/database`；`stable-stringify` 移入 `@app/shared`；招聘领域模型从 `@app/database` 拆到新包 `@app/recruiting`。
4. **按领域抽包**：先计算文件级依赖环（只有 4 个文件在同一个环里，并且分到了同一个包），再把 85 个文件搬到：
   - `@app/feishu`：飞书开放平台客户端；
   - `@app/recruiting`：新增 `access/*`、`forms/*`、`interview-questions/*`、`global-config`；
   - `@app/recruiting-workflows`：人工面试、AI 面试报告、通知、初面评估、Offer 审批通知、飞书机器人。
5. **收敛 Web 宿主入口**：`./env`、`./web/document-sync` 并入 `./web/runtime`。这个入口只静态导出环境变量契约，其余能力都懒加载，并且先注册 Server 数据库。
6. **整合已有包**：`meeting-processing-queue` 和 `resume-parse-queue` 合并为 `@app/job-queues`（Redis 中的队列名不变）。
7. **测试目录**：Server、Worker 和 packages 中与源码平铺的测试都移到所在目录下的 `tests/`。只测试包内模块的测试随模块迁进包里；需要 Server 测试库的集成测试留在 Server，集中放在 `apps/server/src/tests/recruiting-workflows/`。

## 验证方法

- 在干净的 HEAD worktree 和工作区，分别运行 Server、Worker、Web 以及所有包的测试（JSON reporter），按用例名逐项对比。剩下的差异都确认是既有失败或依赖共享数据库的偶发失败：在隔离运行下两边结果一致。
- 所有包和应用 typecheck，Worker 生产构建，Web typecheck（包括 `rpc-client` 声明构建）。
- 边界测试覆盖以下几点：
  - 导出白名单；
  - `web/runtime` 的静态导入范围；
  - Web 宿主能力在运行前先注册数据库；
  - Worker 不依赖 Server；
  - 所有包都不依赖 Hono 或 `apps/*`；
  - 包按文档分层依赖；
  - Dockerfile 复制了所有包的 manifest。

## 后续

- Server 里 43 个 `resume-processing` facade 已删除，Server 直接调用包；未使用的包导出已移除。剩下照搬目录结构的导出名可以再按能力改名。
- `job-queues` 中每个模块都各自解析 `REDIS_URL`，可以抽出共用的连接模块。
- Worker 进程里仍有两个连接池（Worker 自己的 `src/db.ts`，以及共享流程用的 `src/workflow-database.ts`），与改造前一致。是否合并，需要结合连接数配额来决定。
