# Mastra Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前项目中基于 AI SDK 的 agent、结构化生成、流式进度、工具调用、聊天运行时和批量简历处理逐步迁移到 Mastra，并最大化使用 Mastra 的 workflow、agent、tool、memory、approval、observability 和 eval 能力。

**Architecture:** Mastra 作为后端 agent/workflow 运行时，放在 `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/`。现有 Hono route 保持业务 API 边界，内部调用 Mastra agents/workflows；需要通用 Mastra HTTP/Studio endpoint 时，再通过 `@mastra/hono` 明确挂载到 `/api/mastra`，避免与现有 `/api` 路由冲突。前端从 AI SDK `UIMessage`/`useChat` 迁移到项目自有的 `ArcMessage` 与 `AiRunEvent` 协议。

**Tech Stack:** Mastra (`@mastra/core`, `@mastra/hono`, `@mastra/pg`, `@mastra/memory`, `@mastra/observability`, `@mastra/evals`), Hono, TanStack Start, React 19, Drizzle/PostgreSQL, Zod, Alibaba OpenAI-compatible provider (`ALIBABA_BASE_URL`) with Alibaba Coding Plan fallback, Qdrant, existing S3/OCR/resume utilities.

**Implementation snapshot (2026-07-01):**

1. Mastra runtime 已落地在 `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/`：包含 `models.ts`、`storage.ts`、`request-context.ts`、`index.ts`、`simple-generators.ts`、workflow adapter、scorers 和基础 workflow tests。
2. 非 chat 的主要 AI 生成入口已经通过 Mastra agent/helper 或 workflow runner 执行：标题、JD 生成、JD 匹配、表单题、面试题模板、简历解析结构化、简历评价、面试报告 summary/evaluation。
3. 前台等待型接口已统一为 SSE + `AiRunEvent`：`/api/interview/parse-resume`、`/generate-questions`、`/generate-review`、`/generate-review-markdown-stream`。前端通过 `readAiRunEventStream()` 消费；旧 `ndjson-stream.ts` 已删除。
4. `packages/shared/src/api-stream.ts` 现在只是 `AnalysisStreamEvent = AiRunEvent` 的兼容 alias，不再定义独立 legacy NDJSON event union。
5. 单份简历库上传已有 OCR 页进度、结构化字段预览、评价预览；OCR 页进度只在提取简历文本阶段展示，进入结构化后隐藏。简历库详情页“重新生成评价”使用 markdown-first 流式接口，先逐字回填评价 markdown，再生成结构化评分。
6. 后台任务按当前决策不强制走前台 stream：批量简历上传、简历广场/多份简历分析保持后台状态/日志语义，已有基础 `bulk-resume-upload-workflow` runner，但完整 processor step 化和 snapshot/resume 仍未完成。
7. chat 相关仍是最大未迁移区域：`@ai-sdk/react`、`useChat`、`DefaultChatTransport`、`UIMessage`、AI SDK tool/tool-loop 仍在前后端 chat runtime、resume chat agent 和消息 UI 中使用。
8. 后端 `agents/provider.ts` 仍保留 AI SDK `createOpenAICompatible` 兼容入口，待 chat/旧 agent 完成迁移后删除。

---

## 1. 迁移原则和成功标准

### 1.1 基本假设

1. 不以迁移成本和兼容性为主要约束；目标是迁移后体验最优、流程最清晰。
2. 保留现有业务 API 的 URL 和权限语义，优先把实现替换为 Mastra，而不是一次性强迫前端调用 Mastra 原生 endpoint。
3. 允许新增 Mastra runtime 表、snapshot 表、memory 表、observability/scorer 表；如果后续产品要求不新增表，再单独做 storage adapter 或复用旧表。
4. LiveKit Python voice agent 暂不直接迁到 Mastra；它仍负责实时语音面试。面试结束后的报告生成、评价、证据摘要可以迁移到 Mastra workflow。
5. 所有从 `ai` 包导入的 `UIMessage`、`ToolUIPart`、`FileUIPart`、`ChatStatus` 等类型都要最终替换为项目自有类型，避免共享包和数据库 schema 继续依赖 AI SDK。

### 1.2 成功标准

1. `pnpm list ai @ai-sdk/react @ai-sdk/openai-compatible --depth 0 -r` 不再显示运行时依赖；如果临时保留，只能出现在已标记待删除的兼容层。
2. `/api/resume/chat`、简历解析/评价/问题生成、JD 生成、表单题生成、面试报告生成全部由 Mastra agent/workflow 执行。
3. 前端等待过程不再只依赖文本流，而是展示统一的 `AiRunEvent`：步骤状态、工具状态、局部结构化结果、审批等待、可恢复状态、最终 artifact。
4. 批量简历上传具备 workflow snapshot/resume 能力：断线、取消、失败重试能从明确步骤恢复。
5. 关键 agent/workflow 都接入 observability trace；结构化输出和业务质量接入 scorer/evals。
6. 通过后端 typecheck、前端 typecheck、关键 Vitest、`pnpm check` 与 `git diff --check`。

### 1.3 非目标

1. 不重写 Better Auth、Hono route layout、Drizzle schema 组织方式。
2. 不把 LiveKit 实时会话迁移到 Node/Mastra。
3. 不在第一阶段更换 OCR、PDF rasterization、S3、Qdrant 的底层实现；这些能力先包装为 Mastra tools/workflow steps。

## 2. 当前 AI SDK 使用盘点

### 2.1 依赖和共享类型

| 编号  | 当前文件                                           | AI SDK 使用点                                                | 迁移目标                                                            |
| ----- | -------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| 2.1.1 | `apps/ai-recruitment-copilot/package.json`         | `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `ai`           | 移除前端 AI SDK runtime，改用 `ArcMessage`、`AiRunEvent`、fetch/SSE |
| 2.1.2 | `apps/ai-recruitment-copilot-backend/package.json` | `@ai-sdk/openai-compatible`, `ai`                            | 后端改用 Mastra core/provider/storage/evals                         |
| 2.1.3 | `packages/shared/package.json`                     | `ai` 类型依赖                                                | `packages/shared/src/ai-message.ts` 定义项目自有消息协议            |
| 2.1.4 | `packages/db-schema/package.json`                  | `ai` 类型依赖                                                | `@arc/db-schema` 不再引用 AI SDK 类型                               |
| 2.1.5 | `packages/db-schema/src/schema.ts`                 | `UIMessage` 用于 `chat_message.content` JSONB 和 `role` 类型 | `ArcMessage`/`ArcMessageRole` JSONB；提供一次性数据迁移             |
| 2.1.6 | `packages/shared/src/resume-pdf.ts`                | `UIMessage` 用于简历消息附件读取                             | 改为读取 `ArcMessagePart`/`ArcFilePart`                             |

### 2.2 后端 provider 和模型入口

| 编号  | 当前文件                                                                             | AI SDK 使用点                                  | 迁移目标                                                                                                                                                                                |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2.1 | `apps/ai-recruitment-copilot-backend/src/server/agents/provider.ts`                  | `createOpenAICompatible` 封装阿里兼容模型      | `agents/mastra/models.ts` 优先使用现有 `ALIBABA_BASE_URL` OpenAI-compatible provider；无 `ALIBABA_BASE_URL` 时 fallback 到 Mastra model router，例如 `alibaba-coding-plan/MiniMax-M2.5` |
| 2.2.2 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/routes/title/route.ts` | 局部 `createOpenAICompatible` + `generateText` | `TitleAgent.generate()` 或轻量 `createStep`                                                                                                                                             |

### 2.3 结构化生成和同步 LLM 调用

| 编号  | 当前文件                                                                                                                           | AI SDK 使用点                                                     | 迁移目标                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 2.3.1 | `apps/ai-recruitment-copilot-backend/src/lib/server/resume-parse-pipeline.ts`                                                      | `generateText` + `Output.object` 抽取简历结构                     | `resume-parse-workflow` 中的 `structureResumeStep`，使用 Mastra `structuredOutput.schema` |
| 2.3.2 | `apps/ai-recruitment-copilot-backend/src/server/agents/job-description-match-agent.ts`                                             | `generateText` + `Output.object` 岗位匹配                         | `JobDescriptionMatchAgent.generate(..., { structuredOutput })`                            |
| 2.3.3 | `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/ai-job-description-generate.ts`        | `generateObject` 生成 JD                                          | `JobDescriptionDraftAgent.generate(..., { structuredOutput })`                            |
| 2.3.4 | `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interview-questions/utils/ai-interview-questions-generate.ts` | `generateObject` 生成面试题模板                                   | `InterviewQuestionAgent.generate(..., { structuredOutput })`                              |
| 2.3.5 | `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/forms/utils/ai-form-questions-generate.ts`                    | `generateObject` 生成表单问题                                     | `FormQuestionAgent.generate(..., { structuredOutput })`                                   |
| 2.3.6 | `apps/ai-recruitment-copilot-backend/src/server/routes/agent/utils/interview-report.ts`                                            | `gateway`, `generateText`, `generateObject`, `Promise.allSettled` | `interview-report-workflow`，并行摘要和评价 steps                                         |
| 2.3.7 | `apps/ai-recruitment-copilot-backend/src/scripts/backfill-resume-profiles.ts`                                                      | 动态导入 `generateText`                                           | 复用 `resume-parse-workflow` 的 batch runner                                              |

### 2.4 当前手写 workflow/streaming

| 编号  | 当前文件                                                                                     | 当前能力                                                                       | 迁移目标                                                         |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 2.4.1 | `apps/ai-recruitment-copilot-backend/src/server/agents/resume-analysis-agent.ts`             | 已从手写 NDJSON 迁到 `createAiRunEventStream()` + Mastra workflow/agent facade | 继续收敛到 `resume-analysis-workflow` 编排 JD 匹配/评价/问题生成 |
| 2.4.2 | `apps/ai-recruitment-copilot/src/components/features/studio/use-resume-analysis-pipeline.ts` | 前端消费 `AnalysisStreamEvent` alias，也就是 `AiRunEvent`                      | 通用 `useAiRunStream()`，可消费所有 Mastra workflow/agent run    |
| 2.4.3 | `apps/ai-recruitment-copilot/src/components/features/studio/resume-analysis-overlay.tsx`     | 固定三段式简历处理 UI                                                          | 通用 `AiRunPanel` + 简历领域 view adapter                        |
| 2.4.4 | `packages/shared/src/api-stream.ts`                                                          | `AnalysisStreamEvent` 兼容 alias                                               | 删除旧命名，直接使用 `AiRunEvent`                                |

### 2.5 Resume chat agent

| 编号  | 当前文件                                                                              | AI SDK 使用点                                            | 迁移目标                                                                    |
| ----- | ------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| 2.5.1 | `apps/ai-recruitment-copilot-backend/src/server/agents/resume-agent.ts`               | `ToolLoopAgent`, `stepCountIs`, `Output.object`          | `RecruitingChatSupervisor` + domain subagents                               |
| 2.5.2 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/screening.ts`           | `UIMessage`, `convertToModelMessages`, `agent.stream()`  | `runRecruitingChat()` 调用 Mastra `Agent.stream()`                          |
| 2.5.3 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/utils/agent-tools.ts`   | `tool()` 定义服务端/客户端工具                           | `createTool()`；`applyJobDescription` 使用 `requireApproval` 或 `suspend()` |
| 2.5.4 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/routes/chat/route.ts`   | `toUIMessageStreamResponse`, `onEnd`, `originalMessages` | 输出 `AiRunEvent` 或项目自有 chat stream；保存 `ArcMessage`                 |
| 2.5.5 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/bake-parsed-resume.ts`  | 将解析好的简历塞进 `UIMessage`                           | 改为 `ArcMessage` 附件/上下文 artifact                                      |
| 2.5.6 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/inline-attachments.ts`  | `FileUIPart`, `UIMessage`                                | `ArcFilePart` + attachment processor                                        |
| 2.5.7 | `apps/ai-recruitment-copilot-backend/src/server/routes/resume/utils/agent-helpers.ts` | `ModelMessage`, `UIMessage`                              | Mastra message input adapter 或直接使用 Mastra memory thread                |

### 2.6 前端聊天运行时和消息 UI

| 编号  | 当前文件                                                                                     | AI SDK 使用点                                                          | 迁移目标                                                                                         |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 2.6.1 | `apps/ai-recruitment-copilot/src/components/features/chat/lib/chat-registry.ts`              | `Chat` from `@ai-sdk/react`，AI SDK 完成状态判断，断线部分持久化       | `ArcChatRuntime`，run registry 记录 `runId/threadId/status/partialMessage`                       |
| 2.6.2 | `apps/ai-recruitment-copilot/src/components/features/chat/lib/chat-transport.ts`             | `DefaultChatTransport`，自定义 regenerate body                         | `MastraChatTransport`，发送 `ArcMessage`、`threadId`、`resumeContext`、`regenerateFromMessageId` |
| 2.6.3 | `apps/ai-recruitment-copilot/src/components/features/chat/chat-workspace.tsx`                | `useChat`, `ChatStatus`, `FileUIPart`, `UIMessage`                     | `useArcChat()` + `useAiRunStream()`                                                              |
| 2.6.4 | `apps/ai-recruitment-copilot/src/components/features/studio/studio-resume-floating-chat.tsx` | `useChat`, `UIMessage`                                                 | 同一个 `ArcChatRuntime`，作为 resume route 的浮窗实例                                            |
| 2.6.5 | `apps/ai-recruitment-copilot/src/components/features/chat/*`                                 | `DynamicToolUIPart`, `ToolUIPart`, `isToolUIPart`, `isReasoningUIPart` | `ArcToolPart`、`ArcReasoningPart`、Mastra tool stream chunk adapter                              |
| 2.6.6 | `apps/ai-recruitment-copilot/src/components/ai-elements/*`                                   | `UIMessage`, `FileUIPart`, `SourceDocumentUIPart`, `ChatStatus`        | UI 组件接受项目自有 part types                                                                   |
| 2.6.7 | `apps/ai-recruitment-copilot/src/components/features/resume-import/resume-import-button.tsx` | `FileUIPart`                                                           | `ArcFilePart`                                                                                    |

### 2.7 聊天持久化 API

| 编号  | 当前文件                                                                                   | AI SDK 使用点                | 迁移目标                                                     |
| ----- | ------------------------------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------ |
| 2.7.1 | `apps/ai-recruitment-copilot-backend/src/server/routes/chat/dao/chat.ts`                   | `UIMessage` JSON             | `ArcMessage` JSON；可附加 Mastra `threadId/resourceId/runId` |
| 2.7.2 | `apps/ai-recruitment-copilot-backend/src/server/routes/chat/routes/conversations/route.ts` | `UIMessage` request/response | `ArcMessage` DTO                                             |
| 2.7.3 | `apps/ai-recruitment-copilot/src/lib/client/api/endpoints/chat.ts`                         | `UIMessage` type             | `ArcMessage` type                                            |

### 2.8 批量简历上传处理

| 编号  | 当前文件                                                                                                       | 当前能力                                                       | 迁移目标                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 2.8.1 | `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-upload-batches/utils/processor.ts` | 手写长流程：解析、去重、匹配、评价、入库、索引、取消检查、日志 | `bulk-resume-upload-workflow`，每份简历作为 child workflow 或 `foreach` item，支持 snapshot/resume/retry |
| 2.8.2 | `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-upload-batches/*`                  | 轮询 batch 状态和 step log                                     | 映射 Mastra workflow run state 到现有 batch status UI，后续可展示 run graph                              |

## 3. 官方 Mastra 能力引用和落地方式

### 3.1 Hono adapter

官方 Hono guide 说明：使用 Hono server adapter 可以把 Mastra agents 暴露为 HTTP endpoints，不需要自己写 routing，也不需要单独跑 Mastra server；`MastraServer` 绑定已有 Hono `app` 和根 `mastra` 实例，`init()` 注册 middleware 和 endpoints。参考：

1. [Integrate Mastra in your Hono project](https://mastra.ai/guides/getting-started/hono)
2. [Hono adapter reference](https://mastra.ai/reference/server/hono-adapter)

当前项目已经有 `createServerApp()` 和 TanStack Start 挂载 `/api` 的边界，因此不要直接把 Mastra 默认路由塞进根 app。推荐：

1. 第一阶段只把 Mastra 当内部 runtime，不暴露通用 endpoint。
2. 需要 Studio/debug endpoint 时，新增 `apps/ai-recruitment-copilot-backend/src/server/routes/mastra/route.ts`，用 `@mastra/hono` 创建子 router，并显式挂到 `/api/mastra`。
3. 如果使用 `MastraServer` 的 `prefix`，必须在本地用 curl 验证最终路径，避免出现 `/api/api/...` 或 `/api/mastra/mastra/...`。
4. 当前后端 app factory 是同步形态；`server.init()` 是 async。实施时要么让 Mastra 子 router 使用 top-level await 初始化一次，要么把 `createServerApp()`/adapter 调整为 async，并同时更新 web mount 和 standalone entrypoint。

### 3.2 Workflows

Mastra workflows 用 `createStep` 定义输入/输出 schema 和业务逻辑，用 `createWorkflow` 编排 steps；官方文档强调 workflows 适合明确、多步骤、顺序受控的任务，并支持 suspension、resumption、streaming results。参考：

1. [Workflows overview](https://mastra.ai/docs/workflows/overview)
2. [Control flow](https://mastra.ai/docs/workflows/control-flow)
3. [Workflow state](https://mastra.ai/docs/workflows/workflow-state)
4. [Agents & Tools in Workflows](https://mastra.ai/docs/workflows/agents-and-tools)

当前最适合改成 workflow 的模块：

1. 简历解析：上传文件、hash、OCR、结构化抽取、缓存、入库。
2. 简历评价：硬性条件筛选、定性评价流式输出、评分结构化输出。
3. 面试问题生成：依赖简历结构、岗位描述、评价结果。
4. 批量上传：每份简历的 child workflow + batch aggregate workflow。
5. 面试报告：摘要和评价并行生成，最终合并。

### 3.3 Suspend/resume 与 snapshots

官方 suspend/resume 文档说明 workflow 可以在任意 step 暂停，保存 snapshot，之后按 step ID 和 `resumeData` 恢复；snapshots 存在配置的 storage provider 中，可跨部署和应用重启。参考：

1. [Suspend & Resume](https://mastra.ai/docs/workflows/suspend-and-resume)
2. [Snapshots](https://mastra.ai/docs/workflows/snapshots)

当前可直接增强体验：

1. 批量简历上传失败后，从失败简历或失败 step 恢复，而不是重新跑整批。
2. 费用较高或风险较高的操作，如批量发邮件、批量生成面试问题，先 suspend 等待用户确认。
3. 前端断线后用 `runId` 重新接入 stream，恢复当前 workflow 状态和最近 preview。

### 3.4 Structured output

Mastra structured output 让 agent 返回匹配 schema 的 object；支持 Zod/JSON Schema，并且流式输出时最终 object 可在 stream 完成后获得。官方还说明当模型不支持同时使用 tools 和 structured output 时，可以使用 `jsonPromptInjection`、单独的 structuring model 或 `prepareStep` 拆分工具调用与结构化输出。参考：

1. [Structured output](https://mastra.ai/docs/agents/structured-output)
2. [Agent.generate reference](https://mastra.ai/reference/agents/generate)

当前要替换的 AI SDK `Output.object`/`generateObject` 全部优先迁到 `structuredOutput.schema`。对简历解析、JD 匹配这类高风险结构化结果，不建议使用 fallback 静默吞错；应该默认 strict，并把 schema validation error 转成 `AiRunEvent` 的 `run.failed` 或 `step.failed`。

### 3.5 Tools 和 UI transform

Mastra tools 用 `createTool` 定义 `id`、`description`、`inputSchema`、`outputSchema`、`execute`。官方 tools 文档还提供两个关键能力：

1. `toModelOutput`：工具返回完整结构化数据给应用，但只把精简表示送回模型上下文。
2. `transform`：为 display/transcript 目标输出更小、更安全的 UI payload。

参考：

1. [Tools](https://mastra.ai/docs/agents/using-tools)
2. [createTool reference](https://mastra.ai/reference/tools/create-tool)

当前最有价值的应用点：

1. `listUploadedResumesTool` 对模型只返回候选摘要和关键 ID，对 UI 返回完整候选列表卡片。
2. `suggestJobDescriptionTool` 对模型返回 JD 摘要，对 UI 返回可预览/可应用的 JD 卡片。
3. `applyJobDescriptionTool` 不再是 AI SDK client tool approval，而是 Mastra `requireApproval` 或 `suspend()`。
4. 工具 stream 中的 `toolName` 由 tools object key 决定；要使用稳定 key，例如 `tools: { applyJobDescription: applyJobDescriptionTool }`，否则前端卡片匹配会不稳定。

### 3.6 Agent approval

Mastra agent approval 支持在工具执行前暂停，等待用户 approve/decline；也支持工具执行中通过 `suspend()` 请求更多上下文。官方说明 approval 使用 snapshots，因此必须配置 storage provider，否则会出现 snapshot 找不到。参考：

1. [Agent approval](https://mastra.ai/docs/agents/agent-approval)
2. [Human-in-the-loop workflows](https://mastra.ai/docs/workflows/human-in-the-loop)

当前应使用 approval 的操作：

1. 应用 JD 到当前简历会话。
2. 发送候选人邮件、轮次邮件。
3. 批量生成/覆盖面试问题。
4. 任何删除、覆盖、批量入库操作。

### 3.7 Supervisor agents

Mastra supervisor agents 可协调多个 subagents，并根据 subagent 的 `description` 决定委派；支持 delegation hooks、message filtering 和 result synthesis。参考：

1. [Supervisor agents](https://mastra.ai/docs/agents/supervisor-agents)
2. [Multi-agent systems](https://mastra.ai/guides/concepts/multi-agent-systems)

当前 `resume-agent.ts` 是一个大而全的 ToolLoopAgent。最佳迁移不是一比一复刻，而是拆成：

1. `RecruitingChatSupervisor`：统一对话入口，决定调用哪个专长 agent/workflow。
2. `ResumeContextAgent`：理解已上传/已解析简历，维护候选上下文。
3. `JobDescriptionAgent`：生成、解释、匹配 JD。
4. `ResumeReviewAgent`：生成评价和评分。
5. `InterviewQuestionAgent`：生成面试题。

### 3.8 Memory

Mastra memory 支持 message history、observational memory、working memory、semantic recall 和 multi-user threads。官方 memory 文档说明 `resource` 是稳定用户/实体标识，`thread` 隔离具体会话；thread owner 不能被改变。参考：

1. [Memory overview](https://mastra.ai/docs/memory/overview)
2. [Message history](https://mastra.ai/docs/memory/message-history)
3. [Semantic recall](https://mastra.ai/docs/memory/semantic-recall)

当前建议：

1. `resource`: `workspace:${workspaceId}:user:${userId}`。
2. `thread`: `conversation:${conversationId}` 或 `resume:${resumeRecordId}:conversation:${conversationId}`。
3. 只在正式聊天 agent 开启 memory；单次结构化生成不要开启 memory。
4. 长会话开启 observational memory，避免把所有历史原文塞进模型上下文。
5. 简历 PDF 或大附件不要直接持久化到 Mastra memory；保留在 S3/现有附件表，memory 中只保存 URL、hash、parsed profile ID、resume record ID。

### 3.9 Storage

Mastra memory storage 文档列出 PostgreSQL 为支持的 storage provider，并给出 `PostgresStore` from `@mastra/pg` 的示例；storage 会被 memory、workflows、observability、scores 共享。参考：

1. [Memory storage](https://mastra.ai/docs/memory/storage)
2. [PostgreSQL storage reference](https://mastra.ai/reference/storage/postgresql)

当前项目已有 PostgreSQL，因此推荐：

1. 开发/测试直接使用 `@mastra/pg` 指向 `DATABASE_URL`。
2. production 可考虑 composite storage：workflow/memory 走 PostgreSQL，observability 高吞吐数据后续接 ClickHouse 或平台。
3. 所有 Mastra 表加独立前缀或 schema，避免和 Drizzle 业务表混在一起。

### 3.10 Observability

Mastra observability 提供 agent run、workflow step、tool call、model interaction 的 traces/logs/metrics；trace 是层级 timeline，会捕获输入、输出、token usage 和耗时。参考：

1. [Observability overview](https://mastra.ai/docs/observability/overview)
2. [Tracing overview](https://mastra.ai/docs/observability/tracing/overview)
3. [Metrics overview](https://mastra.ai/docs/observability/metrics/overview)

当前要接入：

1. 每个 route request 注入 `workspaceId`、`userId`、`resumeRecordId`、`conversationId` 到 request context。
2. 所有 traces 开启 sensitive data filter；简历原文、手机号、邮箱、身份证、API key 必须脱敏。
3. 前端 `AiRunPanel` 可展示当前 run 的 `traceId`，便于排查。

### 3.11 Evals/scorers

Mastra scorers 可以用模型、规则或统计方法评价非确定性 AI 输出，并支持 live evaluation 和 workflow step scorers；官方文档说明结果会自动存储到 `mastra_scorers`。参考：

1. [Scorers overview](https://mastra.ai/docs/evals/overview)
2. [Built-in scorers](https://mastra.ai/docs/evals/built-in-scorers)
3. [Quick checks](https://mastra.ai/docs/evals/quick-checks)

当前建议的 scorer：

1. `resumeProfileCompletenessScorer`：结构化简历字段完整度。
2. `jdMatchEvidenceScorer`：岗位匹配结论是否有证据。
3. `interviewQuestionCoverageScorer`：题目是否覆盖岗位关键能力。
4. `reportEvidenceGroundingScorer`：面试报告是否引用 transcript evidence。
5. `chatToolUsageScorer`：招聘 chat 是否在需要时调用工具，而不是凭空回答。

### 3.12 Alibaba Coding Plan provider

Mastra Alibaba Coding Plan provider 通过 model router 暴露模型，使用 `ALIBABA_CODING_PLAN_API_KEY` 环境变量；官方说明它使用 OpenAI-compatible `/chat/completions` endpoint，部分 provider-specific feature 可能不可用。参考：

1. [Alibaba Coding Plan provider](https://mastra.ai/models/providers/alibaba-coding-plan)

当前项目实现：

1. `agents/mastra/models.ts` 优先读取现有 `ALIBABA_BASE_URL`，返回 Mastra 支持的 OpenAI-compatible model config：`{ providerId: "alibaba", modelId, url, apiKey }`。
2. `ALIBABA_BASE_URL` 模式下优先读取 `ALIBABA_API_KEY`，兼容 fallback 到 `ALIBABA_CODING_PLAN_API_KEY`。
3. 未配置 `ALIBABA_BASE_URL` 时，才使用 `alibaba-coding-plan/...` model router 和 `ALIBABA_CODING_PLAN_API_KEY`。

注意事项：

1. 当前 provider 页面列出的部分模型 tools 支持列为空；迁移 chat/tool agent 前必须用真实模型跑工具调用 smoke test。
2. 对结构化输出必须验证目标模型是否支持 `response_format`。不支持时按官方建议使用 `jsonPromptInjection`、单独 structuring model 或 `prepareStep`。
3. 如果 `alibaba-coding-plan/qwen3.7-plus` 的工具/结构化能力不稳定，保留一组 fallback model route，例如 tool agent 使用 tool-support 更强的模型，纯结构化抽取使用长上下文模型。

## 4. 目标目录结构

### 4.1 后端 Mastra runtime

按照仓库规则，不新增 top-level `server/services` 或 `server/queries`。Mastra 作为共享 agent runtime 放在已允许的 `server/agents` 下：

```text
apps/ai-recruitment-copilot-backend/src/server/agents/mastra/
  index.ts
  models.ts
  storage.ts
  request-context.ts
  events.ts
  agents/
    recruiting-chat-supervisor.ts
    resume-context-agent.ts
    resume-structured-agent.ts
    resume-review-agent.ts
    job-description-agent.ts
    interview-question-agent.ts
    form-question-agent.ts
    interview-report-agent.ts
  tools/
    resume-tools.ts
    job-description-tools.ts
    conversation-tools.ts
    studio-record-tools.ts
  workflows/
    resume-parse-workflow.ts
    resume-review-workflow.ts
    resume-analysis-workflow.ts
    bulk-resume-upload-workflow.ts
    interview-report-workflow.ts
  scorers/
    resume-profile-completeness-scorer.ts
    jd-match-evidence-scorer.ts
    report-grounding-scorer.ts
  adapters/
    ai-run-stream.ts
    arc-message-adapter.ts
```

### 4.2 共享协议

```text
packages/shared/src/ai-message.ts
packages/shared/src/ai-run-events.ts
packages/shared/src/ai-artifacts.ts
packages/shared/src/ai-tools.ts
```

### 4.3 前端 runtime 和 UI

```text
apps/ai-recruitment-copilot/src/components/features/ai-runs/
  ai-run-panel.tsx
  ai-run-step-list.tsx
  ai-run-tool-card.tsx
  ai-run-approval-card.tsx
  ai-run-preview.tsx

apps/ai-recruitment-copilot/src/components/features/chat/lib/
  arc-chat-runtime.ts
  mastra-chat-transport.ts
  ai-run-registry.ts
  arc-message-utils.ts

apps/ai-recruitment-copilot/src/hooks/
  use-ai-run-stream.ts
  use-arc-chat.ts
```

### 4.4 可选 Mastra HTTP endpoint

```text
apps/ai-recruitment-copilot-backend/src/server/routes/mastra/
  route.ts
```

该 route 只负责挂载 Mastra Hono adapter，不承载业务 API。业务功能仍从现有 route 进入，便于权限、审计和前端调用保持一致。

## 5. 项目自有事件协议

### 5.1 `AiRunEvent`

新增 `packages/shared/src/ai-run-events.ts`：

```ts
export type AiRunEvent =
  | { type: "run.started"; runId: string; workflowId?: string; agentId?: string; title: string }
  | { type: "run.heartbeat"; runId: string; at: string }
  | { type: "step.started"; runId: string; stepId: string; label: string }
  | { type: "step.progress"; runId: string; stepId: string; label?: string; progress?: number }
  | { type: "step.delta"; runId: string; stepId: string; text: string }
  | { type: "step.preview"; runId: string; stepId: string; artifactType: string; data: unknown }
  | {
      type: "tool.started";
      runId: string;
      toolCallId: string;
      toolName: string;
      label: string;
      input?: unknown;
    }
  | {
      type: "tool.completed";
      runId: string;
      toolCallId: string;
      toolName: string;
      output?: unknown;
    }
  | {
      type: "approval.required";
      runId: string;
      toolCallId?: string;
      stepId?: string;
      payload: unknown;
    }
  | { type: "run.suspended"; runId: string; suspended: string[]; payload?: unknown }
  | { type: "run.resumed"; runId: string; stepId?: string }
  | {
      type: "artifact.created";
      runId: string;
      artifactType: string;
      artifactId?: string;
      data: unknown;
    }
  | { type: "scorer.completed"; runId: string; scorerId: string; score: number; reason?: string }
  | { type: "step.completed"; runId: string; stepId: string; output?: unknown }
  | { type: "run.completed"; runId: string; output?: unknown }
  | {
      type: "run.failed";
      runId: string;
      error: { message: string; code?: string; detail?: unknown };
    };
```

### 5.2 映射原则

1. Mastra workflow stream chunk 只在后端 adapter 中解析，前端不直接依赖 Mastra 内部 chunk shape。
2. 所有 UI 只消费 `AiRunEvent`，这样 resume analysis、chat、batch、report 使用同一套等待/进度组件。
3. 现有 `AnalysisStreamEvent` 已收敛为 `AiRunEvent` 的类型 alias；后续删除别名和旧命名即可。
4. 所有 event 都带 `runId`；可选带 `traceId`，用于 observability 跳转。
5. 大对象不要频繁通过 `step.preview` 全量推送；简历解析字段可以 patch 化，比如只推送 changed fields。

### 5.3 用户体验增强

1. 简历上传等待时显示可视 workflow：上传/读取、OCR、结构化抽取、岗位匹配、评价、问题生成。
2. 每个工具调用显示独立卡片：开始、参数摘要、完成结果、失败原因。
3. 需要审批时显示明确的 approval card，并保留 run 状态；用户批准后从原 step 恢复。
4. 断线重连后前端用 `runId` 拉取 workflow state，重建进度面板。
5. 结构化结果早到早显示：姓名、学校、年限、技能、JD 匹配分、评价摘要都可以在最终完成前逐步出现。

## 6. 实施步骤

### 6.1 Phase 0：基线和依赖核对

- [x] 运行依赖盘点：

  ```bash
  pnpm list ai @ai-sdk/react @ai-sdk/openai-compatible --depth 0 -r
  rg -n "from \"ai\"|from 'ai'|@ai-sdk/react|@ai-sdk/openai-compatible|ToolLoopAgent|DefaultChatTransport|useChat\\(|generateObject|generateText|Output\\.object|tool\\(" apps packages
  ```

- [x] 记录当前关键路由行为：
  - `/api/resume/chat`
  - `/api/resume/title`
  - Studio 简历解析/评价/问题生成 routes
  - Studio JD/表单/面试题生成 routes
  - `/api/agent/...` 面试报告 route
  - 批量上传 batch routes
- [x] 建立 migration branch，例如 `codex/mastra-migration-runtime`。（当前分支：`mastra`）
- [x] 新增一组 goldens/fixtures：
  - 一份中文简历 PDF 或解析后的 OCR 文本。
  - 一个 JD。
  - 一段面试 transcript。
  - 一个已有 chat conversation。
- [x] 验证命令：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  pnpm --filter @arc/ai-recruitment-copilot typecheck
  ```

### 6.2 Phase 1：安装 Mastra 并建立 runtime 骨架

- [x] 在后端包安装 Mastra runtime：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend add @mastra/core@latest @mastra/hono@latest @mastra/pg@latest @mastra/memory@latest @mastra/observability@latest @mastra/evals@latest
  ```

- [x] 新增 `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/models.ts`：
  - 定义 `DEFAULT_CHAT_MODEL = "alibaba-coding-plan/MiniMax-M2.5"`。
  - 定义 `LONG_CONTEXT_MODEL`、`STRUCTURED_MODEL`、`SCORER_MODEL`。
  - 从 `ALIBABA_CODING_PLAN_API_KEY` 读取 key；保留从现有 env 映射的临时兼容逻辑只限迁移期。
  - 已接入现有 `ALIBABA_BASE_URL`，优先生成 OpenAI-compatible model config；无 `ALIBABA_BASE_URL` 时 fallback 到 Coding Plan model router。
- [x] 新增 `storage.ts`：
  - 使用 `PostgresStore` from `@mastra/pg`。
  - `DATABASE_URL` 复用后端现有 env。
  - 为 production 加注释：observability 后续可迁到 ClickHouse 或 Mastra platform。
- [x] 新增 `index.ts`：

  ```ts
  import { Mastra } from "@mastra/core";
  import { storage } from "./storage";

  export const mastra = new Mastra({
    storage,
    agents: recruitmentAgents,
    workflows: recruitmentWorkflows,
    scorers: recruitmentScorers,
  });
  ```

- [x] 新增 `request-context.ts`：
  - 从 Hono context/route 参数提取 `workspaceId`、`workspaceSlug`、`userId`、`conversationId`、`resumeRecordId`。
  - 提供 `toMastraRequestContext()`，所有 route 调用 Mastra 时统一传入。
- [x] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  git diff --check
  ```

注意事项：

1. 不要在 `apps/ai-recruitment-copilot-backend/src/server/app.ts` 加业务 middleware；遵守现有 route layout。
2. 如果初始化 Hono adapter，需要处理 async init；不要让 TanStack Start mount 和 standalone server 行为分叉。
3. `@mastra/hono` 官方 reference 支持 `prefix`，必须显式配置并通过 curl 验证最终路径。

### 6.3 Phase 2：定义 `ArcMessage`，切断共享包对 AI SDK 类型的依赖

- [x] 新增 `packages/shared/src/ai-message.ts`：

  ```ts
  export type ArcMessageRole = "system" | "user" | "assistant" | "tool";

  export type ArcTextPart = { type: "text"; text: string };
  export type ArcFilePart = {
    type: "file";
    mediaType: string;
    name?: string;
    url?: string;
    data?: string;
    hash?: string;
  };
  export type ArcToolPart = {
    type: "tool";
    toolCallId: string;
    toolName: string;
    state: "input-streaming" | "input-available" | "output-available" | "error";
    input?: unknown;
    output?: unknown;
    errorText?: string;
  };
  export type ArcReasoningPart = { type: "reasoning"; text: string };
  export type ArcSourcePart = { type: "source"; title?: string; url?: string; metadata?: unknown };
  export type ArcMessagePart =
    | ArcTextPart
    | ArcFilePart
    | ArcToolPart
    | ArcReasoningPart
    | ArcSourcePart;

  export type ArcMessage = {
    id: string;
    role: ArcMessageRole;
    parts: ArcMessagePart[];
    createdAt?: string;
    metadata?: Record<string, unknown>;
  };
  ```

- [x] 修改 `packages/db-schema/src/schema.ts`：
  - `chat_message.content` 从 `UIMessage` 改为 `ArcMessage`。
  - `role` 从 `UIMessage["role"]` 改为 `ArcMessageRole`。
- [x] 修改 `packages/shared/src/resume-pdf.ts`：
  - 从 `ArcMessage` 中读取 PDF/file parts。
- [x] 新增兼容转换器 `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/adapters/arc-message-adapter.ts`：
  - `arcMessageToMastraInput()`
  - `mastraStreamToArcMessageParts()`
  - `legacyUiMessageToArcMessage()`，仅用于数据迁移和临时读取。
- [x] 数据迁移：
  - 写 Drizzle migration，把旧 `UIMessage` JSON 结构转换成 `ArcMessage`。
  - 如果旧消息内容多样，先写只读兼容 parser，迁移脚本 dry-run 输出无法转换的 message IDs。
- [x] 验证：

  ```bash
  pnpm --filter @arc/shared typecheck
  pnpm --filter @arc/db-schema typecheck
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- routes/resume
  ```

注意事项：

1. 不要让 `packages/shared` 引入 `node:*`、server secret 或 Mastra runtime。
2. DB JSONB 内容可保留旧字段一段时间，但 TypeScript surface 要尽快从 AI SDK 类型移除。
3. 附件大内容不要进入 Mastra memory；转换器应把大文件变成 URL/hash/profile ID。

### 6.4 Phase 3：迁移 provider 和简单 text/structured 调用

- [ ] 替换 `apps/ai-recruitment-copilot-backend/src/server/agents/provider.ts`：
  - 改为导出 Mastra model IDs 和选择函数。
  - 删除 `createOpenAICompatible`。
- [x] `agents/mastra/models.ts` 兼容现有 Alibaba provider 配置：
  - 有 `ALIBABA_BASE_URL` 时使用 `{ providerId: "alibaba", modelId, url, apiKey }`。
  - `ALIBABA_BASE_URL` 模式优先 `ALIBABA_API_KEY`，保留 `ALIBABA_CODING_PLAN_API_KEY` fallback。
  - 同步 `/api/resume/title` 的 API key 检查，避免误报只缺 `ALIBABA_CODING_PLAN_API_KEY`。
- [x] 迁移 `/api/resume/title`：
  - 新增 `TitleAgent` 或 `generateTitleStep`。
  - route 调用 `agent.generate(prompt)`。
- [x] 迁移 JD 生成：
  - `ai-job-description-generate.ts` 改为调用 `JobDescriptionDraftAgent.generate(..., { structuredOutput: { schema } })`。
- [x] 迁移面试题生成：
  - `ai-interview-questions-generate.ts` 改为 `InterviewQuestionAgent.generate(..., { structuredOutput })`。
- [x] 迁移表单问题生成：
  - `ai-form-questions-generate.ts` 改为 `FormQuestionAgent.generate(..., { structuredOutput })`。
- [x] 每个迁移点保留原有 Zod schema 作为 `structuredOutput.schema`，不要重新发明 DTO。
- [x] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- studio
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. 如果 Alibaba 目标模型不支持 response_format，按 Mastra 文档使用 `jsonPromptInjection` 或单独 `structuredOutput.model`。
2. 结构化生成不要用宽松 `fallback` 掩盖质量问题；失败应返回可观测错误。
3. 对 `temperature`、`maxRetries`、timeout 统一在 agent 默认配置里管理。

### 6.5 Phase 4：迁移简历解析 workflow

- [x] 新增 `resume-parse-workflow.ts` 基础 bytes workflow，steps：
  1. `hash-resume`：计算 file hash。
  2. `extract-resume-text`：复用现有 PDF/OCR/Office 文档文本抽取。
  3. `structure-resume`：调用 `ResumeStructuredAgent.generate(..., { structuredOutput })`。
  4. `compose-resume-parse-result`：产出结构化结果和前端 preview。
- [ ] 扩展 `resume-parse-workflow.ts` 为持久化 workflow：
  1. `loadResumeFileStep`：读取 S3/local upload metadata。
  2. `cacheLookupStep`：按 file hash 查缓存。
  3. `persistResumeProfileStep`：写入现有 profile/cache 表。
- [x] 新增 `resume-analysis-workflow.ts` 的基础 parse/question steps，并注册到 Mastra。
- [ ] 使用 workflow state 存：
  - `progress`
  - `fileHash`
  - `ocrTextPreview`
  - `partialProfile`
  - `cacheHit`
- [x] `structureResumeStep` 产出 `step.preview`，让前端能先显示姓名、学校、经历、技能。
- [x] `parseResumeBytesToProfile()` 和 `streamParseResumeProfile()` 改为 workflow facade：
  - 保留函数名，内部调用 workflow，降低 route/worker 改动面。
- [x] 迁移 tests：
  - 原 `resume-parse-pipeline.test.ts` 不再 mock `generateText`，改 mock `ResumeStructuredAgent` 或 workflow step。
- [x] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- resume-parse-pipeline
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. OCR 和结构化抽取是两个明确 steps，不要合成一个 prompt。
2. 简历原文属于敏感数据，observability 默认只记录 hash、长度、字段摘要，不记录全文。
3. workflow output schema 必须匹配最后 step output；并行/映射时遵守 Mastra control flow schema 约束。

### 6.6 Phase 5：迁移 JD 匹配和简历评价 workflow

- [x] 新增 `resume-review-workflow.ts`：
  1. `prepareReviewContextStep`：加载简历 profile、JD、岗位硬性条件。
  2. `hardFilterStep`：`ResumeReviewAgent` 结构化输出硬性条件结果。
  3. `qualitativeReviewStep`：流式生成评价正文，发送 `step.delta`。
  4. `scoringStep`：结构化输出评分。
  5. `composeReviewStep`：合并定性评价、硬性条件、评分。
- [x] 迁移 `resume-analysis-agent.ts` 里的：
  - hard filter output schema。
  - qualitative review prompt。
  - scoring output schema。
  - `streamGenerateResumeReview()` 和 `generateResumeReview()`。
- [x] `streamGenerateResumeReview()` 保留导出，并镜像输出 `AiRunEvent`。
- [x] `generateResumeReview()` 保留导出但调用 workflow blocking run，用于 bulk processor。
- [x] 新增详情页专用 markdown-first 评价流：
  - `/api/interview/generate-review-markdown-stream`
  - 先通过 `resumeReviewMarkdownAgent` 流式生成 markdown 并逐字回填编辑器。
  - 再把 markdown 传给结构化评价和评分步骤，生成 `structuredReview`。
- [x] 给关键 AI 输出注册 scorer：
  - 字段完整度。
  - 分数范围约束。
  - 证据引用。
- [x] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- resume-analysis-agent
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. 定性评价需要流式体验，保留 text delta；评分可以 blocking。
2. 不要在模型输出里让前端解析 markdown 找字段；关键字段都要在 workflow output object 中。
3. JD 匹配和评价共享上下文，但不要共享 mutable global state。

### 6.7 Phase 6：迁移完整简历分析 stream 到 `AiRunEvent`

- [x] 新增 `resume-analysis-workflow.ts` 基础编排：
  1. `parse-resume-profile`
  2. `generate-interview-questions`
- [x] `analyzeResumeFile()` 改为调用 `runResumeAnalysisWorkflow()` blocking runner，用于创建/编辑面试的现场解析兜底路径。
- [ ] 扩展 `resume-analysis-workflow.ts`，编排：
  1. `resume-parse-workflow`
  2. `job-description-match-step`
  3. `resume-review-workflow`
  4. optional `interview-question-step`
- [x] 新增 `adapters/ai-run-stream.ts`：
  - 把 Mastra workflow stream chunk 转成 `AiRunEvent`。
  - 统一 heartbeat。
  - 捕获 error 并转 `run.failed`。
  - 原生 `workflow-start` / `workflow-step-start` / `workflow-step-progress` / `workflow-step-result` / `workflow-finish` 已有稳定 adapter 测试。
- [x] 修改 `packages/shared/src/api-stream.ts`：
  - 标记 legacy。
  - re-export `AiRunEvent` 或提供临时 union。
- [x] 修改后端解析 / 出题 / 评价流：
  - `/api/interview/parse-resume`
  - `/api/interview/generate-questions`
  - `/api/interview/generate-review`
  - `/api/interview/generate-review-markdown-stream`
  - 统一返回 `text/event-stream`，事件为 `run.started` / `step.*` / `run.completed` / `run.failed`。
- [x] 修改 `apps/ai-recruitment-copilot/src/components/features/studio/use-resume-analysis-pipeline.ts`：
  - 通过 `readAiRunEventStream()` 消费 SSE。
  - `AnalysisStreamEvent` 只是 `AiRunEvent` alias。
- [x] 删除前端旧 NDJSON reader：
  - `apps/ai-recruitment-copilot/src/lib/client/ndjson-stream.ts`
- [x] 修改 `resume-analysis-overlay.tsx` 的领域化进度区域：
  - OCR 页进度只在提取简历文本阶段显示。
  - 进入结构化字段提取后隐藏 OCR 页进度。
  - 结构化阶段显示 partial fields。
  - 评价阶段显示 review preview。
- [ ] 新增通用 `AiRunPanel`：
  - 统一渲染 workflow step/tool/approval/scorer。
  - 当前简历上传仍是领域化 overlay，不是通用面板。
- [ ] 删除 `AnalysisStreamEvent` alias 和相关旧命名：
  - 生产事件已是 `AiRunEvent`，但类型名还保留兼容。
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot test -- resume-analysis
  pnpm --filter @arc/ai-recruitment-copilot typecheck
  ```

注意事项：

1. UI 不要依赖 Mastra 内部 chunk type；后端 adapter 是唯一转换点。
2. 前端断线重连要有 `runId`；route 可以提供 `GET /api/.../runs/:runId` 查询当前状态。
3. 保留取消按钮时，要把取消映射到 workflow cancel/abort，并持久化业务 batch 状态。

### 6.8 Phase 7：迁移 resume chat 到 Mastra supervisor agent

- [ ] 新增 subagents：
  - `ResumeContextAgent`
  - `JobDescriptionAgent`
  - `ResumeReviewAgent`
  - `InterviewQuestionAgent`
- [ ] 新增 `RecruitingChatSupervisor`：
  - `agents: { resumeContextAgent, jobDescriptionAgent, resumeReviewAgent, interviewQuestionAgent }`
  - instructions 使用当前中文招聘场景规则。
  - `memory: new Memory({ options: { lastMessages, observationalMemory } })`
  - `delegation.messageFilter`：只传必要历史和 resume/JD artifact 摘要。
- [ ] 迁移 tools：
  - `getServerTimeTool` -> `createTool`
  - `getResumeReviewFrameworkTool` -> `createTool`
  - `listUploadedResumesTool` -> `createTool` + `transform`
  - `suggestJobDescriptionTool` -> `createTool` + `toModelOutput`
  - `applyJobDescriptionTool` -> `createTool` + `requireApproval` 或 `suspend()`
- [ ] 修改 `screening.ts`：
  - 输入从 `ArcMessage[]` 转为 Mastra messages/memory thread。
  - 调用 `RecruitingChatSupervisor.stream()`
  - `maxSteps` 取代 `stepCountIs`。
- [ ] 修改 `routes/resume/routes/chat/route.ts`：
  - request schema 接收 `ArcMessage[]`。
  - 不再调用 `toUIMessageStreamResponse`。
  - `onEnd` 逻辑改为 stream adapter 完成后持久化 `ArcMessage`。
  - approval event 通过 `AiRunEvent` 返回前端。
- [ ] 新增 approval route：
  - `POST /api/resume/chat/:runId/approve-tool`
  - `POST /api/resume/chat/:runId/decline-tool`
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- routes/resume
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. `applyJobDescription` 是用户可见业务状态变更，不应自动执行。
2. Supervisor 不是万能大 prompt；subagent description 要清晰，否则 delegation 不稳定。
3. Mastra memory 的 `resource/thread` 必须稳定；不要把同一个 `thread` 给不同 user/resource 使用。
4. 大 PDF/image attachment 不进 memory；只进工具可读取的 artifact store。

### 6.9 Phase 8：替换前端 chat runtime

- [ ] 新增 `ArcChatRuntime`：
  - 管理 `conversationId`
  - 管理 `runId`
  - 管理 messages
  - 管理 `status: "idle" | "submitted" | "streaming" | "awaiting-approval" | "error"`
  - 负责 stop/regenerate/reconnect。
- [ ] 新增 `MastraChatTransport`：
  - `sendMessage()`
  - `regenerateFrom(messageId)`
  - `approveToolCall(runId, toolCallId)`
  - `declineToolCall(runId, toolCallId)`
  - `resumeRun(runId)`
- [ ] 替换 `chat-registry.ts`：
  - LRU cache 继续保留，但缓存 `ArcChatRuntime`。
  - 断线/abort/error 时持久化 partial assistant message。
  - tool auto-resume 改为基于 `approval.required`/`run.suspended`。
- [ ] 替换 `chat-workspace.tsx`：
  - `useChat` -> `useArcChat`
  - `ChatStatus` -> project status
  - `addToolOutput` -> approval/resume APIs
- [ ] 替换 `studio-resume-floating-chat.tsx`：
  - 使用同一 runtime。
  - 保留当前“只在简历库页面展示”的路由行为。
- [ ] 替换消息组件类型：
  - `ToolUIPart` -> `ArcToolPart`
  - `FileUIPart` -> `ArcFilePart`
  - `SourceDocumentUIPart` -> `ArcSourcePart`
  - `isToolUIPart` -> `part.type === "tool"`
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot test -- chat
  pnpm --filter @arc/ai-recruitment-copilot typecheck
  ```

注意事项：

1. 不要一次性重做视觉层；先保持现有 UI，替换 runtime 和 types。
2. Regenerate 必须继续支持从某条消息截断历史并传 `messageId`。
3. 当前 chat 有 PDF upload、OCR parsing、JD actions、partial persistence；迁移 runtime 时逐项对照，不要丢功能。

### 6.10 Phase 9：迁移聊天持久化和历史 API

- [x] 修改 `chat/dao/chat.ts`：
  - `content` 类型改为 `ArcMessage`。
  - 写入 `runId`、`threadId`、`resourceId` 到 metadata 或新增 columns。
- [x] 修改 `chat/routes/conversations/route.ts`：
  - request/response DTO 改 `ArcMessage`。
  - 读取旧消息时走 `legacyUiMessageToArcMessage()`，直到数据迁移完成。
- [ ] 修改 `src/lib/client/api/endpoints/chat.ts`。
- [x] 添加迁移脚本：
  - dry run 输出总数、成功转换数、失败 ID。
  - apply 模式写回。
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- routes/chat
  pnpm --filter @arc/ai-recruitment-copilot typecheck
  ```

注意事项：

1. JSONB 迁移必须可重复执行，避免中断后半迁移。
2. 如果旧 UIMessage 含 AI SDK 特有 tool state，要保留到 `metadata.legacy`，便于追溯。
3. 前端历史消息展示不能要求 Mastra memory 在线；业务聊天历史仍由现有 chat 表负责。

### 6.11 Phase 10：迁移批量简历上传处理器

- [x] 新增 `bulk-resume-upload-workflow.ts` 基础单 item workflow：
  1. `process-bulk-upload-item`
- [x] BullMQ resume parse worker 改为调用 `runBulkResumeUploadWorkflow({ itemId })`。
- [x] 当前产品决策：后台批量任务不接前台 workflow stream，仍通过 batch 状态/日志展示总进度；Mastra workflow 主要用于执行编排、可观测性和后续恢复。
- [ ] 扩展 `bulk-resume-upload-workflow.ts`：
  1. `prepareBatchStep`
  2. `foreachResumeStep` 或 child `resume-analysis-workflow`
  3. `deduplicateStep`
  4. `persistRecordStep`
  5. `semanticIndexStep`
  6. `aggregateBatchResultStep`
- [ ] 将 `processor.ts` 的长流程拆成 workflow steps。
- [ ] 每个 step 保留现有 cancellation check 语义，并映射为 workflow cancel/suspend。
- [ ] `logStep` 改为消费 `AiRunEvent` 或 workflow state，写入现有 batch log 表。
- [ ] 对每份简历保存 child `runId`，便于单份失败重试。
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- resume-upload-batches
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. 批量 workflow 不要把所有简历 OCR 原文放进 parent state；只保存 child run IDs 和摘要。
2. 并发数要受控，避免同时 OCR/LLM 过多导致 provider 限流。
3. 每个 child workflow 要支持 idempotent persist，防止 resume 后重复入库。

### 6.12 Phase 11：迁移面试报告 workflow

- [x] 新增 `interview-report-workflow.ts` 基础报告生成 workflow：
  1. `generate-interview-report`
- [x] `runSummaryJob()` 改为调用 `runInterviewReportWorkflow()`，实际面试报告生成入口已经过 Mastra workflow runner。
- [x] 扩展 `interview-report-workflow.ts`：
  1. `loadConversationStep`
  2. `.parallel([summaryStep, evaluationStep])`
  3. `composeReportStep`
- [ ] 新增 `persistReportStep`
- [x] `summaryStep` 替换 `generateText`。
- [x] `evaluationStep` 替换 `generateObject`。
- [x] 使用 Mastra control flow 的 parallel output shape，明确下游 step input schema：

  ```ts
  inputSchema: z.object({
    summaryStep: summaryOutputSchema,
    evaluationStep: evaluationOutputSchema,
  });
  ```

- [x] 添加 `reportEvidenceGroundingScorer`。
- [x] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test -- interview-report
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  ```

注意事项：

1. transcript 可能很长；先做 evidence chunking，再喂给 summary/evaluation。
2. 评分和总结并行可以降低延迟，但最终合并必须验证两个 step 都成功或给出可解释 partial failure。

### 6.13 Phase 12：接入 observability 和 evals

- [ ] 配置 `@mastra/observability`：
  - 开启 tracing/logging/metrics。
  - 开启 sensitive data filter。
  - request context 注入 workspace/user/resume/conversation metadata。
- [x] 注册 scorers：
  - `resumeProfileCompletenessScorer`
  - `jdMatchEvidenceScorer`
  - `interviewQuestionCountScorer`
  - `resumeReviewStructureScorer`
  - `reportEvidenceGroundingScorer`
- [ ] 补充业务语义 scorers：
  - `chatToolUsageScorer`
- [ ] 在关键 agents/workflow steps 上配置 live evaluation sampling：
  - dev/test: `1.0`
  - production 初期: `0.05` 到 `0.1`
- [ ] 新增 trace debug UI：
  - 后端返回 `traceId`
  - 前端错误详情里显示 trace ID
- [ ] 验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
  pnpm check
  ```

注意事项：

1. 默认不要把完整简历原文、面试 transcript、手机号、邮箱写入 traces。
2. Scorer 是异步质量信号，不要阻塞主流程；硬性 schema validation 仍由 Zod/业务代码负责。
3. `mastra_scorers` 数据增长需要 retention 策略。

### 6.14 Phase 13：删除 AI SDK runtime 和兼容层

- [ ] 运行最终扫描：

  ```bash
  rg -n "from \"ai\"|from 'ai'|@ai-sdk/react|@ai-sdk/openai-compatible|ToolLoopAgent|DefaultChatTransport|useChat\\(|generateObject|generateText|Output\\.object|tool\\(" apps packages
  pnpm list ai @ai-sdk/react @ai-sdk/openai-compatible --depth 0 -r
  ```

- [ ] 删除依赖：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot remove @ai-sdk/react @ai-sdk/openai-compatible ai
  pnpm --filter @arc/ai-recruitment-copilot-backend remove @ai-sdk/openai-compatible ai
  pnpm --filter @arc/shared remove ai
  pnpm --filter @arc/db-schema remove ai
  ```

- [ ] 删除 legacy adapters：
  - `legacyUiMessageToArcMessage()` 如果数据迁移完成。
  - `packages/shared/src/api-stream.ts` 的 `AnalysisStreamEvent` alias 如果所有调用方已改用 `AiRunEvent`。
- [ ] 更新 tests mock：
  - 不再 mock `generateText/generateObject/tool/ToolLoopAgent`。
  - 改 mock Mastra agents/workflows/tools。
- [ ] 最终验证：

  ```bash
  pnpm --filter @arc/ai-recruitment-copilot-backend test
  pnpm --filter @arc/ai-recruitment-copilot test
  pnpm typecheck
  pnpm check
  git diff --check
  ```

### 6.15 当前剩余工作汇总

截至 2026-07-01，按代码扫描和本轮实现对齐，剩余工作主要是：

1. **Chat 迁移未完成。** 后端 `resume-agent.ts`、`screening.ts`、`agent-tools.ts`、`agent-helpers.ts`、`routes/resume/routes/chat/route.ts` 仍依赖 AI SDK `ToolLoopAgent`、`tool()`、`UIMessage`、`convertToModelMessages`；前端 `chat-workspace.tsx`、`chat-registry.ts`、`chat-transport.ts`、`studio-resume-floating-chat.tsx` 和消息组件仍依赖 `@ai-sdk/react` / `ai` 类型。
2. **后端 provider 兼容入口未删除。** `apps/ai-recruitment-copilot-backend/src/server/agents/provider.ts` 仍使用 `createOpenAICompatible`，主要为旧 chat/agent 路径保留。
3. **依赖未清理。** `apps/ai-recruitment-copilot/package.json` 和 `apps/ai-recruitment-copilot-backend/package.json` 仍保留 AI SDK 依赖；需等 chat runtime 和旧 provider 删除后再移除。
4. **通用前端 `AiRunPanel` 未做。** 单份简历上传和详情页评价再生成已有领域化进度 UI，但还没有可复用的 run/step/tool/approval/scorer 面板。
5. **`AnalysisStreamEvent` 旧命名未删除。** 生产事件已经是 `AiRunEvent`，但 `packages/shared/src/api-stream.ts` 和若干前端调用仍使用兼容 alias。
6. **`resume-analysis-workflow` 还只是基础编排。** 已有 parse/question blocking runner；尚未把 JD 匹配、评价、可选出题完整收敛到一个可持久化 workflow graph。
7. **`resume-parse-workflow` 还不是完整持久化 workflow。** bytes workflow 已有；S3/local metadata 加载、cache lookup、persist profile/cache 还在 facade/旧服务逻辑中。
8. **批量上传只是接入基础 workflow runner。** BullMQ worker 已调用 `runBulkResumeUploadWorkflow({ itemId })`，但 `processor.ts` 的长流程尚未拆成 workflow steps，也还没有 child runId、snapshot/resume、单份失败重试。
9. **面试报告还缺持久化 step。** summary/evaluation 并行和 compose 已迁到 workflow，`persistReportStep` 还没纳入 workflow。
10. **Observability/live eval 未完整接入。** Scorers 已注册一批，但 tracing、sensitive data filter、request metadata、sampling、trace debug UI 还没落地。
11. **Mastra approval/memory/suspend-resume 未用于业务路径。** 目前主要是 agent/workflow/structured output/stream/scorer；chat approval、workflow resume、Mastra memory thread 仍待实现。

## 7. 模块迁移顺序建议

1. 先迁移 provider/runtime skeleton，因为所有后续模块依赖它。
2. 再迁移结构化生成工具类模块：JD、表单题、面试题、标题。这些风险小、可快速验证 Mastra 模型和 structured output。
3. 再迁移简历解析和评价 workflow，因为它们决定 Studio 等待体验。
4. 面试报告 workflow 已经可以提前迁移；剩余是把持久化纳入 workflow。
5. 再迁移 chat supervisor，因为它牵涉前后端 runtime、tool approval、memory、持久化。
6. 再迁移批量上传，因为它最适合 snapshot/resume，但 blast radius 大。
7. 最后删除 AI SDK 依赖和兼容层。

不要先从前端 `useChat` 开始硬替换。当前 chat runtime 绑定 PDF upload、OCR、JD action、partial persistence 和 regenerate 逻辑；后端 Mastra stream 协议稳定前，前端替换容易返工。

## 8. 验证矩阵

| 阶段              | 必跑命令                                                      | 手动验收                                      |
| ----------------- | ------------------------------------------------------------- | --------------------------------------------- |
| Runtime skeleton  | `pnpm --filter @arc/ai-recruitment-copilot-backend typecheck` | Mastra storage 能连接 PostgreSQL              |
| 结构化生成        | 后端相关 Vitest + typecheck                                   | 生成 JD/题目/form question schema 完整        |
| 简历解析 workflow | `resume-parse-pipeline` tests                                 | 上传简历时字段逐步出现在 overlay              |
| 简历评价 workflow | `resume-analysis-agent` tests                                 | review 文本流式出现，评分结构化保存           |
| Chat supervisor   | `routes/resume` tests + web chat tests                        | PDF 上传、JD 建议、审批、regenerate、断线恢复 |
| 批量上传          | `resume-upload-batches` tests                                 | 单份失败可重试，batch 状态准确                |
| 面试报告          | interview report tests                                        | summary/evaluation 并行，报告有证据引用       |
| 删除 AI SDK       | repo-wide `rg`, `pnpm list`, `pnpm typecheck`, `pnpm check`   | package graph 无 AI SDK runtime               |

## 9. 风险和注意事项

1. **模型工具能力不确定。** Alibaba Coding Plan 官方页说明走 OpenAI-compatible `/chat/completions`，provider-specific feature 可能不可用；工具调用和 structured output 必须分别 smoke test。
2. **Hono endpoint 冲突。** 当前 web app 已把 backend mount 到 `/api`；Mastra Hono guide 默认也讨论 `/api` endpoint。必须显式验证最终路径。
3. **Async app 初始化。** `MastraServer.init()` 是 async；如果改 `createServerApp()` 为 async，要同时改 TanStack Start mount 和 standalone Node entrypoint。
4. **敏感数据。** 简历原文、联系方式、面试 transcript 不应默认进入 traces、memory 或 scorer input。
5. **大附件。** Memory storage 文档提醒部分 storage provider 对 base64 附件大小有限制；即使 PostgreSQL 较宽松，也不要把 PDF/base64 放入 memory。
6. **workflow schema 严格。** Mastra control flow 要求 step output schema 与后续 input schema 对齐；并行 step 的输出以 step id 为 key。
7. **approval 依赖 snapshots。** Agent approval 文档明确需要 storage provider；未配置 storage 会导致 snapshot not found。
8. **旧消息迁移。** `UIMessage` JSONB 可能包含 AI SDK 特有 part/state；迁移脚本必须 dry-run 并保留 legacy metadata。
9. **不要丢失 partial persistence。** 当前 `chat-registry` 在 abort/disconnect/error 时保存部分 assistant message；新 runtime 必须保留。
10. **不要把 workflow 变成大 prompt。** Mastra 的价值在明确 steps、state、tools、suspend/resume 和 observability；如果只把旧 prompt 换成 `Agent.generate()`，体验提升有限。

## 10. 最终移除清单

完成后以下引用应不存在：

```text
from "ai"
from 'ai'
@ai-sdk/react
@ai-sdk/openai-compatible
ToolLoopAgent
DefaultChatTransport
useChat(
generateObject
generateText
Output.object
tool(
toUIMessageStreamResponse
convertToModelMessages
```

允许保留的例外只有：

1. 历史迁移脚本中明确命名为 legacy 的转换测试 fixture。
2. 文档中记录旧实现的文字说明。

## 11. 推荐的第一批 PR 切分

1. **PR 1: Mastra runtime skeleton**
   - 添加依赖、storage、models、request context、空 Mastra instance。
   - 不改业务行为。
2. **PR 2: ArcMessage protocol**
   - 新增共享消息类型和 DB 类型替换。
   - 添加 legacy converter 和迁移 dry-run。
3. **PR 3: Structured generators**
   - 标题、JD、表单题、面试题迁到 Mastra structured output。
4. **PR 4: Resume parse/review workflows**
   - 替换手写 NDJSON 生产端为 workflow + `AiRunEvent` adapter。
5. **PR 5: Frontend AiRunPanel**
   - Studio 简历分析 overlay 消费 `AiRunEvent`。
6. **PR 6: Recruiting chat supervisor**
   - 后端 chat agent/tools/approval/memory 迁移。
7. **PR 7: ArcChatRuntime frontend**
   - `useChat`/`DefaultChatTransport` 替换。
8. **PR 8: Bulk workflow and report workflow**
   - 批量上传和面试报告迁移。
9. **PR 9: Observability/evals and cleanup**
   - traces/scorers，删除 AI SDK 依赖和 legacy 代码。

## 12. 每个 PR 的完成定义

1. 有针对性的单元测试或 route tests。
2. 对应包 typecheck 通过。
3. `git diff --check` 通过。
4. 涉及前端等待体验时，有手动验证说明：哪个页面、哪个操作、看到哪些 `AiRunEvent` 状态。
5. 涉及 Mastra 官方能力时，在 PR 描述中引用对应官方文档链接。
6. 没有把无关 UI、格式化、业务命名一起改掉。
