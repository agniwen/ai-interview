# Sentry 线上错误追踪可行性评估（2026-08-28）

## 结论

本仓库可以接入 Sentry。建议先使用 Sentry Cloud 的 Team 方案，仅启用生产错误上报和 source map；已决定按 Web、Backend、Worker、Desktop、LiveKit Agent 拆分为五个项目。TanStack Start 的官方 SDK 已可用但仍标记为 Beta，因此 Web 服务端接入需要做生产构建和真实部署验证。

Developer 免费方案适合单人 PoC；正式团队使用时，单用户、30 天查询窗口和只提供邮件通知会很快成为限制。

## 当前套餐边界

Sentry 当前官方价格页列出的基础额度如下（均为每月额度）：

| 项目                | Developer |         Team |                 Business |
| ------------------- | --------: | -----------: | -----------------------: |
| 基础价格            |        $0 |       $26/月 |                   $80/月 |
| 用户                |         1 |         不限 |                     不限 |
| Projects            |      不限 |         不限 |                     不限 |
| Errors              |     5,000 |       50,000 |                   50,000 |
| Logs                |      5 GB | 5 GB，可加购 |             5 GB，可加购 |
| Application Metrics |      5 GB | 5 GB，可加购 |             5 GB，可加购 |
| Spans               | 5 million |    5 million |                5 million |
| Session Replays     |        50 |           50 |                       50 |
| Uptime monitors     |         1 |    1，可加购 |                1，可加购 |
| Cron monitors       |         1 |    1，可加购 |                1，可加购 |
| Attachments         |      1 GB |         1 GB |                     1 GB |
| 查询窗口            |     30 天 |   最长 90 天 | 最长 90 天，另有抽样留存 |

Team 还增加不限用户、API 和第三方集成以及 20 个自定义 dashboard；Business 增加高级额度管理、无限 dashboard、SAML/SCIM 等能力。付费方案超过基础额度时可按量付费。Error 额度按 SDK 捕获并发送的错误事件计数，并非按去重后的 issue 数计数，所以重试循环或错误风暴会快速消耗额度。

来源：[Sentry Pricing](https://sentry.io/pricing/)、[Sentry Stats and discarded events](https://docs.sentry.io/product/stats/)

## 与当前仓库的版本兼容性

本仓库快照：TanStack Start `^1.168.27`、Hono `^4.12.18`、Nitro `3.0.260610-beta`、React `19.2.7`、Electron `^39.2.6`、Python `>=3.10,<3.15`。

- `@sentry/tanstackstart-react` 当前为 `10.71.0`，要求 Node `>=18`；官方包标记为 Beta，最低支持 TanStack Start `1.111.12`。本仓库版本满足最低要求。
- `@sentry/hono` 当前为 `10.71.0`，支持 Hono `^4.x`，并可配合 Node 或 Bun SDK；Hono SDK 已在 Sentry JavaScript `10.55.0` 晋升为 stable。
- `@sentry/bun` 当前为 `10.71.0`，要求 Node 兼容环境 `>=18`。
- `@sentry/electron` 当前为 `7.17.0`，官方声明支持 Electron `>=23`，因此 Electron 39 在范围内。Electron SDK 自身版本号与 JavaScript SDK 不同，不应强行对齐 major；其内部依赖当前 Sentry JS 10.x。
- Python `sentry-sdk` 当前为 `2.68.1`，声明支持 Python `>=3.6`；本仓库 3.10–3.14 范围满足要求。
- Sentry 的现代 source map 流程要求 JavaScript SDK 至少 `7.47.0`；当前 10.x 满足。source map 必须在相应 release 的错误产生前上传，历史事件不会被追溯反解。

来源：[TanStack Start SDK npm page](https://www.npmjs.com/package/@sentry/tanstackstart-react)、[Sentry JavaScript SDK repository](https://github.com/getsentry/sentry-javascript)、[Sentry JavaScript 10.55 release](https://github.com/getsentry/sentry-javascript/releases/tag/10.55.0)、[Electron SDK npm page](https://www.npmjs.com/package/@sentry/electron)、[Python SDK PyPI](https://pypi.org/project/sentry-sdk/)、[Source map troubleshooting](https://docs.sentry.io/platforms/javascript/guides/hono/sourcemaps/troubleshooting_js/)

## 本仓库的接入边界

建议至少分为以下 Sentry projects，并统一使用同一个 Git commit SHA 作为 release，再以 environment 区分 production/staging：

1. Web：TanStack Start 客户端、SSR 和 server functions。
2. Backend：独立 Hono API。
3. Worker：BullMQ worker、定时恢复任务和诊断服务。
4. Desktop：Electron main、renderer 和 native crash。
5. LiveKit Agent：Python agent。

Web 进程同时包含 TanStack Start、Nitro 和内嵌 Hono，独立后端又能单独启动。应在每个进程入口只初始化一次 SDK，避免 TanStack、Nitro、Hono 三层重复捕获同一异常。TanStack SDK当前仍为 Beta，必须验证客户端异常、SSR 异常、Hono 500、source map 和 release 关联；不能只用本地开发模式判断成功。

当前代码已有 Hono 顶层 `onError`、worker 的大量 `console.error`、Electron `uncaughtException`/`unhandledRejection` 和 renderer Error Boundary，这些是合适的接入点，但不能简单把所有 `console.error` 自动转成错误事件，否则容易产生噪声和额度爆发。

## 隐私和安全要求

这是招聘系统，错误上下文可能包含姓名、手机号、邮箱、简历正文、面试转写、录音地址、鉴权 header、Cookie、AI prompt 和模型输出。第一阶段建议：

- 保持 `sendDefaultPii: false`；不发送 request/response body、Cookie、Authorization、简历和转写内容。
- 使用 `beforeSend` 和 Sentry 服务端 data scrubbing 双重删除敏感字段，并关闭 IP 存储。
- 初期不启用 Session Replay；以后启用时继续遮罩文本、输入和媒体，并对候选人页面整体 block。
- source map 上传 token 只放 CI；上传后不要公开部署 `.map` 文件。
- 错误事件只使用内部 workspace/user/candidate 的不可逆标识或哈希，不使用姓名、邮箱、手机号。

Sentry Cloud 当前提供 US 和 Germany 两个数据区域，免费 Developer 也可以选择。若主要在中国大陆运行，需要在上线前实测 outbound ingestion 稳定性，并单独评估跨境数据和内部合规要求；Sentry 当前未列出中国大陆 SaaS 数据区。

来源：[Sentry organization scrubbing API](https://docs.sentry.io/api/organizations/update-an-organization/)、[Sentry EU data region announcement](https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/)、[Sentry API regions](https://docs.sentry.io/api/)

## Cloud 与 self-hosted

不建议为了省订阅费直接 self-host。官方将 self-hosted 定位为低流量部署和 PoC；截至本次核对，最新 CalVer tag 为 `26.8.0`，完整功能 profile 的安装脚本硬性检查至少 4 CPU 和 14 GB 可分配给容器的内存（主机通常需约 16 GB），即使 errors-only profile 也至少需要 2 CPU/7 GB。还需维护 Postgres、ClickHouse、Kafka、Redis、Snuba、Relay、Symbolicator 等组件和持续升级。它更适合存在明确的数据落地或网络要求、且团队愿意承担平台运维时使用。

来源：[Sentry self-hosted repository](https://github.com/getsentry/self-hosted)、[Self-hosted system requirements](https://develop.sentry.dev/self-hosted/)

## 建议的最小上线顺序

1. 用 Developer 免费方案完成 4 个 project 的 PoC，只启用 production errors。
2. 注入 Git commit SHA release，并在 CI 上传 source maps；验证一次客户端、SSR、API、worker、Electron 和 Python 的受控异常。
3. 配置脱敏、environment、workspace 哈希 tag、错误过滤和告警。
4. 团队正式使用时升级 Team；保持 tracing/replay/logs 关闭或低采样，等错误链路稳定后再逐项启用。
