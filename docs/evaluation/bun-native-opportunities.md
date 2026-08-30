# Bun 1.4 原生能力优化机会评估

评估日期：2026-08-24  
运行时：Bun 1.4.0（revision `34cbb9a40`）  
范围：Web、集成 Hono Backend、独立 Backend、BullMQ Worker、共享包与 CI；Electron 最终运行时和 Python LiveKit Agent 不在 Bun 原生化范围内。

## 结论

项目已经从 Bun 的安装速度、启动速度、全局 `fetch` 和 Nitro Bun preset 中获得基础收益。下一步最值得做的不是把所有 `node:*` import 机械替换掉，而是按下面顺序处理四个边界：

1. **先把纯逻辑/队列包测试迁到 `bun:test`**：这是目前唯一已经在本仓库测到数量级明显、风险又较低的收益；同一组 19 个测试从 Vitest 的 0.55 秒降到 0.11 秒，约 5 倍。
2. **为 BullMQ 做 Bun 原生 Redis adapter 的可回滚试验**：当前实际解析到 BullMQ 5.78.0，已经包含 `createBunRedisClient`；目标 Redis 7.4.4 也满足 Bun 原生客户端要求。收益可能集中在大量短任务和队列控制操作，必须先跑正确性与断线测试。
3. **在唯一 DB adapter 后试验 Drizzle + `Bun.SQL`**：官方路径已经存在，当前 PostgreSQL 17.9 连接和时间戳读取已通过 Bun 1.4 冒烟；这可能降低数据库驱动 CPU、分配和首查询延迟，但远端网络与 SQL 本身仍可能是主瓶颈。
4. **只对 Cloudflare R2 的简单文件读写试用 `Bun.S3Client`**：R2 的只读签名请求已通过；腾讯 COS 当前配置失败，而录制链路还依赖自定义 checksum/metadata 签名和手工 multipart 生命周期，不能全量替换 AWS SDK。

`Bun.spawn`、standalone executable 和 Bun-native Hono server 都有价值，但对当前业务吞吐的影响低于上述三条。`Bun.CryptoHasher`、全仓 `Bun.file` 重写、Bun Worker thread 和删除所有 `dotenv` 不应作为性能专项优先项。

## 优先级总览

| 优先级 | 机会                                | 当前实现                                        | 预期收益                                                            | 改造成本 | 主要风险 / 必做验证                                            |
| ------ | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| P0     | 分层迁移到 `bun:test`               | 全仓 Vitest 4.1.7 + Bun 兼容 patch              | **CI/本地测试启动显著加速**；纯队列包实测约 5 倍                    | 中       | 不一次迁 Web/DOM/复杂 mock；逐包保持同一断言数量               |
| P1     | BullMQ + Bun Redis                  | BullMQ 默认 ioredis；实际解析 5.78.0            | 高频 Redis 命令、流水线和队列控制面可能明显降低 CPU/延迟            | 中高     | retry、stall、阻塞连接、断线、关闭顺序；保留 ioredis 回滚开关  |
| P1     | Drizzle + `Bun.SQL`                 | `drizzle-orm/postgres-js` + postgres.js 3.4.9   | DB 密集请求的驱动开销、对象创建和冷启动可能下降                     | 中       | 类型映射、事务、关系查询、迁移工具、连接恢复、时间戳语义       |
| P1     | Bun 原生 R2 简单文件路径            | AWS SDK v3 + Node streams                       | 大文件流的内存拷贝、依赖加载和实现复杂度可能下降                    | 中       | 仅 R2 简单 GET/PUT/DELETE；不能破坏校验和、metadata、multipart |
| P2     | `Bun.spawn` 统一子进程包装          | `execFile` + `promisify`                        | 进程创建实测约 1.6 倍；更直接的 Web Streams/AbortSignal/cgroup 控制 | 中       | ffmpeg/LibreOffice 实际运行时间通常远大于启动成本              |
| P2     | Worker 单文件 executable + bytecode | tsdown bundle + Bun + production `node_modules` | 更快启动、更少运行期解析、可能缩小 JS 依赖层                        | 中高     | 动态 import、MuPDF WASM、原生依赖、source map、跨架构构建      |
| P2     | 独立 Backend 改 `Bun.serve`         | `@hono/node-server`                             | 独立 HTTP 服务可提高纯 HTTP 吞吐                                    | 低中     | 集成 Web 已走 Nitro Bun；Worker HTTP 只做健康检查，实际收益低  |
| P3     | `fetch.preconnect` / DNS prefetch   | 首次请求时再建连                                | 降低第一个 AI/Feishu 请求的 DNS/TCP/TLS 冷延迟                      | 低       | 只改善冷路径；必须避免预连不会使用的 host                      |
| 不建议 | 全仓改 `Bun.CryptoHasher`           | Bun 下的 `node:crypto`                          | 本仓库微基准只有约 1.02 倍，几乎无收益                              | 中       | 增加 Bun 专属耦合，却没有可测价值                              |
| 不建议 | 立即用 Bun Worker 并行 PDF          | 主线程 MuPDF WASM + 网络 OCR 并发               | 理论上可隔离同步 rasterize                                          | 高       | Bun 官方仍标为 experimental；WASM 初始化和内存可能抵消收益     |

## 1. `bun:test`：当前最确定的高收益项

Bun 自带 Jest-compatible 测试运行器，支持 TypeScript、mock、生命周期、snapshot、DOM、watch 和 JUnit 输出，但官方也明确说明并非完整 Jest/Vitest 兼容。[Bun Test Runner](https://bun.sh/docs/test)

本仓库当前为 Bun 1.4.0 + Vitest 4.1.7 维护了一条上游互操作补丁。对 `packages/meeting-processing-queue` 做了不落盘到仓库的临时副本实验：

- 5 个文件、19 个测试；
- 只机械替换 `from "vitest"` 和 `vi.fn`；
- Vitest：19/19 通过，wall time 0.55 秒；
- `bun:test`：19/19 通过，wall time 0.11 秒；
- 本机小样本约 **5 倍**，不能直接外推到全仓，但已经足以支持按包迁移。

推荐顺序：

1. `packages/meeting-processing-queue`；
2. `packages/resume-parse-queue`；
3. `packages/shared` 中不依赖 DOM/Vite module graph 的测试；
4. Worker 的纯函数测试；
5. Web、TanStack Start、jsdom、复杂 `vi.mock` 测试继续保留 Vitest，直到单独迁移验收。

验收指标：总测试数量与断言语义不下降，重复运行无 mock 泄漏，JUnit 能被 Jenkins 消费，冷/热 CI 都记录 wall time。不要为了删除 Vitest 一次性迁完整仓库。

## 2. BullMQ 原生 Redis：值得做受控 A/B

当前两个队列 package 声明 `bullmq: ^5.66.0`，`bun.lock` 实际解析为 **5.78.0**，已包含 `createBunRedisClient`。BullMQ 的一手源码也将 Bun built-in client 作为 pluggable Redis client；近期关闭的 [BullMQ #4212](https://github.com/taskforcesh/bullmq/issues/4212) 说明早期 adapter 曾有类型和共享连接关闭问题，当前安装版本已经带后续修复代码，因此仍需要按本项目生命周期重新验证。

Bun 原生 Redis 客户端由 Rust 实现，使用 RESP3、自动 pipeline、TLS、离线队列和指数退避；官方要求 Redis **7.2+**，且当前不支持 Sentinel 和 Cluster。[Bun Redis](https://bun.sh/docs/runtime/redis)

本项目只读探测结果：

- 当前 Redis：**7.4.4**；
- Bun 1.4 `RedisClient` 成功连接并执行 `INFO server`；
- 因此基础版本不是阻断项。

适合放置 adapter 的位置是两个 queue package 的共享连接工厂，而不是在每个 Queue/Worker 调用点散落 Bun 判断：

- `packages/meeting-processing-queue/src/*.ts`
- `packages/resume-parse-queue/src/*.ts`

但收益要按业务类型判断：简历 OCR、LLM、ffmpeg、LibreOffice 都是长任务，Redis 命令占比可能很低；大量短任务、状态轮询和 enqueue/reconcile 才更可能显著受益。

上线门必须包含：10k no-op job 吞吐、p50/p95 enqueue-to-active、CPU/RSS、retry/backoff、stalled recovery、QueueEvents、Redis 断开/恢复、SIGTERM drain，以及 adapter/ioredis 两条实现对同一 Redis 的结果一致性。建议保留环境开关一键退回 ioredis。

## 3. Drizzle + `Bun.SQL`：潜在运行时收益最大，但验证面也最大

Bun SQL 是原生 SQL client，支持 PostgreSQL 的二进制协议、连接池、prepared statement、事务和 TLS；还提供 `--sql-preconnect` 以提前建立首个连接。[Bun SQL](https://bun.sh/docs/runtime/sql) Drizzle 官方已经提供 `drizzle-orm/bun-sql` adapter。[Drizzle + Bun SQL](https://orm.drizzle.team/docs/connect-bun-sql)

当前主 DB 边界已经较好地集中在：

- `apps/server/src/lib/server/db/index.ts`
- `apps/worker/src/db.ts`

这使 A/B adapter 成本可控。本项目只读/合成查询验证结果：

- PostgreSQL **17.9**；
- Bun 1.4 `SQL` 成功连接；
- `timestamp without time zone` 在 `TZ=UTC` 下得到预期 UTC `Date`；
- `timestamptz` 偏移转换正确。

但这还不能证明可直接替换。项目使用 Drizzle 1.0.0-rc.1、relations、事务、大量时间字段，并且历史 schema 中存在 `timestamp without time zone` 与声明不一致的问题。必须用完整 Backend 集成测试验证：日期、numeric/decimal、JSON、array、enum、null、bulk insert、事务回滚、连接池耗尽、数据库重启、statement timeout、长连接回收和 migration tooling。

推荐先做可注入的 DB adapter benchmark，不立即修改 schema。对 5–10 条真实热点 query 各执行冷连接、预热连接和并发 1/10/50，比较 postgres.js 与 Bun.SQL 的 p50/p95、CPU、RSS 和数据库端执行时间。只有客户端时间占比明显时才迁。

## 4. `Bun.S3Client`：R2 可试，不能全量替换

Bun 原生 S3 API 支持 Cloudflare R2、自动 multipart、大文件 streaming、presign、stat、range 和 Blob/Web Stream 风格读写。[Bun S3](https://bun.sh/docs/runtime/s3)

本项目的对象存储集中在 `apps/server/src/lib/server/s3.ts`，但实际有两类完全不同的需求：

- 普通附件/简历：GET、PUT、DELETE、presigned GET；
- 录制 R2：自定义 SHA-256/MD5 header、metadata、手工 Create/List/Complete/Abort multipart、对 `unhoistableHeaders` 的特殊要求。

对当前配置执行不存在对象的只读 `exists()` 探测：

- Cloudflare R2：成功返回 `false`，说明 endpoint/签名基础兼容；
- 腾讯 COS：path-style 与 virtual-hosted-style 均返回 `S3Error: UnknownError`；
- 没有进行上传、删除或业务对象读取。

因此推荐只建立一个 Bun-native R2 实验 adapter，先覆盖简单下载到本地、从本地上传、GET stream 和 DELETE。录制浏览器直传和手工 multipart 继续使用 AWS SDK，腾讯 COS 也继续使用 AWS SDK。这样虽然暂时不能删除全部 AWS SDK 依赖，但可以判断大文件路径是否有内存和吞吐收益。

重点 benchmark：100 MB/1 GB 文件上传下载吞吐、峰值 RSS、失败重试、AbortSignal、临时文件清理、R2 checksum/metadata 一致性，以及同 key 的 AWS/Bun 交叉读取。

## 5. `Bun.spawn`：更适合改善 Worker 的控制能力

项目有 10 个 `node:child_process` 文件，生产热点包括 ffmpeg、LibreOffice 和 PPTX preview；主要路径包括：

- `apps/worker/src/meeting-playback/processor.ts`
- `apps/worker/src/meeting-transcription/qwen-asr-r2.ts`
- `apps/server/src/lib/server/office-conversion.ts`
- `apps/server/src/server/routes/meetings/transcription/audio-pipeline.ts`

Bun 官方说明 `Bun.spawn` 使用 `posix_spawn`，支持 Web Streams、AbortSignal、timeout、maxBuffer 和 Linux cgroup；官方 `spawnSync` benchmark 比 Node `child_process` 快约 60%。[Bun Spawn](https://bun.sh/docs/runtime/child-process)

本仓库 Bun 1.4 微基准（300 次顺序执行 `true`）：

- Bun 下 `node:child_process.execFile`：381.7 ms；
- `Bun.spawn`：239.0 ms；
- 约 **1.6 倍**。

但一次 ffmpeg/LibreOffice 通常运行数秒到数分钟，所以启动节省不会成为业务数量级提升。真正价值是统一超时、signal、stdout/stderr backpressure，并在 Linux 为媒体任务加入 cgroup 资源约束。推荐先做一个小而深的 `runProcess` port，并保持测试可注入，不要逐文件直接调用 Bun 全局。

## 6. 单文件 executable / bytecode：优化部署和冷启动，不优化媒体计算

`bun build --compile --bytecode` 可以把 Bun runtime、应用代码和 npm package 打进单文件，官方说明可减少运行期解析、内存和启动时间。[Bun Single-file Executable](https://bun.sh/docs/bundler/executables)

Worker 是合理试点，因为其 HTTP 面很小且已有 tsdown bundle。但当前存在：

- 大量动态 import；
- MuPDF WASM 旁路复制；
- NAPI/optional dependency；
- ffmpeg 和 LibreOffice 系统包；
- 生产调试需要 source map。

因此 executable 可能减少 `node_modules` 层和冷启动，却不会显著缩小被 LibreOffice/字体/ffmpeg 主导的镜像，也不会加速 AI/媒体任务。先在独立 Docker target 中验证，不要替换当前可回滚镜像。

## 7. HTTP server：Web 已经吃到收益，Worker 不值得优先改

Bun 官方 `Bun.serve` benchmark 在简单 Linux HTTP server 上约为旧 Node 对照的 2.5 倍。[Bun HTTP Server](https://bun.sh/docs/runtime/http/server) Hono 也有官方 Bun 启动方式。[Hono Bun Guide](https://hono.dev/docs/getting-started/bun)

仓库现状：

- Web 的 Nitro preset 已设置为 `bun`，构建产物已走 Bun serve 路径；
- 独立 Backend 和 Worker 仍使用 `@hono/node-server`；
- 当前线上主要是 Web 集成 Backend；
- Worker 的 Hono 只承载 `/healthz`、`/readyz` 等控制面。

所以把 Worker 改成 `Bun.serve({ fetch: app.fetch })` 很简单，但几乎不会提升简历/录制处理吞吐。只有独立 Backend 真正承载高 QPS 时，native server 才值得做 HTTP A/B。迁移时必须保留当前 SIGTERM 清理顺序。

## 8. 明确不建议的机械迁移

### 全仓 `node:crypto` → `Bun.CryptoHasher`

Bun 官方提供增量 `CryptoHasher`，但 Bun 同时原生实现 `node:crypto.createHash`。[Bun Hashing](https://bun.sh/docs/runtime/hashing) 本机对 512 MB 内存数据做 SHA-256：

- Bun 下 `createHash`：163.1 ms；
- `Bun.CryptoHasher`：159.9 ms；
- 约 1.02 倍，属于噪声级收益。

37 个 hash 文件无需重写。只有某个真实 profile 显示 Node stream glue 是瓶颈时，再局部比较。

### 全仓 `node:fs` → `Bun.file`

`Bun.file` / `Bun.write` 确实是官方推荐的优化 I/O API，并可利用 `sendfile`、`splice`、`copy_file_range` 等系统调用。[Bun File I/O](https://bun.sh/docs/runtime/file-io) 但大多数当前 `fs` 用法是小 JSON、测试 fixture、目录管理或必须流式 hash；机械替换没有业务价值。只在“大文件在本地文件、HTTP Response、R2 之间搬运”的路径做 benchmark。

### 立即使用 Bun Worker thread 并行 PDF

Bun Worker 可在独立线程运行 TypeScript，但官方仍明确标为 experimental，尤其是 terminate 行为。[Bun Workers](https://bun.sh/docs/runtime/workers) 当前 PDF 最多渲染 6 页，后续 Qwen OCR 网络调用通常比同步 MuPDF rasterize 更慢。先用 `--cpu-prof` 证明 rasterize 阻塞占比，再决定是否承担 WASM worker pool 的复杂度。

### Electron 改用 Bun SQLite / WebSocket

桌面端最终运行在 Electron 自带的 Node/Chromium，不是 Bun。`node:sqlite`、`ws` 和本地文件原子写入不应为了 workspace 包管理器统一而替换。

## 建议执行路线

### 第一批：一周内可验证

1. 将 `meeting-processing-queue` 的 19 个测试正式迁到 `bun:test`，记录 Jenkins 冷/热耗时。
2. 为 BullMQ Redis client 建立 adapter seam 和环境开关；先只跑 benchmark/故障测试，不直接生产启用。
3. 用 Bun 自带 `--cpu-prof-md`、`--heap-prof-md` 给真实 Worker 样本建立 CPU/RSS 基线。[Bun Benchmarking & Profiling](https://bun.sh/docs/project/benchmarking)

### 第二批：有基线后决定

1. postgres.js 与 Bun.SQL 对真实热点 query A/B；
2. R2 简单文件下载/上传 adapter A/B；
3. 用 `Bun.spawn` 替换一条有完整测试的 ffmpeg 路径，并验证 SIGTERM/timeout/cgroup。

### 第三批：只有指标证明时做

1. Worker executable + bytecode；
2. 独立 Backend 的 `Bun.serve`；
3. PDF rasterization worker pool。

## 成功判定

不要以“删掉多少 npm 包”或“用了多少 Bun API”衡量成功。建议把以下指标固定进 Jenkins：

- 安装、typecheck、各 package 测试的冷/热 wall time；
- Web API 和 enqueue 的 p50/p95/p99；
- no-op 与真实 job 的 jobs/s、enqueue-to-active；
- Worker CPU、RSS、event-loop delay；
- PostgreSQL client time 与数据库端 execution time；
- Redis 断线恢复、stalled/retry 正确性；
- 100 MB/1 GB R2 传输吞吐与峰值内存；
- SIGTERM 下无任务丢失、无重复、无未处理 rejection。

只有指标通过并保留旧 adapter 回滚路径，才把实验切成默认实现。
