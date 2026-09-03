# Mastra workflow 与 AI 评分 workflow 调研

查阅日期：2026-08-21

范围：Mastra 官方文档、Mastra 官方仓库，以及本仓库当前的结构化简历评分实现。重点核对 workflow step 的 input/context/事件传递、Agent/Tool 调用、workflow 与 agent loop 的边界、状态与暂停恢复、结构化输出和上下文长度控制。

版本说明：本仓库当前锁定 `@mastra/core@1.50.1`（见 [backend/package.json](../../apps/server/package.json) 和 [pnpm-lock.yaml](../../pnpm-lock.yaml)）。Mastra 官方文档是当前在线版本；涉及实现细节时，同时参考了对应的官方源码标签 [`@mastra/core@1.50.1`](https://github.com/mastra-ai/mastra/tree/%40mastra%2Fcore%401.50.1)。因此，若文档已描述更新的 API，应以本仓库锁定版本的源码和类型为准，并在升级 Mastra 时重新核对。

## 结论先行

1. **当前 `structured-resume-review-workflow` 适合继续作为 workflow，而不是改写成一个自主 agent loop。** 它有冻结输入、固定步骤、明确的并行/串行依赖、需要审计的证据链和必须由代码拥有的评分数学；这正是 Mastra workflow 的适用边界。Agent 只负责语义判断和叙述，代码负责归一化、扣分、加权、截断和最终结果组装。
2. **当前实现的数据流设计是合理的，但要明确四种通道不能混用：** `inputData` 是步骤之间的业务数据；`RequestContext` 是每次调用的运行时依赖，不应替代评分输入；workflow state 是跨步骤共享且可随暂停恢复持久化的状态；stream event 只是生命周期、进度或对外 UI 数据，不会自动成为下一个 step 的输入。
3. **当前 workflow 没有使用 Mastra Tool、`RequestContext`、workflow state 或 suspend/resume。** 这不是缺失，而是符合当前评分契约：岗位快照和简历输入在进入 Mastra 前已经准备好，workflow 不查库；评分不应由 Agent tool 动态决定；本次运行也没有人工确认节点。
4. **结构化输出边界做得比“只相信 Agent 返回 JSON”更稳健。** 每个语义 Agent 都有 Zod 输出 schema，生成器还做 schema parse、语义校验、重试和文本 JSON fallback；最终 score、grade、gate 和 deductions 由代码重新计算并由最终 schema 收口。Mastra 原生 `structuredOutput` 提供的是输出形状约束，不是业务事实正确性或评分可信性保证。
5. **最值得补强的是上下文长度和未来暂停时的快照大小，而不是引入 agent loop。** 当前代码把简历证据目录做了文本分块并将原文最多限制为 200 个 400 字符块，但 `resumeProfile` 没有相同的总量上限；`maxOutputTokens` 只限制输出，不限制 prompt 输入。若未来加入暂停恢复，当前每个 step 都携带完整 `resumeText` 的 workflow input 也会放大 snapshot，应改为小型可序列化引用或受控摘要，而不是把全文塞进 state/snapshot。

## 官方模型：四条数据通道

### 1. `inputData`：显式的 step 输入/输出链

官方定义是：step 的 `inputSchema` 和 `outputSchema` 描述它接受和返回的数据；在 `.then()` 中，前一步的输出成为下一步的 `inputData`。[Workflows overview](https://mastra.ai/docs/workflows/overview) [Workflow state：state 与 step input/output 的区别](https://mastra.ai/docs/workflows/workflow-state)

在 `.parallel()` 后，后续 step 收到以 step ID 为 key 的并行结果；在 `.branch()` 后，只有实际执行分支的结果存在；`.map()` 可以读取 `inputData`、`getStepResult()` 和 `getInitData()`，把数据重塑成下一步所需的 schema。[Control flow / input data mapping](https://mastra.ai/docs/workflows/control-flow)

对应的官方 v1.50.1 类型把这些能力直接列在 step execute 参数中：`inputData`、`getInitData()`、`getStepResult()`、`state`、`setState()`、`resumeData`、`requestContext` 和 `writer`。[官方 `step.ts` 源码（v1.50.1）](https://github.com/mastra-ai/mastra/blob/%40mastra%2Fcore%401.50.1/packages/core/src/workflows/step.ts)

这里的关键判断是：**`inputData` 是业务数据传递协议，不是隐式共享内存。** 下一步能看到什么，取决于上一步的输出 shape、workflow control-flow 结构和 input schema。事件流不会自动改变 `inputData`。

### 2. `RequestContext`：一次请求的运行时上下文

`RequestContext` 用于将请求特有的值传给 Agent、Tool、workflow 及其底层 primitives，例如租户、用户层级、区域、动态模型或权限依赖；它与 Agent memory、会话历史和 workflow state 是不同概念。[官方 Request context](https://mastra.ai/docs/server/request-context)

它通过 `run.start({ requestContext })` 或 Agent/Tool 调用选项传入；step 可以在 `execute({ requestContext })` 中读取。官方还支持在 workflow/step 上声明 `requestContextSchema`，在运行前或 step 执行前校验，而不是等到 LLM 调用后才发现缺字段。[Request context schema validation](https://mastra.ai/docs/server/request-context)

因此：岗位快照、简历、`evaluationAsOf`、engine version 这类**决定评分结果且需要随 run 审计的输入**应该进入 workflow `inputSchema`；数据库连接、租户权限、请求级 logger 或动态 provider 这类**运行时依赖**才适合 `RequestContext`。不要把可信评分配置藏进未声明的 RequestContext，避免失去输入快照和重放边界。

### 3. workflow state：跨步骤共享、可持久化的状态

workflow state 通过 workflow/step 的 `stateSchema`、`initialState`、`state` 和 `setState` 使用。它适合多个步骤共享的进度、累积结果或配置，避免把与中间步骤无关的字段逐层穿透 input/output；官方明确说 state 会跨整个 workflow run 存在，并在 suspend/resume 后保留。[Workflow state](https://mastra.ai/docs/workflows/workflow-state)

但 state 不是“比 inputData 更可信”的业务数据层，也不是上下文长度优化器。进入 state 的值仍需可序列化，且可能进入 workflow snapshot。官方快照建议避免直接保存大对象，优先保存 ID 或引用，需要时再取回。[Snapshots：可序列化与快照大小建议](https://mastra.ai/docs/workflows/snapshots)

### 4. stream event / `writer`：观测和对外传递

`run.start()` 适合只关心最终结果；`run.stream()` 返回描述 workflow 生命周期的结构化事件流，可观察 workflow/step 开始、结果、完成、工具调用和 usage。事件有顶层 `runId`、`from`，业务数据通常在 `payload` 中；它是对外观察面，不是下游 step 的 input channel。[官方 Streaming guide](https://mastra.ai/docs/guides/streaming)

workflow step 可以从 `execute({ writer })` 通过 `await writer.write(...)` 写入自定义事件或进度；工具也可用 writer。自定义 `data-*` chunk 默认会持久化，纯实时且大/高频的进度应标记 `transient: true`。[Streaming guide：Writer API](https://mastra.ai/docs/guides/streaming)

这意味着事件传递有两个容易混淆的层次：

| 目的                           | 正确机制                                             | 是否自动成为下一步 `inputData` |
| ------------------------------ | ---------------------------------------------------- | ------------------------------ |
| 让下一 step 消费结构化业务结果 | 返回值 + `outputSchema` → 下一 step 的 `inputData`   | 是                             |
| 读取初始 workflow 输入         | `getInitData()`                                      | 由 step 显式读取               |
| 读取特定已完成 step 的结果     | `getStepResult()` 或 control-flow 产生的 keyed input | 由 step 显式读取               |
| 传租户/请求级运行时值          | `RequestContext`                                     | 由 step/Agent/Tool 显式读取    |
| 展示进度、事件、调试信息       | `run.stream()` / `writer.write()`                    | 否                             |
| 人工输入后继续                 | `suspend()` + `resumeData` / `resume()`              | 仅通过被恢复 step 的恢复协议   |

## Agent、Tool 与 workflow 的边界

### 官方边界

Mastra 官方建议：需要推理、语言生成或 LLM 任务时使用 Agent；Agent 可以在 step 的 `execute()` 中用 `.generate()` / `.stream()` 调用，这种方式可以自定义 prompt、memory、structured output 和结果处理；如果不需要定制调用，则可以直接把 Agent 包成 step，或使用 `.agent()` shorthand。[Workflows 中使用 Agent 和 Tool](https://mastra.ai/docs/workflows/agents-and-tools)

Tool 用于 API、数据库或明确、类型化、可重复的代码操作。它既可以在 step 中显式执行，也可以直接作为 workflow step；是否由 Agent 决定调用，取决于它是否被挂到 Agent 的 `tools` 配置中。[Tools](https://mastra.ai/docs/agents/tools) [Workflows 中使用 Tool](https://mastra.ai/docs/workflows/agents-and-tools)

简化成工程判断：

- **Workflow**：执行图、顺序/并行/分支/循环、schema 边界、重试、审计和可恢复性。
- **Agent**：在一个步骤内做开放式语义推理、生成、分类或基于工具的动态决策。
- **Tool**：有明确输入/输出和副作用边界的确定性能力；不应把核心业务约束藏在 Agent 的自由选择里。
- **代码 step**：数学、排序、权限、哈希、幂等、状态机和必须可复现的业务逻辑。

### workflow 与 agent loop 的适用边界

Mastra 对 workflow 的定位是：任务已知、包含多个步骤、有特定顺序，需要精细控制数据流和调用哪个 primitive。[Workflows overview](https://mastra.ai/docs/workflows/overview) Agent loop 则适合任务分解在运行时才展开、需要多轮工具调用、根据中间观察动态选择下一动作，或结果标准本身需要 Agent 反复自检的场景。

不要把“多个 Agent 调用”误认为“agent loop”。固定的 `Agent A → Agent B → code` 是 workflow；Agent 自己根据模型输出决定是否继续、调用哪个工具、何时停止，才是 loop。评分场景若让一个 loop 同时决定证据、门槛、扣分和总分，会把可审计的业务契约变成不可预测的模型控制流。

## 对本仓库评分 workflow 的具体判断

### 实际结构

目标实现是 [`structured-resume-review-workflow.ts`](../../apps/server/src/server/agents/mastra/workflows/structured-resume-review-workflow.ts)，其输入 schema、prompt、Agent 输出 schema、证据校验和评分计算主要在 [`structured-resume-evaluation.ts`](../../apps/server/src/server/agents/structured-resume-evaluation.ts)。入口在 [`review-generation.ts`](../../apps/server/src/server/routes/studio/routes/resumes/utils/review-generation.ts)。当前 workflow 是：

```text
validate-structured-input
        │
        ├── judge-hard-gates              ┐
        └── judge-dimension-evidence      ┘  parallel
                    │
             judge-adjustments
                    │
          compute-structured-score  (纯代码计算)
                    │
       generate-structured-narrative (Agent)
                    │
       assemble-structured-evaluation (纯代码组装)
```

### 数据通道对照

| Mastra 概念            | 当前实现                                                                                                                                                               | 判断                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| workflow `inputData`   | `engine`、不可变 `jobSnapshot`、`resumeInput`；后续 step 通过对象扩展保留原输入和前序输出                                                                              | **正确。** 评分所依赖的岗位蓝图、hash、规则版本、简历输入和 `evaluationAsOf` 都可随 run 审计。                                                                  |
| sequential step output | `gateOutput`、`dimensionOutput`、`adjustmentOutput`、`calculationResult`、`narrative`                                                                                  | **正确。** 每个边界都有 schema；`compute` 接收语义结果，不让 Agent 写可信分数。                                                                                 |
| parallel output        | `judge-hard-gates` 和 `judge-dimension-evidence` 以 step ID key 合并，再显式抽取 `gateResult`/`dimensionResult`                                                        | **正确。** 这符合 Mastra parallel output 的 keyed shape；不是把两个 Agent 的结果放进一个共享隐式上下文。                                                        |
| `RequestContext`       | 当前 workflow 没有声明或读取                                                                                                                                           | **可以保持。** 当前输入已经包含评分所需事实；没有看到需要请求级动态租户/模型/权限来决定评分逻辑的地方。若未来加入，应显式声明 schema。                          |
| workflow state         | 当前没有 `stateSchema` / `setState`                                                                                                                                    | **可以保持。** 这是单次评分 run，不需要跨多个暂停点累积状态；不应为了“共享”而把完整简历复制到 state。                                                           |
| Agent                  | gate、dimension、adjustment、narrative Agent 都在 `execute` 间接调用 `generateStructuredWithMastraAgent`                                                               | **合理。** 自定义 wrapper 需要控制 prompt、timeout、重试、native structured output、文本 fallback 和语义校验，直接 `createStep(agent)` 反而会丢失这些业务边界。 |
| Tool                   | 评分 workflow 没有 Tool，也没有数据库查询                                                                                                                              | **符合设计。** 岗位快照在进入 workflow 前加载；门槛/维度/加减分判断不能通过 Agent 自主调用工具绕过冻结快照。                                                    |
| stream event           | `streamStructuredResumeReviewWorkflow` 读取 `fullStream`，交给 `emitMastraWorkflowStreamEvents`；adapter 只映射 step started/progress/result/suspend/finish 等应用事件 | **正确理解。** 这些事件用于 UI/运行状态，不承担评分结果在 step 之间的业务传递。                                                                                 |

### 评分可信边界

当前实现最重要的设计是：

- gate Agent 只返回状态、证据、原因和必要的经历片段；
- dimension Agent 只返回月级时间线、相关性、项目/技能事实和语义规则判断，不计算月份和分数；
- adjustment Agent 只返回条件是否命中、证据和原因；
- `computeStructuredResumeCalculation` 负责时间线归一化、规则状态、扣分、六维原始分、权重、加减分、综合分和 grade；
- narrative Agent 只能解释已完成的计算；
- 最后的 `assembleStructuredResumeEvaluation` 再以严格 schema 生成完整 artifact。

这正好利用 workflow 的“可控执行图 + Agent 局部推理”优势。即使 Agent 返回了看似合理的 `compositeScore`，当前 workflow 的 schema/代码路径也没有把它作为可信来源。这个边界应继续保持，不能因为 Mastra 支持 Agent/tool/workflow 组合就把评分数学移进工具描述或 Agent prompt。

## 结构化输出：Mastra 保证什么，业务还要保证什么

Mastra 的 `structuredOutput` 接收 Standard JSON Schema（包括 Zod 等），最终结果可从 `response.object` 取得；Agent-as-step 也可以通过 `structuredOutput: { schema }` 让 step 的 output schema 与 Agent 结果对齐。[Structured output](https://mastra.ai/docs/agents/structured-output) [Agents with structured output in workflows](https://mastra.ai/docs/workflows/agents-and-tools)

官方还提示三个实际限制：

1. structured output 与 tools 能否在同一个 provider call 中组合，取决于底层模型；不支持时可用 `jsonPromptInjection`、单独的 structuring model，或通过 `prepareStep` 拆成两次调用。
2. schema 校验失败可选择 `strict`、`warn` 或 `fallback` 策略；structured output 不等于所有语义事实都正确。
3. 为 structured output 指定单独 model 可能产生第二次 LLM 调用，带来额外延迟和成本。[Structured output：tools 组合、structuring model 和错误策略](https://mastra.ai/docs/agents/structured-output)

本仓库的做法比默认策略更强：在 `generateStructuredWithMastraAgent` 外加 `safeParse`、证据来源校验、特定语义校验、无效输出重试和纯文本 JSON fallback；workflow 层再用 `inputSchema`/`outputSchema` 把结果收口。建议继续把“schema 合法”和“评分可信”视为两层不同检查，并为每个 Agent 保持最小输出 schema，而不是让一个 Agent 返回整份最终评估。

## 状态、暂停与恢复

Mastra workflow 可以在任意 step 暂停，暂停时保存 snapshot，之后用特定 step ID 和符合 `resumeSchema` 的 `resumeData` 恢复；snapshot 包含已经完成的 step 输出、执行路径、暂停信息、重试次数和恢复所需上下文。配置的 storage 负责跨进程、部署和重启保存。[Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume) [Snapshots](https://mastra.ai/docs/workflows/snapshots)

当前评分路径没有 `suspend()`、`resumeSchema`、`resumeData` 或 `run.resume()`：它是后台一次性生成，完成后由外层 lifecycle 做持久化和 stale-run 防护。`resumeInput` 中的 `runId` 只是本仓库的评分尝试身份，不应与 Mastra workflow 的 suspended run / `resumeData` 混为一谈。

如果未来产品要求“HR 审核证据后继续”，建议：

- 在明确的人工审核 step 上声明 `suspendSchema`/`resumeSchema`，让恢复输入有类型约束；
- 保存并恢复 Mastra run，而不是每次重新 `createRun()`；
- 只把审核所需的候选 ID、artifact ID、证据摘要和版本 hash 放进 state/snapshot；
- 长简历正文留在已有持久化存储，恢复时按引用重新取回；
- 对恢复后的模型调用重新做输入 hash、引擎版本和岗位快照一致性校验。

这是当前实现尚未需要的能力，不建议为一次性评分预先引入 state 或 suspend/resume。

## 上下文长度控制

### Mastra 官方能力

对带会话历史的 Agent，官方提供 `TokenLimiter` processor：当消息总 token 数超过指定上限时删除较旧消息，优先保留近期消息并保留 system message；`ToolCallFilter` 可过滤冗长 tool call 结果，`ToolSearchProcessor` 可在工具很多时按需发现/加载工具。[Processors：TokenLimiter、ToolCallFilter、ToolSearchProcessor](https://mastra.ai/docs/agents/processors)

这些能力主要解决 Agent memory/agent loop 的消息历史和工具结果膨胀。它们不会自动限制一个 workflow step 里应用代码拼出来的长 prompt，也不会自动压缩 workflow snapshot；快照大小仍要由应用设计负责。[Snapshots](https://mastra.ai/docs/workflows/snapshots)

### 当前实现的实际控制

当前代码没有给这些 scoring Agent 配置 memory、input processor 或 TokenLimiter，而是采用一次性 prompt：

- `resumeText` 按 400 字符切块，最多取 200 块，即原文证据目录最多约 80,000 字符；
- `resumeProfile` 递归收集字符串叶子并分块去重，但没有 profile 总字符/token 上限；
- 每个主要 Agent 调用配置 `maxOutputTokens: 16_000`，并配置约 240 秒 timeout；
- narrative prompt 会再次携带计算结果、维度规则判断、岗位期待和 `resumeProfile`。

因此当前的风险不是“Agent history 无限增长”，而是**单次 prompt 的输入 shape 可能随岗位蓝图、简历 profile 和 evidence quote catalog 变大**。`maxOutputTokens` 只能限制生成侧，不会限制输入侧，也不等于 provider 的完整上下文窗口预算。

### 建议优先级

1. 先在生成 wrapper 记录每次调用的 prompt 字符数和 provider usage，按真实中文简历样本测 token，而不是用字符数推导 token。
2. 为 `resumeProfile` 和岗位蓝图 payload 增加总量预算；超过预算时优先保留结构化字段、字段级截断和 evidence quote 白名单，避免静默丢掉关键日期/技能。
3. 将 gate/dimension/adjustment/narrative 的输入投影成各自最小 payload；不要让每个 Agent 都接收整个 `StructuredResumeWorkflowInput`，尤其是 `resumeText`、hash、engine metadata 和与该 Agent 无关的规则。
4. 保持 evidence quote catalog 的白名单校验，但把“输入限长”和“证据可引用”分开测试：截断不能导致 quote 指向被截掉的原文，也不能让模型把 JSON 字段名当成证据。
5. 若未来引入 Agent memory、工具调用或 agent loop，再配置 `TokenLimiter`/`ToolCallFilter`；不要把 memory 当成当前一次性评分的默认依赖。
6. 若未来引入 suspend/resume，snapshot 中只保存引用和小型状态；不要直接保存包含完整简历正文的 workflow context/state。

## 最终建议

当前无需把评分 workflow 改成 Agent loop，也无需把评分步骤改成 Tool 链。保留现有七步图和“Agent 产语义事实、代码产可信分数”的边界，优先补齐三类可验证工作：

- 记录并限制各 Agent 的实际 prompt token；
- 为 profile/blueprint/evidence catalog 建立明确总量预算和回归用例；
- 若产品将来需要人工确认，再单独设计带 `resumeSchema`、持久 storage 和小 snapshot 的审核 workflow。

Mastra 官方链接汇总：

- [Workflows overview](https://mastra.ai/docs/workflows/overview)
- [Control flow and input data mapping](https://mastra.ai/docs/workflows/control-flow)
- [Workflow state](https://mastra.ai/docs/workflows/workflow-state)
- [Agents and tools in workflows](https://mastra.ai/docs/workflows/agents-and-tools)
- [Request context](https://mastra.ai/docs/server/request-context)
- [Structured output](https://mastra.ai/docs/agents/structured-output)
- [Streaming and writer events](https://mastra.ai/docs/guides/streaming)
- [Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume)
- [Snapshots](https://mastra.ai/docs/workflows/snapshots)
- [Processors and TokenLimiter](https://mastra.ai/docs/agents/processors)
- [Mastra official repository](https://github.com/mastra-ai/mastra)
- [Mastra core v1.50.1 workflow source](https://github.com/mastra-ai/mastra/blob/%40mastra%2Fcore%401.50.1/packages/core/src/workflows/workflow.ts)
- [Mastra core v1.50.1 step types](https://github.com/mastra-ai/mastra/blob/%40mastra%2Fcore%401.50.1/packages/core/src/workflows/step.ts)
