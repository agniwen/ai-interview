# Mastra Studio 官方术语证据笔记

日期：2026-07-15

证据基线：Mastra 官方文档与 [`mastra-ai/mastra`](https://github.com/mastra-ai/mastra) 官方源码；本仓库当前使用 `@mastra/core@1.50.1`、`@mastra/playground-ui@40.0.1`。

用途：为 `docs/mastra-studio-localization-glossary.md` 和界面本地化提供概念证据。本文件只记录英文术语的官方含义、边界和歧义，**不直接裁定最终中文译法**。

## 结论摘要

Mastra 官方没有单独发布一份面向 Studio 的中英术语表；最接近权威词汇表的是 Studio 概览中对导航分组和页面职责的逐项定义。因此本笔记以 [Studio overview](https://mastra.ai/docs/studio/overview) 为主索引，再用各领域文档和 Studio 官方源码消除歧义。

本地化时最重要的边界有五组：

1. **Agent 与 Workflow**：Agent 面向步骤事先未知的开放式任务；Workflow 面向步骤、顺序和数据流事先明确的流程。
2. **Prompt、Instructions 与 Prompt block**：Studio 的 `Prompts` 页面实际管理的是可复用、可版本化并可组合进 agent system prompt 的 prompt blocks，不等同于任何一般意义的用户 prompt。
3. **Evaluation 与 Observability**：Evaluation 用 scorer、dataset、experiment 衡量质量；Observability 用 metrics、traces、logs 解释运行表现。两者会关联，但不是同一功能域。
4. **Request Context 与 Memory**：Request Context 是单次请求范围内的运行时值；Memory 管理跨调用的对话历史和持久状态。
5. **Resources 的多义性**：当前 Studio 侧边栏的 `Resources` 页面是官方链接入口，不是 Workspace、MCP resource，也不是 Memory resource。

## Studio 信息架构

官方把 Studio 定义为用于构建、测试和管理 agents、workflows、tools 的交互式 UI；它既可用于本地开发，也可部署供团队管理和查看可观测性数据。[Studio overview](https://mastra.ai/docs/studio/overview)

Studio 概览把常见页面分为三组：

- **Primitives**：Agents、Workflows、Processors、MCP servers、Tools、Workspaces、Request context。
- **Evaluation**：Scorers、Datasets、Experiments。
- **Observability**：Metrics、Traces、Logs。

这里的 `Primitives`、`Evaluation`、`Observability` 首先是 Studio 的信息架构分组；不应默认把每个分组名理解为同名 TypeScript 类或单一数据库实体。[Studio overview — Primitives / Evaluation / Observability](https://mastra.ai/docs/studio/overview#primitives)

## 核心能力术语

| 英文术语                     | 官方语义与边界                                                                                                                                                                                                                                                                  | 一手来源                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agents / Agent**           | 使用 LLM 和 tools 解决开放式任务；会围绕目标推理、选择工具并迭代到最终答案或停止条件。适用于步骤事先未知的任务，可被 workflow 或多智能体系统组合。                                                                                                                              | [Agents overview](https://mastra.ai/docs/agents/overview)                                                                                                     |
| **Workflows / Workflow**     | 用结构化 steps 定义复杂任务序列，并显式控制任务拆分、数据流和执行顺序；适用于步骤和顺序事先明确的多步骤流程。Studio 将其显示为图，并在执行时展示实时 step 状态。                                                                                                                | [Workflows overview](https://mastra.ai/docs/workflows/overview)；[Studio overview — Workflows](https://mastra.ai/docs/studio/overview#workflows)              |
| **Prompts / Prompt blocks**  | Editor 的 Prompt 是可复用、可版本化的 instruction template，可包含纯文本、模板变量和 display conditions，并被组合进 agent 的 system prompt。官方进一步区分 inline text、独立 prompt block 和 prompt block reference。                                                           | [Editor — Prompts](https://mastra.ai/docs/editor/prompts)                                                                                                     |
| **Instructions**             | Agent 的 system-level 内容，用来建立行为、个性、能力和核心身份；它可以由 Editor 中有序的 inline text 与 prompt blocks 组成。                                                                                                                                                    | [Agents overview — Quickstart](https://mastra.ai/docs/agents/overview#quickstart)；[Editor — Prompts](https://mastra.ai/docs/editor/prompts)                  |
| **Processors / Processor**   | 消息经过 agent 执行管线时的转换、验证或控制逻辑。`inputProcessors` 在消息进入 LLM 前运行，`outputProcessors` 在 LLM 响应产生后、返回用户前运行，`errorProcessors` 在 LLM API 抛错时运行。                                                                                       | [Processors](https://mastra.ai/docs/agents/processors)                                                                                                        |
| **MCP Servers / MCP Server** | MCP 是连接 AI agent 与外部 tools/resources 的开放标准。`MCPClient` 连接服务器并读取 tools、resources、prompts；`MCPServer` 向 MCP 客户端暴露 Mastra tools、agents、workflows、prompts、resources。Studio 的 MCP Servers 页面列出挂在 Mastra instance 上的服务器并浏览其 tools。 | [MCP overview](https://mastra.ai/docs/mcp/overview)；[Studio overview — MCP servers](https://mastra.ai/docs/studio/overview#mcp-servers)                      |
| **Tools / Tool**             | 为 agent 提供语言生成之外能力的结构化操作，可调用 API、查询数据库或运行自定义函数；通常由 id、description、input/output schema 与 execute 组成。Studio 允许独立运行 tool，以便在分配给 agent 前测试和排错。                                                                     | [Tools](https://mastra.ai/docs/agents/using-tools)；[Studio overview — Tools](https://mastra.ai/docs/studio/overview#tools)                                   |
| **Workspaces / Workspace**   | Agent 的持久运行环境，可包含 filesystem、sandbox command execution、LSP inspection、indexed search 和 reusable skills。Studio 页面主要浏览 workspace filesystem、mounts 和 skills；它不是本产品的组织/租户 workspace。                                                          | [Workspaces overview](https://mastra.ai/docs/workspace/overview)；[Studio overview — Workspaces](https://mastra.ai/docs/studio/overview#workspaces)           |
| **Request Context**          | 传给 agents、tools、workflows 的 request-specific values，用于根据运行时条件切换 model、storage、instructions 或 tool selection。它只面向具体请求，与跨调用保存历史和状态的 agent memory 不同。Studio 可用 JSON、schema form 或 preset 编辑这些值。                             | [Request context](https://mastra.ai/docs/server/request-context)；[Studio overview — Request context](https://mastra.ai/docs/studio/overview#request-context) |

### 需要保持的概念对照

| 容易混淆的术语               | 官方边界                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent vs Workflow            | Agent 自主决定步骤与工具；Workflow 预先定义 steps 和 control flow。[Agents overview — When to use agents](https://mastra.ai/docs/agents/overview#when-to-use-agents)；[Workflows overview — When to use workflows](https://mastra.ai/docs/workflows/overview#when-to-use-workflows) |
| Tool vs MCP Server           | Tool 是具体可执行能力；MCP Server 是通过协议暴露 tools 及其他结构化资源的服务器。[MCP overview](https://mastra.ai/docs/mcp/overview)                                                                                                                                                |
| Workspace vs Request Context | Workspace 提供文件、命令、搜索与 skill 环境；Request Context 携带当前请求的运行时值。[Workspaces overview](https://mastra.ai/docs/workspace/overview)；[Request context](https://mastra.ai/docs/server/request-context)                                                             |
| Request Context vs Memory    | Request Context 是 request-scoped；Memory 是 conversation history 和跨调用 state persistence。[Request context — When to use](https://mastra.ai/docs/server/request-context#when-to-use-requestcontext)                                                                             |
| Prompt block vs user prompt  | Prompt block 是 Editor 管理、可复用且可版本化的 agent instruction template；用户在 Chat 中提交的消息不是该实体。[Editor — Prompts](https://mastra.ai/docs/editor/prompts)                                                                                                           |

## Evaluation 术语

Evaluation 是质量衡量与改进域。它以 scorer 提供测量方法，以 dataset 提供可复现测试样本，以 experiment 执行批量目标运行并比较变化。官方 Studio 产品页也把它描述为从真实运行到数据集、实验和提示词迭代的闭环。[Mastra Studio product page](https://mastra.ai/studio)

| 英文术语                     | 官方语义与边界                                                                                                                                                                                                                      | 一手来源                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evaluation / Evals**       | 针对非确定性 AI 输出的质量衡量功能域。Studio 导航使用 `Evaluation` 作为 Scorers、Datasets、Experiments 的分组；Mastra 文档和包名常用 `Evals` 指同一评估领域。                                                                       | [Studio overview — Evaluation](https://mastra.ai/docs/studio/overview#evaluation)；[Scorers overview](https://mastra.ai/docs/evals/overview)                                                                                                                                                                                                                                                                                                                                  |
| **Scorers / Scorer**         | 自动评估 agent 输出的测试逻辑，可采用 model-graded、rule-based 或 statistical 方法；产生通常为 0 到 1 的数值 score，用于跟踪、比较和诊断质量。Live evaluation 可异步运行，也可对历史 traces 评分。                                  | [Scorers overview](https://mastra.ai/docs/evals/overview)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Datasets / Dataset**       | 用于对 agent 或 workflow 运行 experiments 的 test-case collection。每次 item mutation 都生成新版本，以便精确复现实验；item 可包含 input、ground truth 与 schema。                                                                   | [Datasets overview](https://mastra.ai/docs/evals/datasets/overview)                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Experiments / Experiment** | 将 dataset 中的全部 items 送入一个 target（agent、workflow，部分 API 也支持 custom function），收集 output、status、scores 等结果，并允许跨 prompt、model 或代码变更比较。Scorers 是可选附件，不应把 experiment 直接等同于 scorer。 | [Studio overview — Experiments](https://mastra.ai/docs/studio/overview#experiments)；[Introducing Datasets — Run experiments](https://mastra.ai/blog/introducing-datasets#run-experiments)                                                                                                                                                                                                                                                                                    |
| **Ground truth**             | Dataset item 中的 expected output，用于与 target output 比较；schema 可选但可用于插入时验证。                                                                                                                                       | [Datasets overview — Defining schemas](https://mastra.ai/docs/evals/datasets/overview#defining-schemas)                                                                                                                                                                                                                                                                                                                                                                       |
| **Review**                   | 当前 Studio 实现中的人工评审管线：experiment result 可进入 `needs-review`，人工可评分、评论、标记 tags、完成评审；数据库的 `complete` 状态在 UI 中显示为 `Reviewed`。它与自动执行的 scorer/evaluation 不同。                        | [官方源码：Review pipeline](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/domains/review/components/review-pipeline-card.tsx)；[官方源码：Agent review UI](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/domains/agents/components/agent-playground/agent-playground-review.tsx)；[2026-03-23 changelog](https://mastra.ai/blog/changelog-2026-03-23) |

### Evaluation 内部的关系

```text
Dataset（版本化测试用例集合）
  └── Experiment（将每项送入 target）
        ├── Agent / Workflow target
        ├── Scorer（可选的自动评分）
        └── Review（可选的人工评审管线）
```

`Review` 目前比其他术语更依赖 Studio 实现和版本：官方概览尚未给它单独章节，正式本地化前应以项目锁定版本的页面行为为准，不要把所有出现的英文动词 `review` 都强行映射成同一个领域实体。

## Observability 术语

Observability 覆盖每次 agent run、workflow step、tool call 与 model interaction，并组合使用 traces、logs、metrics 和 feedback 来解释系统“做了什么、为什么”。Tracing 是基础；metrics 从完成的 spans 派生；logs 自动与 trace/span ID 关联。[Observability overview](https://mastra.ai/docs/observability/overview)

| 英文术语           | 官方语义与边界                                                                                                                                                                              | 一手来源                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Observability**  | 运行可见性总领域，涵盖 trace、log、metric、feedback 及其关联信息；其目标是排错、性能监控、成本跟踪和变更前后比较。                                                                          | [Observability overview](https://mastra.ai/docs/observability/overview)                                                                                          |
| **Metrics**        | 从已追踪执行的 spans 自动派生的聚合性能与用量数据，包括 duration、token usage、estimated cost 等。Studio 用 KPI、breakdown 和 time range dashboard 展示，不用于还原某个请求的完整执行路径。 | [Metrics overview](https://mastra.ai/docs/observability/metrics/overview)；[Studio observability — Metrics](https://mastra.ai/docs/studio/observability#metrics) |
| **Traces / Trace** | 单个请求经过 agents、workflows、tools、model calls 的执行路径。每个操作表示为 span，相关 spans 组成层级 trace；用于检查一个具体请求，而非时间范围聚合。                                     | [Tracing overview](https://mastra.ai/docs/observability/tracing/overview)；[Studio observability — Traces](https://mastra.ai/docs/studio/observability#traces)   |
| **Span**           | Trace 中代表一次具体操作的节点，包含 hierarchy、input/output、timing、token usage、metadata 等；多个相关 spans 构成 trace。                                                                 | [Tracing overview](https://mastra.ai/docs/observability/tracing/overview)                                                                                        |
| **Logs / Log**     | 结构化记录，可捕获 function execution、inputs 和 outputs。启用 observability 后，应用及 Mastra 内部 logger calls 会写入 observability storage，并在 traced context 中关联 trace/span。      | [Logging](https://mastra.ai/docs/observability/logging)；[Studio observability — Logs](https://mastra.ai/docs/studio/observability#logs)                         |
| **Feedback**       | 与 trace/span 关联的人工 review signals，如 ratings、comments、corrections；它是 observability signal，不等同于 scorer score 或 experiment review status。                                  | [Observability overview](https://mastra.ai/docs/observability/overview)                                                                                          |

### Metrics、Traces、Logs 的边界

- Metrics 回答“某段时间总体表现如何”，例如成本、延迟分位数、Token 用量和错误趋势。
- Trace 回答“这一笔请求具体经过了什么”，表现为层级 spans。
- Logs 回答“运行过程中记录了什么”，可全文检索，并可跳转到关联 trace/span。

该三分法来自 [Studio observability](https://mastra.ai/docs/studio/observability)，应在菜单、空状态和说明文字中保持一致。

## Studio 页面级术语

| 英文术语      | 官方语义与边界                                                                                                                                                                                       | 一手来源                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editor**    | CMS-style 系统，把 agent configuration 与代码分离，允许非开发角色迭代 agent、版本化变更、运行实验、管理 runtime tools，并可覆盖 code-defined agent 的部分配置。不是一般意义的代码编辑器。            | [Editor overview](https://mastra.ai/docs/editor/overview)                                                                                                                                                     |
| **Chat**      | Agents 页中与某个 agent 直接交互的界面，可切换模型、调整 temperature/top-p、观察 reasoning steps/tool outputs/traces/logs，并在会话中继续发送消息。它是调试和交互表面，不是 agent 配置编辑器。       | [Studio overview — Agents](https://mastra.ai/docs/studio/overview#agents)                                                                                                                                     |
| **Review**    | 在 agent/dataset/experiment 相关页面中表示 experiment results 的人工查看、标注和完成流程；不能与自动 scorer 产生的 evaluation 混用。另有普通动词用法（如“review generated items”），需按上下文区分。 | [官方源码：Agent review UI](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/domains/agents/components/agent-playground/agent-playground-review.tsx) |
| **Resources** | 当前 Studio 侧边栏页面是资源链接中心，包含 Mastra APIs/Swagger UI、Documentation、GitHub、Community、Cloud share、Sales 等入口；它不是一个“运行时资源列表”。                                         | [官方源码：Resources page](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/pages/resources/index.tsx)                                               |

## 关键歧义与本地化风险

### 1. `Resources` 不能脱离页面语境统一处理

Mastra 至少存在三种不同的 `resource`：

1. Studio 侧边栏 **Resources page**：官方文档、API、社区和商业入口的链接中心。
2. **MCP resource**：MCP Server 暴露、MCP Client 可读取的结构化数据或内容。[MCP overview](https://mastra.ai/docs/mcp/overview)
3. **Memory resource/resourceId**：用于把多条 threads 归属到同一用户或实体的记忆作用域。[官方 Agent Memory guide](https://mastra.ai/blog/agent-memory-guide#using-resource-and-threads)

三者不能共享一条不带上下文说明的译名规则。尤其是 Studio 菜单项 `Resources`，应按“入口/链接页”的实际内容定译，而不是按 MCP 或 Memory 的领域含义定译。

### 2. `Prompt` 与 `Instructions` 不是完全同义

- `Instructions` 是 agent system-level 行为配置。
- `Prompt block` 是 Editor 中可复用、可版本化并可引用到 instructions 的内容单元。
- Chat 的用户输入是运行时消息，不是 Prompt 页面里的 prompt block。

因此导航 `Prompts`、按钮 `Create prompt`、字段 `Instructions` 应分别依据实体语义翻译，不能仅做字符串全局替换。

### 3. `Evaluation`、`Scoring`、`Review` 需要分层

- Evaluation/Evals 是质量评估总域。
- Scorer/Scoring 是自动测量机制和执行过程。
- Score 是测量结果。
- Experiment 是批量运行和比较容器。
- Review 是当前 Studio 中的人工评审管线，也可能只是普通动作词。

若把它们全部处理成一个中文词，会破坏页面层级和状态含义。

### 4. `Trace`、`Tracing` 与 `Span`

- Tracing 是记录执行路径的机制。
- Trace 是一次相关执行的完整记录。
- Span 是 trace 中的一次操作。

菜单、列表标题、动作和技术字段可能需要不同词形；例如 `Trace ID` 不应被误当作普通“追踪动作”。

### 5. `Run` 是动作也是实体

官方页面同时把 `run` 用作执行动作、一次 execution record 和聚合计数（agent runs）。本地化实现应根据按钮、列表、ID、状态、指标等上下文分别处理，避免只建立一个全局字符串映射。

### 6. Studio 文档与当前源码可能存在版本差

`Review`、`Resources` 等页面级语义在官方源码中比概览文档更具体。实施时应：

1. 用本文件确定领域边界；
2. 用项目锁定的 `@mastra/playground-ui`/vendored Studio 源码确认实际文案和交互；
3. 避免依赖英文原文作为业务逻辑 key；
4. 对上游升级新增的英文文案重新做扫描。

## 一手来源索引

- [Studio overview](https://mastra.ai/docs/studio/overview)
- [Agents overview](https://mastra.ai/docs/agents/overview)
- [Workflows overview](https://mastra.ai/docs/workflows/overview)
- [Processors](https://mastra.ai/docs/agents/processors)
- [Tools](https://mastra.ai/docs/agents/using-tools)
- [MCP overview](https://mastra.ai/docs/mcp/overview)
- [Workspaces overview](https://mastra.ai/docs/workspace/overview)
- [Request context](https://mastra.ai/docs/server/request-context)
- [Editor overview](https://mastra.ai/docs/editor/overview)
- [Editor prompts](https://mastra.ai/docs/editor/prompts)
- [Scorers overview](https://mastra.ai/docs/evals/overview)
- [Datasets overview](https://mastra.ai/docs/evals/datasets/overview)
- [Observability overview](https://mastra.ai/docs/observability/overview)
- [Studio observability](https://mastra.ai/docs/studio/observability)
- [Metrics overview](https://mastra.ai/docs/observability/metrics/overview)
- [Tracing overview](https://mastra.ai/docs/observability/tracing/overview)
- [Logging](https://mastra.ai/docs/observability/logging)
- [Official Resources page source](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/pages/resources/index.tsx)
- [Official Review UI source](https://github.com/mastra-ai/mastra/blob/84928c133a8dd197fc6b3ebbb208ee18d540dad7/packages/playground/src/domains/agents/components/agent-playground/agent-playground-review.tsx)
