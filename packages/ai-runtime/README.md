# @app/ai-runtime

服务端 AI 基础运行时，提供 provider-neutral 的模型选择、结构化 JSON 生成和简单文本生成能力。

## 职责与边界

- `src/models.ts` 统一读取模型配置并创建 AI SDK model。
- `src/json-output.ts` 封装带 schema 的结构化生成边界。
- `src/simple-generators.ts` 提供不属于具体业务域的轻量生成原语。
- 本包不拥有招聘提示词、简历评估规则、会议工作流或持久化；这些应留在对应 processing 包或应用中。
- 不依赖 `apps/*`，也不读取浏览器环境。

## 如何修改或新增

| 需求                  | 做法                                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 新增通用模型/provider | 在 `models.ts` 增加明确配置和构造逻辑，保持调用方不感知 provider 细节 |
| 新增结构化输出能力    | 在 `json-output.ts` 扩展通用机制，由调用方传入业务 schema             |
| 新增业务提示词        | 不放这里；放入拥有该业务流程的 package/app                            |
| 新增公开入口          | 创建聚焦模块，并显式加入 `package.json.exports`                       |

修改后运行：

```bash
bun run --filter @app/ai-runtime typecheck
```
