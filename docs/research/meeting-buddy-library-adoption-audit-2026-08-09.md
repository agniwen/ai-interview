# Meeting Buddy 开源库采用审计（Issues #70–#86）

查阅日期：2026-08-09

审计范围：`#70`–`#86` 对应的本地录制、恢复、上传、会议库、最终/实时转录、人工修订、智能纪要、问答、搜索、导出、清理、容量控制和 Provider 基准评测实现。审计基线为 `837d9552..ef49879d`，共 283 个文件、约 42,659 行新增代码。

本文评估“是否应以流行、持续维护的开源库替代自研通用基础设施”，并记录本次实际采用范围；没有使用真实会议音频、API key 或发起付费 Provider 请求。

## 结论先行

建议分三组处理：

### 已落地：低风险、高收益替换

1. **用 Node.js 内置 `node:util.parseArgs` 替换两个评测 CLI 对 `process.argv.indexOf()` 的手写扫描。** 目前只有平铺 options，没有命令树、交互式帮助或 shell completion，没必要引入 Commander。`parseArgs` 已在 Node 20 起稳定，并能严格拒绝未知 option、缺值和意外 positional。[Node.js 官方文档](https://nodejs.org/api/util.html#utilparseargsconfig)
2. **用仓库已经安装的 `p-retry` 统一评测 Provider 的指数退避。** 保留“只重试 quota error、Tingwu 一旦创建远端 task 就绝不自动重试、精确记录 retry count”的业务谓词；不采用 SDK 默认重试。[p-retry 官方仓库](https://github.com/sindresorhus/p-retry)
3. **用已有 Zod schema 替换本地录制 manifest/save-intent 的手写类型守卫。** 这不会增加依赖，并把运行时校验、类型推导和错误边界放回同一来源。
4. **用 `write-file-atomic@7.0.1` 替换两处通用 temp-file/fsync/rename 实现。** Desktop 外层仍保留父目录 `fsync`，因此没有丢失录制恢复所需的目录项耐久语义；benchmark checkpoint 则获得同路径并发串行化。选择 7.0.1 而不是 8.0.0，是因为当前仓库 Node 24.11 低于 8.0.0 的 Node 24.15 engine 下限。[write-file-atomic 官方仓库](https://github.com/npm/write-file-atomic)
5. **用 `p-limit@7.3.1` 替换 Final Transcription Worker 的自制 permit queue。** 磁盘空间 reservation 仍在受限 task 内维护；purge 与 multipart 的“首批失败后不再启动后续副作用”语义没有被通用 limiter 抹平。[p-limit 官方仓库](https://github.com/sindresorhus/p-limit)

### 后续候选：必须先做兼容性 spike

6. **评估以现有 OpenAI SDK 替换 Backend 的 OpenAI Final/Realtime 原始请求层。** 只有 `maxRetries: 0`、206/429/timeout 映射、AbortSignal 和 region/base URL 行为全部由 fixture 证明后才迁移；Desktop WebRTC transport 不在范围内。[OpenAI 官方 Node SDK](https://github.com/openai/openai-node)
7. **评估以 `@deepgram/sdk` 替换 Deepgram 预录音端点的手写请求层。** 它是 Deepgram 官方、多维护者、活跃发布的 SDK，但会增加约 2.4 MiB unpacked 代码及 transport 适配面。当前 fetch adapter 很小，且 endpoint/region fence、canonical transcript、Zod 边界仍必须自研，因此本次不为“SDK 化”扩大生产风险。[Deepgram 官方 SDK](https://github.com/deepgram/deepgram-js-sdk)

### 明确不替换

- **不要**用 `proper-lockfile` 替换付费 benchmark lock 或本地 active-capture lock。
- **不要整体移除**录制 spool writer 的父目录 `fsync`；库只负责通用 file-level atomic replace，目录耐久 fence 继续由项目保留。
- **不要**用通用 Levenshtein/Hungarian 包替换当前长文本 CER 与 speaker assignment。
- **不要**为了 SRT 这一种简单输出引入 `subtitle`。
- **不要**引入 `fluent-ffmpeg`、`ffmpeg-kit` 或直接把 `ffmpeg-static` 打进桌面/Worker。
- **不要**更换虚拟化库；Meeting transcript 已经使用健康且流行的 `@tanstack/react-virtual`。
- **不要**在 BullMQ job 外再套一层通用队列；现有队列已经负责持久化、attempts 和 backoff。

## 维护与流行度门槛

本报告按以下原则判断：

- 一手来源只用 npm Registry/npm downloads API、官方仓库和官方文档。
- “活跃”优先看最新版本发布时间和官方仓库状态；高周下载不能洗掉多年未发布或已 deprecated 的风险。
- “多人维护”优先看 npm publisher/maintainer 数量或供应商组织维护。单维护者库只有在代码面很小、采用量极高、且仓库已接受该依赖时才进入建议。
- 大小采用 npm Registry 的 `dist.unpackedSize`；它不是 tree-shaken bundle，也不含 `ffmpeg-static` 安装时下载的平台二进制。
- 周下载区间统一为 2026-08-02 至 2026-08-08；数字会随时间变化，只表示本次审计快照。

## 候选库一手信号快照

| 能力           | 候选                                                                                 | 最新版本 / 发布                                                                       |                                                                                    周下载 |             npm 维护者 | 许可                      |    unpacked / 直接依赖 | 结论                                               |
| -------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------: | ---------------------: | ------------------------- | ---------------------: | -------------------------------------------------- |
| CLI            | [`commander`](https://www.npmjs.com/package/commander)                               | [15.0.0 / 2026-05-29](https://registry.npmjs.org/commander/latest)                    |                  [475,601,960](https://api.npmjs.org/downloads/point/last-week/commander) |                      2 | MIT                       |            202 KiB / 0 | 健康，但当前 CLI 太小；用 Node `parseArgs` 即可    |
| 原子写         | [`write-file-atomic`](https://www.npmjs.com/package/write-file-atomic)               | [8.0.0 / 2026-05-08](https://registry.npmjs.org/write-file-atomic/latest)             |           [99,751,605](https://api.npmjs.org/downloads/point/last-week/write-file-atomic) |           3（npm CLI） | ISC                       |             12 KiB / 1 | **采用兼容的 7.0.1；外层保留目录 fsync**           |
| 文件锁         | [`proper-lockfile`](https://www.npmjs.com/package/proper-lockfile)                   | [4.1.2 / 2021-01-25](https://registry.npmjs.org/proper-lockfile/latest)               |             [22,157,770](https://api.npmjs.org/downloads/point/last-week/proper-lockfile) |                      2 | MIT                       |             29 KiB / 3 | 高采用但长期未发版，且 stale 语义与付费 fence 冲突 |
| 重试           | [`p-retry`](https://www.npmjs.com/package/p-retry)                                   | [8.0.0 / 2026-03-26](https://registry.npmjs.org/p-retry/latest)                       |                     [46,402,904](https://api.npmjs.org/downloads/point/last-week/p-retry) |                      1 | MIT                       |             25 KiB / 1 | **采用；仓库已有 7.1.1**                           |
| 并发           | [`p-limit`](https://www.npmjs.com/package/p-limit)                                   | [7.3.1 / 2026-07-20](https://registry.npmjs.org/p-limit/latest)                       |                    [317,015,548](https://api.npmjs.org/downloads/point/last-week/p-limit) |                      1 | MIT                       |             15 KiB / 1 | 健康；简单 limiter 可用，仓库后端已安装            |
| 并发映射       | [`p-map`](https://www.npmjs.com/package/p-map)                                       | [7.0.6 / 2026-07-20](https://registry.npmjs.org/p-map/latest)                         |                       [79,033,422](https://api.npmjs.org/downloads/point/last-week/p-map) |                      1 | MIT                       |             21 KiB / 0 | **P2 可选**；更贴合两个 mapper 场景                |
| 距离           | [`leven`](https://www.npmjs.com/package/leven)                                       | [4.1.0 / 2025-09-11](https://registry.npmjs.org/leven/latest)                         |                       [61,480,326](https://api.npmjs.org/downloads/point/last-week/leven) |                      1 | MIT                       |             10 KiB / 0 | 不替换长文本 Myers bit-vector 实现                 |
| 距离           | [`fastest-levenshtein`](https://www.npmjs.com/package/fastest-levenshtein)           | [1.0.16 / 2022-08-02](https://registry.npmjs.org/fastest-levenshtein/latest)          |         [25,343,366](https://api.npmjs.org/downloads/point/last-week/fastest-levenshtein) |                      1 | MIT                       |             21 KiB / 0 | 发布偏旧；不替换                                   |
| assignment     | [`munkres-js`](https://www.npmjs.com/package/munkres-js)                             | [1.2.2 / 2017-01-02](https://registry.npmjs.org/munkres-js/latest)                    |                      [47,408](https://api.npmjs.org/downloads/point/last-week/munkres-js) |                      1 | Apache-2.0 / BSD-3-Clause |               很小 / 0 | 不满足维护与流行门槛                               |
| 字幕           | [`subtitle`](https://www.npmjs.com/package/subtitle)                                 | [4.2.2 / 2025-11-16](https://registry.npmjs.org/subtitle/latest)                      |                        [57,858](https://api.npmjs.org/downloads/point/last-week/subtitle) |                      1 | MIT                       |            108 KiB / 4 | 健康但收益不足；不替换                             |
| OpenAI         | [`openai`](https://www.npmjs.com/package/openai)                                     | [7.4.0 / 2026-08-03](https://registry.npmjs.org/openai/latest)                        |                      [32,126,877](https://api.npmjs.org/downloads/point/last-week/openai) |           18（OpenAI） | Apache-2.0                | 11.95 MiB / 0 必选依赖 | **采用现有 6.39.0；先不顺带升 major**              |
| Deepgram       | [`@deepgram/sdk`](https://www.npmjs.com/package/@deepgram/sdk)                       | [5.7.0 / 2026-07-22](https://registry.npmjs.org/%40deepgram%2Fsdk/latest)             |              [728,214](https://api.npmjs.org/downloads/point/last-week/%40deepgram%2Fsdk) |          4（Deepgram） | MIT                       |           2.40 MiB / 1 | **P1 采用**                                        |
| Tingwu         | [`@alicloud/tingwu20230930`](https://www.npmjs.com/package/@alicloud/tingwu20230930) | [2.0.24 / 2026-03-16](https://registry.npmjs.org/%40alicloud%2Ftingwu20230930/latest) |       [529](https://api.npmjs.org/downloads/point/last-week/%40alicloud%2Ftingwu20230930) | 5（Alibaba Cloud SDK） | Apache-2.0                |            234 KiB / 2 | 官方且活跃，但远未达到流行门槛；条件采用           |
| subprocess     | [`execa`](https://www.npmjs.com/package/execa)                                       | [10.0.1 / 2026-07-31](https://registry.npmjs.org/execa/latest)                        |                      [156,835,137](https://api.npmjs.org/downloads/point/last-week/execa) |                      2 | MIT                       |           352 KiB / 12 | 健康，但两处 `execFile` 不值得新增 12 个直接依赖   |
| FFmpeg wrapper | [`fluent-ffmpeg`](https://www.npmjs.com/package/fluent-ffmpeg)                       | [2.1.3 / 2024-05-19](https://registry.npmjs.org/fluent-ffmpeg/latest)                 |                [2,144,215](https://api.npmjs.org/downloads/point/last-week/fluent-ffmpeg) |                 历史 5 | MIT                       |           11.8 MiB / 2 | **官方已 deprecated/archived，排除**               |
| FFmpeg binary  | [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static)                       | [5.3.0 / 2025-11-14](https://registry.npmjs.org/ffmpeg-static/latest)                 |                [1,646,183](https://api.npmjs.org/downloads/point/last-week/ffmpeg-static) |                      4 | GPL-3.0-or-later          |      元数据 47 KiB / 4 | 不采用；实际二进制与许可证需另算                   |
| 虚拟化         | [`@tanstack/react-virtual`](https://www.npmjs.com/package/@tanstack/react-virtual)   | [3.14.9 / 2026-07-28](https://registry.npmjs.org/%40tanstack%2Freact-virtual/latest)  | [21,077,510](https://api.npmjs.org/downloads/point/last-week/%40tanstack%2Freact-virtual) |          3（TanStack） | MIT                       |             55 KiB / 1 | **已经正确采用**                                   |
| 虚拟化替代     | [`react-virtuoso`](https://www.npmjs.com/package/react-virtuoso)                     | [4.18.11 / 2026-07-17](https://registry.npmjs.org/react-virtuoso/latest)              |               [3,195,372](https://api.npmjs.org/downloads/point/last-week/react-virtuoso) |                      1 | MIT                       |            237 KiB / 0 | 健康，但迁移没有收益                               |

## 逐项代码审计

### 1. CLI 参数解析：改用 `node:util.parseArgs`

当前重复实现：

- [`cli.ts`](../../apps/server/src/scripts/meeting-transcription-eval/cli.ts) 的 `argument(name)`。
- [`report-costs.ts`](../../apps/server/src/scripts/meeting-transcription-eval/report-costs.ts) 的同名函数。

手写 `indexOf()` 的具体问题：

- `--dataset` 缺值时会把下一个 option 名误当成值。
- 未知 option 被静默忽略。
- 重复 option 的行为未定义，只取第一个。
- boolean 与 string option 分散在 `process.argv.includes()` 和 `argument()` 两种读取方式。

为什么不选 Commander：Commander 本身完全合格，且有 4.76 亿周下载、两位 npm 维护者、零依赖；但本项目只有两个内部脚本和一层 options。Node 官方把 `parseArgs` 定义为比直接操作 `process.argv` 更高层的严格解析 API，当前 Node 22 Worker/Node 24 开发环境都满足要求。[Node `parseArgs` 文档](https://nodejs.org/api/util.html#utilparseargsconfig) [Commander 官方仓库](https://github.com/tj/commander.js)

迁移要求：

- 抽一个仅供两个评测入口复用的 typed option schema；不建通用 CLI framework。
- `strict: true`、`allowPositionals: false`。
- `retry-ambiguous` 定义为 boolean；其余路径/费用/删除状态定义为 string。
- 继续用 Zod 校验枚举、金额和跨字段条件。
- 增加 unknown option、missing value、duplicate option、意外 positional 的测试。

### 2. 重试与退避：复用已有 `p-retry`

当前重复实现：

- [`cli.ts`](../../apps/server/src/scripts/meeting-transcription-eval/cli.ts) 的 per-chunk `while (attempt < 3)` 与 `1000 * 2 ** (attempt - 1)`。
- [`runner.ts`](../../apps/server/src/scripts/meeting-transcription-eval/runner.ts) 还有一层可配置 attempt loop；当前 CLI 实际传 `maxAttempts: 1`。

仓库后端已经直接依赖并在 resume parsing 使用 `p-retry@7.1.1`，因此复用不会扩大供应链。`p-retry` 官方支持 `shouldRetry`、`onFailedAttempt`、`maxRetryTime`、`AbortSignal`、指数 factor/min/max timeout，正好覆盖现有语义。[p-retry API](https://github.com/sindresorhus/p-retry#api)

必须保留的业务 fence：

- 只重试 `MeetingProviderQuotaError`。
- 本次失败若让 `taskIds.length` 增加，说明远端可能已创建付费 task，必须停止自动重试并进入 ambiguous reconciliation。
- `retries: 2`、`factor: 2`、`minTimeout: 1000`；基准为了可复现可保持 `randomize: false`。
- 传入同一个 abort signal。
- `onFailedAttempt` 只记录已实际消费的 retry，不能把业务层恢复次数混入 SDK 内部重试。
- 不同时在 runner、adapter、SDK 三层启用重试。建议 benchmark 只保留 adapter 的 per-chunk retry；runner 继续 `maxAttempts: 1`。

BullMQ 的 job retries/backoff 已由 [`@arc/meeting-processing-queue`](../../packages/meeting-processing-queue/src/meeting-transcription.ts) 提供，不要再用 `p-retry` 包裹整个 Worker job。

### 3. 并发限制：采用 `p-limit` 的 permit，保留有副作用的批处理边界

审计发现三种并发语义：

- Final Transcription Worker 的 media permit queue 只是通用 FIFO concurrency gate，已用 `p-limit` 替换，并保留 task 内的共享磁盘 reservation。
- [`local-meeting-multipart.ts`](../../apps/desktop/src/main/meeting-capture/local-meeting-multipart.ts) 用共享 `nextInstruction` + 四个 `uploadNext()` worker 控制并发，同时保证首错后不再领取新 part。
- [`meeting-purge/processor.ts`](../../apps/worker/src/meeting-purge/processor.ts) 每八项切片，再 `Promise.allSettled()`；某批失败后不会开始下一批删除。

`p-map` 官方明确支持控制 concurrency、首错停止和 signal；7.0.6 零直接依赖、7,903 万周下载、2026-07 仍活跃。[p-map 官方 API](https://github.com/sindresorhus/p-map#api)

后两项没有改成 `p-limit`/`p-map`：

- npm 发布权只有一位维护者，未完全达到“多人维护”的偏好。
- multipart 当前首错后不再领取新 instruction；迁移必须用 `stopOnError: true`，并验证首错发生时未启动的 PUT 不会继续启动。
- purge 当前以 batch 为 barrier；若改成对全数组 `pMap`，已启动的操作仍会完成，这是允许的，但不能在首错后继续启动所有剩余删除。
- Desktop 明确希望避免不必要依赖；`p-map` 虽然只有约 21 KiB/零依赖，也必须以净删代码和行为测试为前提。

`p-limit` 很适合 permit queue，但如果把整个 purge 数组一次性排队，会在首个失败后继续启动后续删除，改变原有副作用边界；因此只在适配的 Worker permit 场景采用。[p-limit 官方 API](https://github.com/sindresorhus/p-limit)

### 4. 文件锁：保留自研 domain fence

候选 `proper-lockfile` 很流行，也用原子 `mkdir` 并通过 `mtime` heartbeat 判断 stale；但最新 npm 版本仍是 2021 年。更关键的是，它的默认 stale 机制与本项目两个 lock 的语义不同。[proper-lockfile 设计](https://github.com/moxystudio/node-proper-lockfile#design)

Benchmark [`run-lock.ts`](../../apps/server/src/scripts/meeting-transcription-eval/run-lock.ts) 的目的不是普通进程互斥，而是防止：

- 人为判断“旧锁”后误启动第二轮真实付费调用。
- lock 被手工替换后旧 owner 在 release 时删除新 owner 的 lock。
- owner JSON 尚未完整落盘就让 lock 对外可见。

现有实现通过完整写入 unpublished inode、hard-link 原子发布、token + dev/inode 双重 ownership 检查来满足这些条件。`proper-lockfile` 官方还明确列出它不能检测“lock 被手工删除、另一个 owner 立即获得 lock”的情况；这正是当前 release fence 要防的场景。[proper-lockfile compromised 边界](https://github.com/moxystudio/node-proper-lockfile#compromised)

Desktop `active-capture.lock` 则与录制 manifest/recovery 状态协同，不是通用 stale-process lock。应用重启后要把 `recording` 转成 `interrupted`、验证片段前缀并展示恢复，而不是按 PID/mtime 自动清除。

结论：两个 lock 都保留。若未来出现真正的多进程共享普通文件锁场景，再单独重新评估；不要为统一 API 改掉当前 domain semantics。

### 5. 原子写：采用库处理 file replace，保留目录耐久 fence

[`local-meeting-recording-store.ts`](../../apps/desktop/src/main/meeting-capture/local-meeting-recording-store.ts) 的 `atomicWrite()` 做了：

1. 随机临时路径与 `wx`；
2. `0600` 权限；
3. 写入并 `fsync` 临时文件；
4. rename；
5. 再 `fsync` 父目录。

最后一步是录制崩溃恢复所需的目录项耐久保证。`write-file-atomic` 官方 README 暴露 file `fsync`、mode 和 temp callback，并串行化同路径并发写，但没有承诺父目录 `fsync`，也不提供最终目标 `flag: "wx"` 的 create-only 语义。[write-file-atomic 官方说明](https://github.com/npm/write-file-atomic#writefileatomicfilename-data-options-callback)

因此采用分层方案：

- Desktop spool writer 用 `write-file-atomic` 负责随机临时文件、file `fsync`、rename、异常清理和同路径写串行化，外层继续父目录 `fsync`。
- benchmark checkpoint 使用同一库，修复固定 temp path 在并发 replace 时的碰撞；新增回归测试先复现 `EEXIST`，再验证并发写入后文件仍是完整 checkpoint。
- benchmark final output 继续使用 `writeFile(..., { flag: "wx" })`，保持 create-only evidence，不用 atomic replace 覆盖已有报告。

### 6. CER / Levenshtein：保留长文本 exact Myers bit-vector

[`metrics.ts`](../../apps/server/src/scripts/meeting-transcription-eval/metrics.ts) 的 CER 不是普通输入框模糊匹配：

- 输入允许完整长会议中文文本，单份 transcript 有显式资源上限。
- 现有实现是 BigInt Myers bit-vector exact edit distance，并有长相同串、单错误和空参考回归测试。
- 替换候选 `leven`/`fastest-levenshtein` 虽下载量高，但 npm 发布权集中于一人；`fastest-levenshtein` 最新发布仍是 2022 年。
- 候选官方文档没有给出对本项目 20 万字符上限的内存/复杂度承诺。仅凭 benchmark 宣传不能证明比当前实现更安全。

结论：保留自研算法和测试。若未来需要把评测变成通用 ASR benchmark 包，优先与成熟的 Python ASR 评测生态做离线交叉验证，而不是为了删 50 行把核心指标交给一个更弱约束的 JS 包。

### 7. Hungarian assignment：不存在符合门槛的 JS 替代

当前 `maximumAssignmentWeight()` 只用于 speaker mapping，矩阵硬限制为最多 64 位 speaker，并由 speaker-error regression 覆盖。

语义正确的 npm 候选 `munkres-js` 只有约 4.7 万周下载、单维护者、最后版本发布于 2017 年；不符合“流行、多人维护、当前活跃”的要求。[munkres-js npm 元数据](https://registry.npmjs.org/munkres-js/latest) [官方仓库](https://github.com/addaleax/munkres-js)

结论：保留当前约 70 行实现。不要误用粒子动画包或名字相似的 assignment 包；如果未来 speaker 上限显著扩大，再考虑把 benchmark metrics 移至 SciPy 等成熟离线评测环境。

### 8. 字幕：保留小型流式 SRT formatter

[`meeting-export.ts`](../../packages/shared/src/meeting-export.ts) 只生成 SRT，不解析字幕、不转 VTT、不做 resync。当前 formatter 与分页 DB 读取、ACL recheck、WHATWG `ReadableStream` 和逐页审计直接组合。

`subtitle` 是健康候选，支持 Node stream 的 SRT/VTT parse/stringify/resync；但只有约 5.8 万周下载、单维护者、108 KiB/4 个直接依赖。[subtitle 官方仓库](https://github.com/gsantiago/subtitle.js)

为约 15 行 timestamp/cue 格式引入它，会产生 Node stream ↔ WHATWG stream 适配，并不能替代授权、分页、审计和 speaker normalization。结论：不采用。若以后增加“导入 SRT/VTT、双向转换、重同步”，再引入它。

### 9. Provider SDK：OpenAI 立即复用，Deepgram 先 spike，Tingwu 条件采用

#### OpenAI：已有 SDK，但本次先不改 transport

仓库已经解析到 `openai@6.39.0`，其本地类型已经包含：

- `audio.transcriptions.create` 和 `diarized_json`；
- `realtime.clientSecrets.create`；
- `.withResponse()` raw response；
- `maxRetries` 与 timeout。

潜在替换位置：

- [`providers/openai.ts`](../../apps/server/src/server/routes/meetings/transcription/providers/openai.ts)
- [`providers/openai-realtime.ts`](../../apps/server/src/server/routes/meetings/transcription/providers/openai-realtime.ts)

迁移前必须满足：

- 先使用现有 6.39.0，不把 SDK 7 major upgrade 混入本次重构。
- `new OpenAI({ apiKey, baseURL, maxRetries: 0, timeout })`。
- 使用 `.withResponse()` 保留 206 partial-result、request ID 和状态检查。
- 将 SDK `RateLimitError` 或 `APIError.status === 429` 映射为现有 `MeetingProviderQuotaError`。
- 保留 Zod response schema 和 canonical mapping。
- 以可注入的最小 client interface 测试，不要 mock SDK 内部私有实现。

OpenAI 官方说明连接错误、408、409、429 和 5xx 默认会重试两次；本项目必须关闭它，避免隐藏付费调用次数。[OpenAI SDK retries/timeouts](https://github.com/openai/openai-node#retries) 官方音频 API 也确认 `gpt-4o-transcribe-diarize` + `diarized_json` 返回 speaker segment。[OpenAI Audio API](https://platform.openai.com/docs/api-reference/audio/createTranscription)

Desktop 的 [`openai-realtime-transport.ts`](../../apps/desktop/src/renderer/src/lib/meeting-capture/openai-realtime-transport.ts) 使用浏览器 WebRTC、RTCDataChannel backpressure 和 ephemeral secret。它不是 OpenAI Node SDK 的目标面，不要为了“全 SDK 化”迁移。

#### Deepgram：P1 官方 SDK spike

[`providers/deepgram.ts`](../../apps/server/src/server/routes/meetings/transcription/providers/deepgram.ts) 手写了 multipart/body、query、auth、timeout、status/error 与响应类型。

`@deepgram/sdk@5.7.0` 由 Deepgram 官方维护，四位 npm maintainer，约 72.8 万周下载；官方提供 `listen.v1.media.transcribeFile()`、导出 response types、custom fetch/base URL、timeout/maxRetries 和 `.withRawResponse()`。[Deepgram SDK README](https://github.com/deepgram/deepgram-js-sdk#file-transcription)

Spike 必须验证：

- `diarize_model=v2`、`mip_opt_out=true`、`utterances=true` 等当前 query 在 v5 类型中完整可表达。
- `maxRetries: 0` 能覆盖每次请求，且 raw response 可识别 206。
- EU/AU/custom base URL 不会被 SDK 重写；实际 endpoint region 校验仍留在项目代码。
- WebM Blob/Buffer 输入不会复制出不可接受的峰值内存。
- SDK error 能稳定映射 429、timeout、malformed/partial。

SDK 只替换 transport；说话人 key、双轨语义、时间偏移、Zod 解析与 canonical transcript 仍是项目业务。

#### Tingwu：当前不因低下载量直接引入；生产化时必须改官方 SDK

[`tingwu-http.ts`](../../apps/server/src/scripts/meeting-transcription-eval/tingwu-http.ts) 手写 ACS3-HMAC-SHA256 canonical query/signing。这类安全协议通常应该交给供应商 SDK。

但 `@alicloud/tingwu20230930@2.0.24` 虽由 Alibaba Cloud SDK 团队、五位 npm maintainer 持续发布，周下载只有 529，远未达到用户要求的“流行”门槛，而且 npm 元数据没有独立包仓库。阿里云官方 CreateTask 文档明确建议通过 OpenAPI Explorer 生成 SDK 代码并使用内置凭据安全，而非手签。[Alibaba Cloud SDK 官方仓库](https://github.com/aliyun/alibabacloud-typescript-sdk) [Tingwu CreateTask 官方文档](https://help.aliyun.com/en/tingwu/api-tingwu-2023-09-30-createtask)

结论：

- Tingwu 仍是 benchmark-only 时，不为 529 周下载的包立即扩依赖；保留 signer 的固定向量测试。
- 如果 #86 真实评测后让 Tingwu 获得 production eligibility，**上线前必须**改用官方生成 SDK；安全/签名正确性在此场景优先于流行度门槛。
- SDK 不会替代 signed source URL 的 byte/hash 验证或结果 URL 拉取后的 Zod 校验。

### 10. FFmpeg：保留透明的 `execFile(argv)` 薄层

当前 [`audio-pipeline.ts`](../../apps/server/src/server/routes/meetings/transcription/audio-pipeline.ts) 只运行两个透明、固定 argv 的 FFmpeg 操作，并显式校验 `ffmpeg -version`、timeout、kill signal、codec 和 30 分钟切片。Worker playback mixer 也是同类固定命令。

候选情况：

- `fluent-ffmpeg` 官方仓库已于 2025-05 archived，并明确写明 deprecated、对近期 FFmpeg 不能正常工作，直接排除。[fluent-ffmpeg 官方弃用声明](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg)
- `ffmpeg-static` 活跃且流行，但它提供的是平台二进制，不是命令 wrapper；npm 元数据的 47 KiB 不包含下载的二进制。当前包是 GPL-3.0-or-later，Electron 分发前还必须核对具体构建的 codec 与许可证。[ffmpeg-static 官方仓库](https://github.com/eugeneware/ffmpeg-static) [FFmpeg 官方许可证说明](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md)
- `execa` 非常流行且活跃，但为两处安全的 `execFile` 增加 352 KiB/12 个直接依赖，收益不足。
- 原 `ffmpeg-kit` 已退休；React Native 包也不适合 Electron。[FFmpegKit 官方仓库](https://github.com/arthenica/ffmpeg-kit)

结论：保持 `execFile` + argv 数组；不要用 shell command string。FFmpeg 二进制的可重复分发应作为 #87 packaging/licensing 工作单独处理，不应伪装成 wrapper 重构。

### 11. 虚拟化：已经使用正确的库

[`meeting-transcript-panel.tsx`](../../apps/desktop/src/renderer/src/components/features/meeting/meeting-transcript-panel.tsx) 已经使用 `@tanstack/react-virtual`，包括 stable turn id、dynamic `measureElement` 和 overscan。

该包由 TanStack 三位 npm maintainer 维护，约 2,108 万周下载、MIT、55 KiB；官方定位正是 headless 大列表与动态测量。[TanStack Virtual 官方仓库](https://github.com/TanStack/virtual) [Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)

`react-virtuoso` 同样健康，但更偏成品组件。当前 UI 需要自有 markup、seek button 和 correction editor，迁移只会扩大 UI 回归面。结论：保持现状；这部分没有重复造轮子。

## 推荐实施顺序与验收

### 本次已完成

1. `node:util.parseArgs` 替换两个评测 CLI argument helper。
2. `p-retry@7.1.1` 替换 benchmark 两层手写 quota retry loop。
3. 已有 Zod 替换本地 manifest/save-intent 手写验证器。
4. `write-file-atomic@7.0.1` 替换 checkpoint 与 spool 的通用 file-level 原子写；Desktop 保留目录 `fsync`。
5. `p-limit@7.3.1` 替换 Final Transcription Worker permit queue。

验收：

- CLI unknown/missing/duplicate/positional tests。
- quota retry 仍恰好最多两次；创建 remote task 后零自动重试。
- concurrent checkpoint replacement、quota retry、Provider canonical fixtures 与现有 benchmark tests 全绿。
- Desktop 本地录制/恢复测试、Worker 转录/清理测试、三包 typecheck 和 Electron production build 全绿。

### 后续：Provider SDK spike

分别对 OpenAI/Deepgram 做不含真实凭据的 fixture/transport spike，验证 raw status、custom base URL、region、AbortSignal、timeout 和 error mapping；通过后再逐个替换 production adapter。不要把两个 Provider SDK 改造放在同一提交，便于回滚。

### 不继续做：有副作用的 concurrency cleanup

本轮验证表明，直接把 purge/multipart 换成通用 limiter 会改变“首批失败后不再启动新副作用”的行为，因此保留当前几十行实现；除非以后需求明确改变失败语义，否则不再为统一 API 引入 `p-map`。

## 最终判断

Meeting Buddy 并不是普遍“重复造轮子”。本次替换的是**没有领域差异的机制层轮子**：CLI 解析、指数退避、file-level atomic replace、schema validation 和单纯 concurrency permit。当前自研的 lock、目录耐久 fence、指标、SRT、FFmpeg argv、上传/清除副作用边界和 canonical mapping 大多是在实现项目特有的安全、付费、恢复、ACL 或评测语义；用通用库强行抹平这些边界会降低正确性。

最小且高收益的落地组合是：

> `node:util.parseArgs` + 已有 Zod / `p-retry` + `write-file-atomic`（外层目录 fsync）+ `p-limit`（仅纯 permit），Provider SDK 留给独立兼容性 spike。

## 调研边界

- 数据来自 2026-08-09 的 npm Registry/npm downloads API 和官方仓库/文档；周下载与最新版本是时间快照。
- 没有用真实会议音频、API key 或付费调用验证 SDK 行为。
- npm unpacked size 不等于 Electron/Worker 最终 bundle；Deepgram/OpenAI 的实际 tree-shaking 和 FFmpeg 二进制体积需在实现 spike 中测量。
- 本文没有评估依赖供应链漏洞；实施前仍需运行 lockfile audit、license 检查和生产 bundle diff。
