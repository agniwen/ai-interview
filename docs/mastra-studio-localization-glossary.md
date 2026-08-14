# Mastra Studio 中文本地化术语表

本文档是本仓库 Mastra Studio 界面的中文本地化基线。新增或修改 Studio 文案时，应优先使用本表中的译法；不要在不同页面为同一 Mastra 概念创建近义译名。

## 翻译原则

1. `Mastra`、`Mastra Studio`、`MCP`、`API`、`SDK`、`LLM`、`JSON`、`CSV`、`URL`、`ID` 等品牌、协议和技术缩写不翻译。
2. Agent、Workflow 等 Mastra 领域概念在面向用户的界面中使用固定中文译名；代码标识符、路由、接口字段、实体 ID、模型 ID 和用户数据保持原样。
3. 同一英文词在不同领域含义不同时按上下文翻译。例如 `run` 作为动作译为“运行”，作为历史记录译为“运行记录”；`score` 是“得分”，`scorer` 是“评分器”。
4. 优先使用简洁的中文界面文案，不机械逐词直译。占位符、空状态、错误提示和无障碍标签也应本地化。
5. 第三方产品名、模型名、工具名、智能体名、工作流名及用户输入内容不翻译。

## 实现约束

- 仓库内的 Studio 页面直接使用本表中的中文文案。
- `@mastra/playground-ui` 当前没有可供宿主注入的界面语言接口；它内部的追踪、日志、指标和筛选器文案通过 pnpm 的固定版本补丁本地化。
- 升级 `@mastra/playground-ui` 时必须重新核对并生成补丁，同时运行 Mastra Studio 本地化架构测试，避免依赖升级恢复英文文案。

## 产品与导航

| 英文                     | 统一中文      | 说明                                                         |
| ------------------------ | ------------- | ------------------------------------------------------------ |
| Mastra Studio            | Mastra Studio | 产品名称保持原文                                             |
| Primitives               | 基础能力      | Studio 中 Agents、Workflows、Tools 等核心构件的分组          |
| Agents / Agent           | 智能体        | 不使用“代理”                                                 |
| Prompts / Prompt         | 提示词        | `Prompts` 页面管理的实体实际是提示词块，不等同于聊天消息     |
| Prompt Blocks            | 提示词块      | 可复用、可版本化的提示词内容块；与智能体指令分开             |
| Workflows / Workflow     | 工作流        | 由明确步骤和控制流组成                                       |
| Processors / Processor   | 处理器        | 对智能体输入、输出或错误进行处理                             |
| MCP Servers / MCP Server | MCP 服务器    | MCP 保持大写                                                 |
| Tools / Tool             | 工具          | 可由智能体或工作流调用                                       |
| Tooling                  | 工具体系      | 搜索分组或工具相关能力集合                                   |
| Workspaces / Workspace   | 工作区        | 智能体可访问的文件、命令、搜索和技能环境；不是业务租户工作区 |
| Request Context          | 请求上下文    | 随单次请求注入的运行时变量；不是长期记忆                     |
| Evaluation               | 评估          | Studio 的质量评估功能分组                                    |
| Observability            | 可观测性      | 指标、追踪和日志的总称                                       |
| Settings                 | 设置          | Studio 配置页面                                              |
| Resources                | 资源          | API、文档、GitHub、社区、Cloud 与销售等入口的链接中心        |
| Templates                | 模板          | 可复用配置模板                                               |
| Integrations             | 集成          | 外部服务或工具提供商连接                                     |

## 智能体与调试

| 英文                      | 统一中文            | 说明                                                    |
| ------------------------- | ------------------- | ------------------------------------------------------- |
| Agent Builder             | 智能体构建器        | 创建和配置智能体的可视化界面                            |
| Playground                | 调试台              | 用于与智能体交互和调整模型参数                          |
| Chat                      | 对话                | 与智能体的交互界面                                      |
| Thread                    | 会话                | 一组连续对话，不译为“线程”                              |
| New Thread                | 新建会话            |                                                         |
| Instructions              | 指令                | 定义智能体行为的系统级内容                              |
| System Prompt             | 系统提示词          | 仅在明确指模型 system prompt 时使用                     |
| Model                     | 模型                |                                                         |
| Model Provider / Provider | 模型提供商 / 提供商 | 上下文明确时可省略“模型”                                |
| Memory                    | 记忆                | 智能体的会话记忆能力                                    |
| Working Memory            | 工作记忆            | Mastra Memory 的结构化持续信息                          |
| Semantic Recall           | 语义召回            | 基于语义相关性召回历史消息                              |
| Observational Memory      | 观测记忆            | Mastra 的专有记忆机制                                   |
| Skills / Skill            | 技能                | 工作区中可发现、安装的技能                              |
| Guardrails / Guardrail    | 护栏                | 输入输出的安全或业务约束                                |
| Input Processor           | 输入处理器          | 进入模型前处理消息                                      |
| Output Processor          | 输出处理器          | 模型输出后处理消息                                      |
| Error Processor           | 错误处理器          | 模型调用失败时处理错误                                  |
| Review                    | 评审                | 对实验结果进行人工查看和反馈，不与自动“评估/评分器”混用 |
| Feedback                  | 反馈                |                                                         |
| Version                   | 版本                |                                                         |
| Publish                   | 发布                |                                                         |
| Draft                     | 草稿                |                                                         |
| Tool Call                 | 工具调用            |                                                         |
| Tool Result               | 工具结果            |                                                         |
| Structured Output         | 结构化输出          |                                                         |

## 工作流与执行

| 英文                 | 统一中文      | 说明                                    |
| -------------------- | ------------- | --------------------------------------- |
| Run                  | 运行          | 动作                                    |
| Run History / Runs   | 运行记录      | 历史记录集合                            |
| Execution            | 执行          | 一次执行过程                            |
| Step                 | 步骤          | 工作流节点                              |
| Input / Output       | 输入 / 输出   |                                         |
| Schema               | Schema        | JSON Schema、输入 Schema 等技术名称保留 |
| State                | 状态          | 工作流状态数据                          |
| Control Flow         | 控制流        |                                         |
| Snapshot             | 快照          | 可恢复的工作流执行状态                  |
| Suspend / Suspended  | 挂起 / 已挂起 |                                         |
| Resume / Resumed     | 恢复 / 已恢复 |                                         |
| Time Travel          | 时间回溯      | 从历史步骤重新执行                      |
| Schedule / Schedules | 定时任务      | 定时运行工作流的配置                    |
| Trigger              | 触发器        |                                         |
| Run ID               | 运行 ID       |                                         |
| Step Result          | 步骤结果      |                                         |

## 评估

| 英文              | 统一中文 | 说明                                       |
| ----------------- | -------- | ------------------------------------------ |
| Eval / Evaluation | 评估     | 评估过程或功能域                           |
| Scorer            | 评分器   | 对输出执行自动评估的逻辑                   |
| Score             | 得分     | 评分器产生的数值或结果                     |
| Scoring           | 评分     | 评分过程                                   |
| Dataset           | 数据集   | 用于评估智能体或工作流的测试用例集合       |
| Dataset Item      | 数据项   | 数据集中的单个测试用例                     |
| Ground Truth      | 标准答案 | 测试用例的期望输出                         |
| Experiment        | 实验     | 使用数据集、目标和可选评分器执行的比较运行 |
| Experiment Run    | 实验运行 | 一次具体实验执行                           |
| Target            | 目标     | 实验所运行的智能体、工作流或函数           |
| Test Case         | 测试用例 |                                            |
| Average Score     | 平均得分 |                                            |
| Pass Rate         | 通过率   |                                            |
| Compare           | 对比     |                                            |

## 可观测性

| 英文                | 统一中文        | 说明                                                    |
| ------------------- | --------------- | ------------------------------------------------------- |
| Metrics             | 指标            | 聚合性能数据                                            |
| Traces / Trace      | 追踪 / 追踪记录 | 单次请求的执行链路；列表标题使用“追踪”                  |
| Span                | Span            | OpenTelemetry 技术实体保留英文；说明文案可写“Span 节点” |
| Logs / Log          | 日志            |                                                         |
| Signals             | 观测信号        | 指标、追踪、日志等信号的分组                            |
| Runtime             | 运行时          |                                                         |
| Entity              | 实体            | 智能体、工作流、工具等可观测对象                        |
| Attributes          | 属性            |                                                         |
| Metadata            | 元数据          |                                                         |
| Latency             | 延迟            |                                                         |
| Duration            | 持续时间        |                                                         |
| Token Usage         | Token 用量      | Token 保留英文                                          |
| Model Cost          | 模型成本        |                                                         |
| Error Rate          | 错误率          |                                                         |
| Trace Volume        | 追踪数量        |                                                         |
| Download Trace JSON | 下载追踪 JSON   |                                                         |

## 通用界面动作与状态

| 英文                     | 统一中文        |
| ------------------------ | --------------- |
| Create / Add             | 创建 / 添加     |
| Edit                     | 编辑            |
| Save                     | 保存            |
| Save Changes             | 保存更改        |
| Delete / Remove          | 删除 / 移除     |
| Cancel                   | 取消            |
| Close                    | 关闭            |
| Confirm                  | 确认            |
| Continue                 | 继续            |
| Back                     | 返回            |
| Search                   | 搜索            |
| Filter                   | 筛选            |
| Sort                     | 排序            |
| Refresh                  | 刷新            |
| Retry                    | 重试            |
| Reset                    | 重置            |
| Clear                    | 清除            |
| Copy                     | 复制            |
| Download / Export        | 下载 / 导出     |
| Import / Upload          | 导入 / 上传     |
| View Details             | 查看详情        |
| Learn More               | 了解更多        |
| Documentation            | 文档            |
| Loading                  | 正在加载        |
| No results               | 没有结果        |
| Enabled / Disabled       | 已启用 / 已停用 |
| Connected / Disconnected | 已连接 / 未连接 |
| Success / Failed         | 成功 / 失败     |
| Pending                  | 等待中          |
| Running                  | 运行中          |
| Completed                | 已完成          |
| Error                    | 错误            |

## 官方依据

- [Studio 概览](https://mastra.ai/docs/studio/overview)：定义 Studio 的三个主要功能分组，以及 Agents、Workflows、Processors、MCP servers、Tools、Workspaces、Request context、Scorers、Datasets 和 Experiments 的职责。
- [Agents 概览](https://mastra.ai/docs/agents/overview)：区分开放式任务的 Agent 与预定义控制流的 Workflow，并定义 instructions、tools、memory 等智能体概念。
- [Workflows 概览](https://mastra.ai/docs/workflows/overview)：定义步骤、控制流、状态、快照、挂起与恢复等工作流术语。
- [Processors](https://mastra.ai/docs/agents/processors)：定义 input、output、error processor 的执行位置和职责。
- [Studio 可观测性](https://mastra.ai/docs/studio/observability)：明确 Metrics 是聚合性能数据、Traces 用于检查单次请求、Logs 用于查看内部和应用日志。
- [Scorers 概览](https://mastra.ai/docs/evals/overview)：定义 Scorer 为评估智能体输出的自动化逻辑。
- [Mastra Studio 产品说明](https://mastra.ai/studio)：说明 Dataset、Experiment、Scorer、Trace 等概念在 Studio 迭代闭环中的关系。

更完整的官方术语证据记录见 [`docs/research/mastra-official-terminology.md`](research/mastra-official-terminology.md)。
