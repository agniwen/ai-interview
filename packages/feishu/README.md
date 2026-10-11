# @app/feishu

飞书开放平台客户端，供 Server 和 Worker 共用：两个飞书应用（`feishu`、`feishu-jiguang-hr`）的凭证与登录策略、tenant access token 缓存、云文档（docx）API，以及评价文档的 block 构造。

## 主要入口

- `./provider`：飞书应用 ID、凭证、登录 provider 与人工面试开关。
- `./access-token`：按应用缓存 tenant access token。
- `./docx`：创建、读取和更新飞书云文档。
- `./interview-evaluation-doc`、`./human-interview-evaluation-doc`：AI 面试 / 人工面试评价文档的 block 结构。

## 职责与边界

- 只封装飞书平台能力，不包含招聘业务流程，不读写数据库。
- 机器人（Chat SDK bot）、会议生命周期事件和招聘通知属于 `@app/recruiting-workflows`。
- 只从 `process.env` 读取飞书相关配置；环境变量的 schema 仍由 Server（`./web/runtime` 的 `createServerEnv`）和 Worker 各自维护。

## 如何修改

- 新增飞书 API 时放在对应能力文件里，并在 `package.json.exports` 中显式导出。
- 修改文档 block 结构时，同时检查 `@app/recruiting-workflows` 中写入文档的流程。

```bash
bun run --filter @app/feishu typecheck
bun run --filter @app/feishu test
```
