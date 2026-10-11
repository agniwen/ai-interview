# @app/recruiting-workflows

Server（HTTP API）和 Worker（后台任务）共用的招聘业务流程，包括人工面试会议、录制与转写、AI 面试报告、面试通知、初面评估、Offer 审批通知和飞书机器人。

## 目录

| 目录                    | 内容                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `human-interviews/`     | 人工面试会议 DAO、邀请令牌、LiveKit 房间与轨道录制、实时转写对账、飞书日程同步            |
| `ai-interview-reports/` | AI 面试报告收件箱与恢复、证据快照、摘要/关键信息任务、飞书报告文档与通知、AI 轮次生命周期 |
| `notifications/`        | 面试通知事件、投递准备、模板、到场对账、评价就绪通知、邮件模板                            |
| `initial-interviews/`   | 初面评估生成、发布与恢复                                                                  |
| `offer-approvals/`      | Offer 审批数据访问与审批通知                                                              |
| `evaluation-documents/` | 每条招聘记录共享的飞书评价文档                                                            |
| `feishu-bot/`           | 飞书机器人：私聊/群聊路由、会议生命周期事件、卡片                                         |
| `runtime/`              | 流程内部用到的运行时工具（公开访问地址、Resend、Sentry 上报、环境变量读取）               |

## 职责与边界

- 数据库从 `@app/database/context` 获取，宿主进程负责注册：Server 在 `infrastructure/db` 中调用 `setDefaultDatabase`，Worker 在启动时调用 `registerWorkflowDatabase()`。本包不创建连接池。
- 不依赖 Hono、Better Auth 或任何 `apps/*`。HTTP 校验、鉴权和状态码映射留在 Server 的路由里。
- 招聘领域的数据模型、权限和配置 DAO 来自 `@app/recruiting`；飞书平台调用来自 `@app/feishu`；队列契约来自 queue 包。
- Sentry 由宿主初始化，本包只负责上报。

## 测试

- 单元测试放在各目录下的 `tests/`，用 `bun run --filter @app/recruiting-workflows test` 运行。
- 需要真实数据库的集成测试仍放在 Server（`apps/server/src/tests/recruiting-workflows/` 以及相关路由测试），复用 Server 的测试环境和数据库夹具。

```bash
bun run --filter @app/recruiting-workflows typecheck
bun run --filter @app/recruiting-workflows test
```
