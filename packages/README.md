# Workspace packages

`packages/` 存放可被多个应用（`apps/web`、`apps/server`、`apps/worker`、`apps/desktop`）共用的 `@app/*` 包。应用负责进程生命周期、连接池、环境变量和 HTTP/队列入口；包只承载可复用的契约、工具和业务流程。

## 分层

依赖只能从上往下：上层可以依赖下层，下层不能依赖上层，同层之间也不能形成环。

| 层                               | 包                                                                    | 可以依赖           | 典型消费方                       |
| -------------------------------- | --------------------------------------------------------------------- | ------------------ | -------------------------------- |
| 流程层：跨能力的招聘业务流程     | `recruiting-workflows`                                                | 下面所有层         | Server、Worker                   |
| 处理层：可复用的单领域工作流     | `meeting-processing`、`resume-processing`                             | 领域层及以下       | Server、Worker、流程层           |
| 领域层：招聘领域数据和规则       | `recruiting`                                                          | 基础层、契约层     | Server、Worker、处理层与流程层   |
| 视图层：MCP 宿主内渲染的静态视图 | `recruiting-mcp-apps`                                                 | 契约层             | Server（作为 `ui://` 资源返回）  |
| 队列契约：BullMQ 队列名、payload | `job-queues`                                                          | 契约层             | 生产者与消费者两侧               |
| 基础层：与业务无关的运行时工具   | `database`、`object-storage`、`ai-runtime`、`meeting-media`、`feishu` | 契约层             | Server、Worker、Desktop、上层包  |
| 契约层：同构类型、schema、状态机 | `shared`、`db-schema`、`meeting-live-transcript`                      | 契约层内更底层的包 | 所有应用（包括浏览器和 Desktop） |

以下内容不放进任何包，归具体应用所有：Hono 路由、Better Auth、TanStack Start、浏览器 UI、连接池、`.env` 加载。

## 组织规则

1. **按业务能力和运行时拆包，不按技术层拆。** 包名描述它拥有的能力，例如 `recruiting`、`meeting-processing`，不用 `utils`、`services`、`daos` 这类名字。
2. **连接池归应用所有。** 包不读取 `DATABASE_URL`，也不创建或缓存连接池。需要数据库的包从下面两种注入方式中选一种：
   - 显式工厂（首选）：`createXxx(db)` 返回已绑定数据库的操作，例如 `@app/meeting-processing` 的 `createMeetingTranscriptionDao(db)`。
   - 包内数据库上下文：深层模块大量使用全局 `db` 时，用 `@app/database/context` 的 `createDatabaseContext("<包名>")` 创建包私有的上下文，再在顶层工厂中用 `bindDatabase` 绑定宿主数据库。示例见 `@app/resume-processing` 的 `src/database.ts`。
3. **导出显式且尽量窄。** `package.json.exports` 只列出确有跨包调用方的入口，导出名描述能力，不照搬内部目录结构。只有纯契约包（`shared`、`db-schema`、队列契约）可以使用通配导出。
4. **每个契约只有一个所属包。** 表结构在 `db-schema`，跨应用的产品契约在 `shared`，队列 payload 在对应的 queue 包。生产者和消费者引用同一份定义，不各自复制。
5. **只在需要时新建包：** 一段行为被至少两个运行时使用，或者某个应用的导出入口越来越宽、需要一个聚焦的归属。只被一个应用使用的代码留在该应用里。
6. **包不能反向依赖应用。** 包不能 import `apps/*` 或 `@app/server`。Server 和 Worker 共享的业务流程放进包里，不让 Worker import Server。迁移路径见 [Server 导出边界收敛](../docs/plans/2026-10-11-server-export-boundary.md)。
7. **测试放在被测模块所在目录下的 `tests/` 文件夹。** 例如 `src/foo.ts` 的测试放在 `src/tests/foo.test.ts`。

## 新增或重命名包的检查清单

- 准备 `package.json`（`@app/<name>`、`private`、`type: module`、显式 `exports`、`typecheck`/`test` 脚本），以及 `tsconfig.json`、`README.md`。
- 在每个消费方的 `package.json` 中声明依赖，然后执行 `bun install` 更新 `bun.lock`。
- 在 `apps/web/Dockerfile` 和 `apps/worker/Dockerfile` 的每个 `bun install` 阶段之前加上 `COPY packages/<name>/package.json`。`apps/web/src/env/__tests__/docker-config.test.ts` 会检查这一点。
- Worker 用到的包要加入 `apps/worker/tsdown.config.ts` 的 `alwaysBundle`。
- 对包本身和所有消费方运行 typecheck 和测试。

## 合并与拆分的取舍

- `meeting-processing-queue` 和 `resume-parse-queue` 已合并为 `job-queues`：两者职责完全相同（BullMQ 契约），依赖也一致。
- `@app/database` 已拆出 `recruiting`：前者只保留与业务无关的数据库工具，招聘领域数据归 `recruiting`。
- `meeting-media`、`meeting-live-transcript`、`meeting-processing` 保持分开：前两个要在 Desktop 或浏览器中运行，不能被 `meeting-processing` 的数据库和 Node 依赖带进这些运行时。
- `feishu` 和 `recruiting-workflows` 分开：飞书平台客户端不含招聘业务，可以独立复用和测试。

## 待办

- `job-queues` 里每个队列模块都各自解析一遍 `REDIS_URL`。可以抽出共用的连接模块，但要逐个核对现有的解析差异后再合并。
- `resume-processing` 的导出名仍沿用早期照搬目录结构的路径（如 `./ingest/support/*`、`./review/support/*`）。Server 的 facade 已删除、未使用的入口已移除，剩下的入口可以再按能力改名收窄。
