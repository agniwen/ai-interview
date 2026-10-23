# routes

按 URL 组织的 Hono 业务路由，每个能力是一个垂直切片：`route.ts` 是对外的路由入口，`schema.ts` 定义请求/响应契约，`application/` 放完整业务动作，`dao.ts` 或 `dao/` 放持久化，`routes/` 放真实的子资源，`tests/` 放测试。完整约定见 `docs/agents/server-architecture.md`。

## 顶层路由（挂在 `/api` 下）

| 目录                      | 路径                      | 说明                                                     |
| ------------------------- | ------------------------- | -------------------------------------------------------- |
| `agent/`                  | `/agent`                  | LiveKit 语音 Agent 回调：报告、checkpoint、实时转写      |
| `livekit/`                | `/livekit`                | LiveKit webhook（房间与录制事件）                        |
| `interview/`              | `/interview`              | 候选人 AI 面试入口                                       |
| `join/`                   | `/join`                   | 工作区邀请链接（预览与加入）                             |
| `public/`                 | `/public`                 | 无需登录的公开页面数据（邀请响应、评价复核等）           |
| `resume/`                 | `/resume`                 | 招聘智能体对话的模型列表与标题生成                       |
| `session/`                | `/session`                | 会话与当前用户                                           |
| `platform/`               | `/platform`               | 平台管理员                                               |
| `mcp/`                    | `/mcp`、`/mcp-access`     | MCP 招聘工具与授权管理                                   |
| `meeting-local-recovery/` | `/meeting-local-recovery` | Desktop 本地录音补传                                     |
| `meetings/`               | `/w/:slug/meetings`       | Echo 会议记录、转写、智能分析                            |
| `workspace/`              | `/w/:slug`                | 工作区聚合路由，挂载工作区鉴权和 Studio 等子路由         |
| `studio/`                 | `/w/:slug/studio`         | 招聘工作台：候选人、面试、岗位、表单、题库、Offer 审批等 |
| `chat/`                   | `/w/:slug/chat`           | 招聘智能体 对话                                          |

## 边界

- 路由只处理验证、读取上下文、调用 DAO 或 application、映射错误和状态码；不要把 Hono `Context` 传进 application 或 DAO。
- Worker 也会用到的流程不要放在路由目录里，放进 `@app/recruiting-workflows` 或其他共享包，路由从包里调用。
