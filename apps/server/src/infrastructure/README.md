# infrastructure

Server 进程自己的运行时适配：数据库连接池、Better Auth、MCP 鉴权、环境变量 schema、Sentry 初始化，以及语义索引的宿主绑定。

## 职责

- `db/`：Server 连接池（惰性创建），并通过 `setDefaultDatabase` 注册为本进程的共享包数据库。
- `auth.ts`、`auth-request-context.ts`、`session-auth-provider.ts`、`mcp-auth.ts`、`feishu-account-linking.ts`：认证与账号绑定。
- `env.ts`：Server 环境变量 schema，经 `./web/runtime` 提供给 Web 宿主校验。
- `sentry.ts`：初始化与上报 Sentry。
- `resume-semantic/`、`jd-semantic/`、`qdrant/`：把 `@app/resume-processing` 的语义索引工厂绑定到 Server 数据库和 Qdrant。
- `mail-ingest-crypto.ts`、`email-attachments.ts`：邮件导入密钥与附件处理。
- 简历解析、OCR、文档转换等实现都在 `@app/resume-processing`，Server 直接从包里 import，不再保留转发文件。

## 边界

- 本目录是包内私有实现，不对外导出。
- 不能 import Web 应用模块、TanStack Start 请求原语或浏览器代码；Server 必须能独立运行。
- 与宿主无关的工具放进对应的包（`@app/database`、`@app/feishu`、`@app/recruiting-workflows/runtime` 等），这里只保留进程级的连接与初始化。
