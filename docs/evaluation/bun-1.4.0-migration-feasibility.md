# Bun 1.4.0 迁移可行性评估

评估日期：2026-08-24  
范围：`ai-interview` monorepo 的 JavaScript/TypeScript 包管理、开发/测试、Web SSR、独立后端、异步 Worker、Electron 构建与生产部署。Python LiveKit Agent 继续使用 `uv`，不纳入 Bun 运行时迁移。

## 结论

**允许调整配置与少量运行时适配后，迁移到 Bun 1.4.0 是可行的；没有发现无法绕过的架构级阻断。** 但不建议一次性把包管理器、测试运行器、Web、后端、Worker 和部署同时切换。

> 实施状态（2026-08-24）：本仓库现已完成本地可运行范围内的 Bun workspace、`bun.lock`、受信任安装脚本、既有依赖补丁、Vitest 兼容补丁、Nitro Bun preset、Bun Web/Worker Docker 镜像及 Compose 验证配置。下文保留迁移前评估过程；Nitro close hook、供应链 provenance、队列故障注入/长时间 soak 和真实第三方服务仍是生产上线门禁，不能由本次本地冒烟替代。

本地实施验收已使用固定 digest 的 `oven/bun:1.4.0-debian` 构建 Web 与 Worker 镜像。最终 Compose 运行读取项目已有的 `apps/web/.env`，连接与本地开发相同的 PostgreSQL、Redis、AI 和对象存储配置；Web `/`、`/api/health`、`/api/ready` 与 Worker `/healthz`、`/readyz` 均返回 200，两个应用服务均为 healthy，容器内 `bun --version` 均为 `1.4.0`。该结果确认真实配置下的启动与 readiness，但没有主动提交简历解析或第三方写操作，因此不等于完整业务链路验收。

推荐路径是：

1. 先迁移包管理与开发构建，但暂时让 Vitest 继续由 Node 执行。
2. 将 TanStack Start Web 切到 Nitro Bun preset，并优先在可固定版本的 Docker 环境上线。
3. 再迁移独立 Hono 后端。
4. 最后迁移 BullMQ Worker；它同时涉及 Redis 阻塞连接、数据库、文件流、`child_process`、ffmpeg/LibreOffice 和较高内存负载，是风险最高的一段。

如果要求所有生产进程从第一天起都运行在**精确 Bun 1.4.0**，仍然可以做，但需要维护 Vitest/Nitro 的临时补丁或保留局部 Node 工具链，并完成真实 Redis、PostgreSQL、Feishu、S3 与长时间压力测试。综合可行性约为 **7/10**；采用分阶段混合迁移约为 **9/10**。

## 仓库现状与迁移面

评估开始时根目录固定 `pnpm@11.5.2`，脚本也直接调用 `pnpm`。原 `pnpm-workspace.yaml` 不只是声明 workspace 和 catalog，还使用了 `allowBuilds`、`packageExtensions`、`peerDependencyRules`、`trustPolicy`、最小发布时间和 patched dependency 等 pnpm 专有能力。当前实现已迁移到根 [`package.json`](../../package.json)、`bunfig.toml` 与 `bun.lock`；其中 `trustPolicy: no-downgrade` 没有 Bun 等价项，仍是必须在 CI 另行补齐的生产风险。

主要运行时如下：

| 部分         | 当前技术                                                    | Bun 1.4.0 判断                                 |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------- |
| Web          | TanStack Start、React 19、Vite 8、Nitro 3 beta              | **可迁移，已完成本地构建与 SSR 冒烟验证**      |
| 测试         | Vitest 4.1.7、Zod 4.4.3                                     | **已回移上游互操作补丁，Bun 下队列测试通过**   |
| Backend      | Hono、Better Auth、Drizzle、postgres.js、Mastra、Lark SDK   | **框架层可迁移；外部集成需 staging 验证**      |
| Worker       | Hono、BullMQ、Postgres、IMAP、文件/子进程处理               | **可迁移但风险最高**                           |
| Electron     | Electron 39、electron-vite、electron-builder、`node:sqlite` | **Bun 可做安装/构建，Electron 运行时不应替换** |
| Python Agent | LiveKit Agents、uv                                          | **不受影响，继续使用 uv**                      |

Bun 1.4 增加了大量 Node 兼容测试，但官方仍未宣称 100% 兼容；其 `worker_threads`、`module`、`diagnostics_channel`、`child_process` 等模块仍有未通过的 Node 测试。因此本项目这种服务端、队列、原生依赖和子进程都较重的仓库，不能只以“可以安装”作为上线依据。[Bun 1.4 发布说明](https://bun.sh/blog/bun-v1.4)

## 已完成的精确版本验证

本次使用官方 Bun **1.4.0** Apple Silicon 二进制（revision `34cbb9a40`），在仓库的干净临时副本中验证，没有使用真实生产密钥、数据库或 Redis。

### 1. TanStack Start Web：通过

以 `NITRO_PRESET=bun` 构建当前 Web：

- Vite 8.1.3 成功转换 14,502 个模块并生成 `.output`。
- 用 Bun 1.4.0 启动产物后，`/api/health` 返回 200。
- `/` 返回 200 和完整 SSR HTML。

这与 TanStack Start 官方的 Bun 部署方式一致：React 19+ 项目通过 Nitro `bun` preset 构建。[TanStack Start Hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)

当前 [`vite.config.ts`](../../apps/web/vite.config.ts) 已按评估结果指定 Bun preset：

```ts
nitro({
  preset: "bun",
  routeRules: {
    /* 现有规则 */
  },
});
```

也可以用环境变量保留 Node/Bun 双目标构建，便于回滚。

### 2. Vitest 4.1.7：已通过最小补丁解决

精确 Bun 1.4.0 下运行 `packages/meeting-processing-queue` 的现有测试时，5 个文件全部在收集阶段失败，表现为 Zod 的 `z.object` / `z.enum` 变成 `undefined`。这与 Bun 的 Vite/Vitest ESM-CJS `__esModule` 互操作缺陷完全吻合：[Bun #39866](https://github.com/oven-sh/bun/issues/39866)、[Bun 修复 PR #39888](https://github.com/oven-sh/bun/pull/39888)、[Vitest #10359](https://github.com/vitest-dev/vitest/issues/10359)。

Vitest 已合并兼容修复 [PR #10363](https://github.com/vitest-dev/vitest/pull/10363)。本地临时使用 Vitest 5 预发布版后，原来的 **5 个文件、19 个测试全部通过**。实际迁移没有引入预发布测试框架，而是通过 Bun `patchedDependencies` 将上游的一行修复回移到 Vitest 4.1.7；`meeting-processing-queue` 的 5 个文件、19 个测试和 `resume-parse-queue` 的 4 个文件、24 个测试均在精确 Bun 1.4.0 下通过。

因此这是明确的版本缺口，不是项目代码无法运行。迁移时按稳健程度排序：

1. 当前采用：对 Vitest 4.1.7 回移上游的小型互操作补丁。
2. 备选回滚：Bun 负责安装和应用运行，Vitest 暂时用 Node 执行。
3. 等 Vitest 5 稳定版后升级。
4. 不建议仅为全 Bun 指标直接把生产仓库长期锁在 beta 测试框架。

### 3. Hono Backend：启动链路通过，集成链路待测

独立后端在 Bun 1.4.0 下成功加载并开始监听；随后 Mastra PostgreSQL 初始化因本次故意使用不可连接的测试地址而失败。这至少证明 Hono、Mastra 与主要模块的加载/启动链路不是即时阻断，但不能替代真实数据库验证。

Hono 官方支持 Bun 原生 server。[Hono Bun 指南](https://hono.dev/docs/getting-started/bun) 当前 [`src/index.ts`](../../apps/server/src/index.ts) 使用 `@hono/node-server`，建议增加很薄的 Bun adapter，同时继续复用唯一的 `createServerApp()`，不要复制路由逻辑：

```ts
const app = createServerApp();

const server = Bun.serve({
  hostname,
  port,
  fetch: app.fetch,
});
```

现有 SIGINT/SIGTERM 清理数据库、队列和其他资源的语义必须一起迁移，并给 Bun server 增加同等的关闭路径。

### 4. PostgreSQL 时间戳：运行时必须固定 UTC

当前历史 migrations 中部分 Drizzle `withTimezone: true` 字段实际建成了 PostgreSQL `timestamp without time zone`。`postgres.js` 会用 `new Date(value)` 解析这类返回值，结果依赖进程时区；在 Asia/Shanghai 下验证 Bun 路径时可稳定复现 8 小时偏移。迁移后的测试命令和 Bun Docker 运行时因此显式设置 `TZ=UTC`，不修改业务断言或数据。长期应通过独立 schema migration 将这些列统一为 `timestamptz`，再移除这一运行时约束。

## 关键不兼容点与配置改造

### A. pnpm 配置不能原样删除

Bun 可以自动迁移 pnpm workspace、catalog、overrides 和 patched dependencies，并能读取 pnpm lockfile。[Bun install/migration 文档](https://bun.sh/docs/pm/cli/install) 本地临时迁移也成功生成 Bun lock 并完成 1,716 个包的安装。

但以下 pnpm 能力没有一一对应的自动迁移结果，必须显式处理：

| 现有能力                                               | Bun 迁移方式                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| workspace + catalog                                    | 迁入根 `package.json` 的 `workspaces` / `catalog`，提交 `bun.lock`                                                                        |
| `patchedDependencies`                                  | Bun 1.4 已支持；迁移后验证 Lark patch 实际生效                                                                                            |
| `packageExtensions` 给 `streamdown@2.5.0` 注入 `shiki` | 把 `shiki` 加到实际消费包，或维护一个显式 patch；不能依赖旧 lock 的偶然解析结果                                                           |
| `allowBuilds` / `ignoredBuiltDependencies`             | 映射到 `trustedDependencies`、`nativeDependencies`、`ignoreScripts`，再用 `bun pm untrusted` 审核                                         |
| `peerDependencyRules.allowedVersions`                  | 对齐真实依赖范围，或接受 Bun 的 peer 诊断；没有同名配置可搬运                                                                             |
| `minimumReleaseAgeExclude`                             | 迁到 Bun install 配置，但 CI 要单独验证；Bun 1.4 有最小发布时间与 `bun ci` 交互问题 [#40031](https://github.com/oven-sh/bun/issues/40031) |
| `trustPolicy: no-downgrade`                            | **没有找到等价的 Bun provenance downgrade 策略**；应在 CI 保留独立供应链检查，而不是静默降低保护                                          |
| `shellEmulator: true`                                  | 把 `rm -rf` 等脚本改成跨平台 Bun/TS 脚本，避免依赖 shell 差异                                                                             |

Bun 默认阻止未信任依赖的 lifecycle scripts，因此 Electron、esbuild、Sharp、protobufjs、lefthook 等安装脚本必须按实际需要白名单，而不是使用宽泛的全局放行。[Bun lifecycle 文档](https://bun.sh/docs/pm/lifecycle)

另一个容易遗漏的点是 Bun 1.4 将 Node 兼容目标和原生 ABI 提升到 Node 26.3 / ABI 147；预编译或本地缓存的 Node native addon 不能直接复用，必须在 Bun 安装流程中重新解析和安装。[Bun 1.4 breaking changes](https://github.com/oven-sh/bun/issues/28792)

### B. Nitro 的 Bun 关闭钩子需要处理

当前 Nitro 3 Bun preset 有一个与本项目版本线吻合的开放问题：生成的 Bun server 关闭时不一定执行 Nitro close hooks；上游已有修复 PR 和测试，但尚未完全落地。[Nitro #4479](https://github.com/nitrojs/nitro/issues/4479)、[Nitro PR #4532](https://github.com/nitrojs/nitro/pull/4532)

本地 Ctrl-C 显示服务器正常退出，只能证明端口关闭，不能证明 Feishu bot、数据库连接、队列等应用资源都执行了 close hook。上线前应选择其一：

- 回移上游修复；
- 使用自定义 Bun server，在 `finally` / signal handler 中显式关闭资源；
- 如果 Web 进程只挂载无持久资源的 Hono handler，则先把长连接服务留在独立后端。

同时为 SSE、NDJSON、S3 流式响应和客户端中途断开增加压力测试。旧版 Nitro 曾有 Bun SSE 关闭崩溃记录，虽然不是当前精确版本的已证实问题，但本仓库确实使用流和长连接，不应跳过验证。

### C. BullMQ 应使用 Bun 专用连接适配

BullMQ 官方为 Bun 提供 `createBunRedisClient`，并单独说明了关闭 Worker/Queue 后再关闭底层 Bun Redis client 的顺序。[BullMQ Connections](https://docs.bullmq.io/guide/connections)

当前队列代码使用 ioredis 风格连接参数。建议在共享 queue package 中增加运行时连接工厂：Node 继续使用现有连接，Bun 使用官方 adapter。必须实际验证：

- Worker 阻塞连接和 QueueEvents；
- job retry/backoff、锁续期、stalled job 恢复；
- Redis 短暂断线与重新连接；
- SIGTERM 时停止接单、等待当前 job、关闭 Queue/Worker/client 的顺序。

本次已在实际 Bun 容器中用现有 BullMQ/ioredis 路径先连接隔离 Valkey，再使用项目 `.env` 连接实际 Redis、恢复队列并通过 readiness。`createBunRedisClient` 是可选的 Bun-native 优化，不是框架强制要求；切换它会改变共享连接所有权和关闭顺序，应作为独立变更处理。上述 retry、stall、断线和优雅关机测试仍是 Worker **生产上线**的硬性验收门，而不是由 import/startup smoke test 代替。

### D. 数据库/Auth 主路径可用，但需要长时间 soak

Drizzle 官方 PostgreSQL 路径支持 `postgres.js` 与 `node-postgres`，文档也给出 Bun 安装方式；Better Auth 官方安装和 CLI 同样支持 Bun。[Drizzle PostgreSQL](https://orm.drizzle.team/docs/get-started-postgresql)、[Better Auth 安装](https://better-auth.com/docs/installation)

不过 postgres.js 有 Bun 生产环境随机 `socket.write` 空引用的历史开放 issue [#1066](https://github.com/porsager/postgres/issues/1066)。它使用较旧 Bun，不足以证明 Bun 1.4.0 仍会失败，但足以把以下测试列为上线门禁：连接池高并发、事务回滚、数据库重启、空闲连接回收、长查询取消和 24–72 小时 soak。

Mastra 曾在较旧 Bun/Mastra 组合中出现 `node:http` 导出差异 [#4084](https://github.com/mastra-ai/mastra/issues/4084)，该 issue 已关闭；本项目当前的 Mastra 1.50.1 已在精确 Bun 1.4.0 下完成加载并进入 PG 初始化，因此它不是当前已证实阻断。LiveKit Server SDK 则在官方 README 中明确声明支持 Node、Deno 和 Bun。[LiveKit Server SDK](https://github.com/livekit/node-sdks/blob/main/packages/livekit-server-sdk/README.md)

### E. Feishu/Lark 是外部集成中的最高风险项

项目使用 `@larksuiteoapi/node-sdk@1.63.1`、WebSocket bot 和本地 patch。现有 patch 只调整事件 dispatcher，并没有修复 Bun 运行时差异。Lark SDK 曾报告 Bun 下 `createReadStream` 文件上传导致 socket 提前关闭：[Lark SDK #186](https://github.com/larksuite/node-sdk/issues/186)。该问题来自 Bun 1.3.11 和较旧 SDK，不能视为当前必现，但应在真实 Feishu 测试租户验证：

- WebSocket 建连、重连与并发事件；
- 消息卡片发送与回调；
- 文件上传/下载和大文件流；
- SIGTERM 时连接关闭；
- 当前 patch 在 Bun lock/install 后确实应用。

如果上述任一项不稳定，可以保留 Feishu bot 为 Node 进程，同时其他 HTTP API 先迁 Bun；项目现有 adapter 边界允许这样拆分。

### F. 原生依赖和子进程可做，但要按目标平台重建

Sharp 官方明确支持 `bun add sharp`，同时强调 optional dependency 和跨平台 lockfile 的正确处理。[Sharp 安装文档](https://sharp.pixelplumbing.com/install/) Bun 1.4 也增强了原生依赖安装控制。

项目还通过 `pdfjs-dist@5.4.296` / `react-pdf@10.4.1` 间接使用 `@napi-rs/canvas@0.1.100`。Bun 官方说明其从零实现 Node-API，大多数现有 Node-API 扩展可以直接工作。[Bun Node-API 文档](https://bun.com/docs/runtime/node-api) 本次在全新临时项目中用精确 Bun 1.4.0 安装该版本，macOS ARM64 与固定 Bun 1.4.0 Debian Linux ARM64 容器均成功加载各自的 `.node` 二进制，并分别通过同步 `toBuffer("image/png")` 与异步 `encode("png")` 生成有效 PNG。因此当前 Canvas 使用路径**已确认可用**，不是迁移阻断。

这个结论不应扩展成“所有 NAPI-RS 模块都完全兼容”：NAPI-RS 仍有 ThreadSafeFunction 与 Bun AsyncLocalStorage 组合的开放问题 [#2240](https://github.com/napi-rs/napi-rs/issues/2240)，WASI 构建也有单独兼容问题；本项目当前使用的是平台原生 Canvas 包，不经过 WASI，也没有直接使用前述 ThreadSafeFunction 模式。`@napi-rs/canvas` 1.0.3/1.0.5 曾在 Windows + Bun 的高并发异步 PNG 编码中崩溃 [#1312](https://github.com/Brooooooklyn/canvas/issues/1312)，修复已合并于 [PR #1314](https://github.com/Brooooooklyn/canvas/pull/1314) 并随 1.0.6 后续版本发布；若将来升级到 1.x，不应选择 1.0.3 或 1.0.5。

仍需在 CI 的 x64 Linux runner 上验证 Sharp、esbuild、MuPDF WASM、cbor、Electron 下载及打包；Canvas 已完成本机 ARM64 Linux 容器验证。Worker 的 ffmpeg、LibreOffice 和 `child_process` 应测试：超时、杀进程树、stdout/stderr 背压、临时文件清理、容器 SIGTERM。

Bun 有开放 issue 指出 `--max-old-space-size` 不能像 Node/V8 一样形成可靠的 JSC 堆上限，内存受限容器可能被 OOM kill。[Bun #34917](https://github.com/oven-sh/bun/issues/34917) 对会处理 PDF、音视频和 AI 响应的 Worker，应通过容器 cgroup 监控 RSS，并设置任务并发上限和可回退的 Node 镜像。

## 部署与桌面端

### Docker / 自托管

若“精确 1.4.0”是硬要求，应使用经过校验的 Bun 1.4.0 二进制或固定镜像 digest，并在构建阶段执行 `bun --version` 断言。初期不要直接用 `turbo prune` 替换 Worker Dockerfile 的 `pnpm deploy`：Turborepo 有近期版本生成无效 pruned `bun.lock` 的回归记录 [#12156](https://github.com/vercel/turborepo/issues/12156)。迁移时 Turbo 2.9.14 实测无法解析 Bun 1.4 的 lockfile v2，并输出 workspace 功能降级警告；升级到 2.10.11 后相同 typecheck 不再警告，因此该升级是 lockfile 兼容修复，不是无关升级。

更稳妥的初始镜像策略是：用 Bun workspace filter 安装目标包依赖，构建后执行 production prune，或在单独临时分支验证 pruned lock 可重复安装后再采用 Turbo prune。

### Vercel

Vercel Bun Runtime 目前为 Beta，只能配置 `bunVersion: "1.x"`，由平台管理 minor/patch，无法承诺永远运行精确 1.4.0；自动 sourcemap、bytecode cache 和部分 `node:http` 指标也有差异。[Vercel Bun Runtime](https://vercel.com/docs/functions/runtimes/bun)

因此：

- 若接受 Bun 1.x 自动升级，可继续评估 Vercel；
- 若必须锁定 Bun 1.4.0，使用 Docker/Railway/Kubernetes 等可控运行环境；
- 现有 [`vercel.json`](../../apps/web/vercel.json) 的 pnpm 安装和 Turbo 构建命令也要同步替换。

### Electron

electron-builder 支持使用 Bun 安装和调用构建工具，但最终桌面进程仍运行 Electron 内置的 Node/Chromium。[electron-builder](https://github.com/electron-userland/electron-builder) 项目中的 `node:sqlite DatabaseSync` 应继续由 Electron 运行，没必要改写成 Bun SQLite。需要验证 Bun 安装后的 electron 二进制下载、native module rebuild、macOS 签名/公证和 Windows installer 即可。

## 推荐迁移顺序与验收门

### 阶段 0：建立可回滚基线

- 固定现有 pnpm/Node CI 全量通过结果和生产镜像。
- 新增 Bun 1.4.0 CI job，但暂不替换默认流水线。
- 保留 `pnpm-lock.yaml` 直到 Bun 路径完成连续验证；切换时一个提交只做 lock/config 迁移。

验收：相同 commit 的 pnpm 与 Bun 构建产物都能通过 typecheck、lint 和现有 Node 测试。

### 阶段 1：包管理与开发构建

- 迁移 workspace/catalog/overrides/patch。
- 手动处理 `streamdown` 的 `shiki` 依赖和 lifecycle 白名单。
- 把根脚本中的 `pnpm --filter`、`npx`、`rm -rf` 改为 Bun/跨平台形式。
- 继续让 Vitest 4 走 Node，避免把测试框架 beta 与包管理迁移绑在一起。

验收：两次干净 `bun install --frozen-lockfile` 结果一致；所有平台 native dependency 完整；供应链检查不弱于当前 pnpm `trustPolicy`。

### 阶段 2：Web Bun runtime

- 设置 Nitro Bun preset。
- 处理 Nitro close hook。
- 冒烟覆盖 SSR、Hono `/api`、Auth cookie、上传、下载、S3/NDJSON/SSE 中断。
- 在 staging 做连接泄漏与 RSS 监控。

验收：滚动发布和 SIGTERM 无请求丢失、无残留连接；至少 24 小时稳定运行；Node 镜像可一键回滚。

### 阶段 3：独立 Backend

- 添加 Bun-native Hono entrypoint，复用 `createServerApp()`。
- 对 PostgreSQL、Better Auth、Mastra、LiveKit server SDK、Resend、S3 和 Feishu 做集成测试。

验收：数据库故障恢复、OAuth/session、Feishu 重连、文件流和 graceful shutdown 全部通过。

### 阶段 4：Worker

- BullMQ 切换官方 Bun Redis adapter。
- 验证 retry、stall、并发、关机排空、Redis/DB 断线。
- 对 PDF/图片/音视频/LibreOffice 做内存和子进程压力测试。

验收：72 小时 soak；Redis/DB 故障注入；容器限内存下无不可控 OOM；任务不重复、不丢失。

### 阶段 5：移除过渡兼容层

- Vitest 5 稳定后再决定是否让全部测试运行在 Bun。
- 上游 Nitro 修复发布后移除本地 patch。
- 稳定两个发布周期后再删除 pnpm lock 与 Node runtime 镜像。

## 最终建议

这个项目可以迁到 Bun 1.4.0，真正的阻力不是 React、TanStack、Hono、Drizzle 或 Better Auth 本身，而是四类工程细节：

1. pnpm 的供应链与安装策略不能无损自动搬迁；
2. Bun 1.4.0 + Vitest 4.1.7 有已复现的互操作缺陷；
3. Nitro Bun close hooks 与长连接需要补丁/显式清理；
4. Worker 和 Feishu 属于必须用真实基础设施验证的运行时边界。

因此建议批准迁移，但把目标定义为“**分阶段达到 Bun 1.4.0 生产运行，期间允许测试和个别集成暂留 Node**”，而不是用一次大爆炸式提交追求工具链形式统一。这样既能得到 Bun 安装、构建和 Web 启动的收益，也不会把 Redis job 语义、Feishu 长连接和供应链保护同时置于风险中。
