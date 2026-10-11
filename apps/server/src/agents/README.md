# agents

Server 使用的 AI Agent 与 Mastra 运行时：招聘 Copilot、对话存储、评分器，以及 Mastra workflow 注册。

## 职责

- `mastra/`：Mastra 实例、招聘 Copilot agent 与工具、workflow 注册（含批量简历上传 workflow）、评分器、存储和 request context。
- `provider.ts`、`chat-models.config.ts`：模型 provider 和聊天模型配置。
- 简历解析与评估的 agent 和 workflow 都在 `@app/resume-processing`，Server 直接从包里 import。

## 边界

- 可复用的简历解析和评估实现属于 `@app/resume-processing`；AI 面试报告 workflow 属于 `@app/recruiting-workflows/ai-interview-reports`。
- 新增 agent 或 workflow 时，只有确实依赖 Server 运行时（Copilot 会话、请求上下文）才放在这里，否则放进对应的共享包。
