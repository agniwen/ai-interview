# Chat 模型清单维护指南

> 给 AI / 维护者读的操作手册。需要更新模型清单时把这个文档发给 AI，按下面的清单照做即可。

## 单一可信源

`apps/ai-recruitment-copilot-backend/src/server/agents/chat-models.config.ts` 是聊天可选模型的**唯一可信源**。

- 旧模型 picker 显示什么 = `LOCAL_CHAT_MODELS` 里有什么
- 服务端接受什么 id = `LOCAL_CHAT_MODELS` 里有什么
- 客户端没传 model 时落到 `LOCAL_DEFAULT_MODEL_ID`

**不要**再去查百炼 `/models` 接口、`ALIBABA_MODEL` env、`.env.example` 之类的地方——这些跟 picker 都不再有关系。

## 运行时背景

- 运行时仍走阿里云百炼 OpenAI 兼容网关（`https://dashscope.aliyuncs.com/compatible-mode/v1`），所以 `id` 字段必须是百炼**上架的字面 id**，区分大小写（`MiniMax-M2.7` 不是 `minimax-m2.7`）。
- 用户账号必须是百炼**国内 region**——第三方模型（DeepSeek / Kimi / GLM / MiniMax）只在国内 region 提供；新加坡国际版只有 `deepseek-v3.2`。
- 我们当前的 5 个 provider 桶：`alibaba` / `deepseek` / `moonshot` / `zhipu` / `minimax`，另有 `other` 兜底。Workspace Recruiting Copilot 当前不再暴露前端模型 picker；provider 主要用于后端清单分组和将来恢复选择器时复用。

## 字段含义

```ts
{
  id: "qwen3.6-plus",      // 调上游用的字面 id；必须是百炼上架值
  label: "Qwen3.6 Plus",   // 展示文字；可带说明如 "（推理）"
  provider: "alibaba",     // 用于分组；只能用上面列出的 5+1 个值
}
```

## 更新流程（给 AI 的步骤）

### 1. 查百炼当前上架的 id

权威来源（按重要性排序）：

- **首选**：<https://help.aliyun.com/zh/model-studio/newly-released-models> — 模型上下架公告，最新动态
- **次选**：<https://help.aliyun.com/zh/model-studio/models> — 完整模型列表（含规格 / 计费）
- **DeepSeek 专属**：<https://help.aliyun.com/zh/model-studio/deepseek-api> — DeepSeek 在百炼上的 id 一手信息

如果训练数据可能过时（例如距 cutoff 超过 3 个月），**必须** WebSearch / WebFetch 上面三个 URL 之一，不要凭记忆写 id。

### 2. 选品原则

- 每个 provider 1-3 条，覆盖**旗舰 + 备选**两档即可，不要堆所有快照
- 同一家如果新版本（`v4-pro`）覆盖了老版本的能力（`v3.2` + `r1`），用新版替代而不是叠加
- 带日期快照的 id（`qwen3.6-plus-2026-04-02` 这种）不进清单，用别名（`qwen3.6-plus`）保稳健
- 如果某模型自带 hybrid thinking（V4 / K2.6 / GLM-5.x），**不**再单独列对应的推理变体——chat route 已经透传 `enableThinking`

### 3. 改 `LOCAL_CHAT_MODELS`

直接编辑数组。按 provider 分组组织、加注释说明（保持现有风格）。

### 4. 检查 `LOCAL_DEFAULT_MODEL_ID`

如果默认 id 被移出清单了，必须改 `LOCAL_DEFAULT_MODEL_ID` 指向新的存在于清单里的 id。

### 5. 检查前端是否重新暴露模型选择

当前 Workspace Recruiting Copilot 不再暴露前端模型 picker，也没有 session-local model fallback。若未来恢复模型选择器，再为新的前端入口补 provider label/order/fallback。

### 6. 运行验证

```bash
pnpm typecheck    # 必须过
pnpm check        # 必须 0 errors
pnpm test         # 必须全绿（无 model-catalog 相关测试，因为已废弃）
```

如果改了字段形状（例如加了新字段），还要同步仍在消费模型列表的客户端类型。

### 7. dev server 重启

```bash
rm -rf apps/ai-recruitment-copilot/.next
pnpm dev
```

Next.js dev cache 会持有旧模块引用，不清的话本地页面可能短时间显示旧列表。

## 同步检查项（容易漏的）

| 文件                                                                          | 检查点                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/ai-recruitment-copilot-backend/src/server/agents/chat-models.config.ts` | `LOCAL_CHAT_MODELS` + `LOCAL_DEFAULT_MODEL_ID`                                                                                        |
| 前端模型选择入口                                                              | 当前没有；如果重新新增 picker，要同步 provider order/label/fallback                                                                   |
| 客户端模型列表类型                                                            | 如果仍有前端消费模型列表，字段形状需要跟 server 端一致                                                                                |
| `apps/ai-recruitment-copilot-backend/src/server/agents/resume-agent.ts`       | `ALIBABA_MODEL` 由 TanStack Start env 管理注入；不要在 agent 里重新加硬编码 fallback（**简历筛选 agent 专用**，跟 picker 是独立通路） |

## 反模式（不要做）

- ❌ 重新引入 `list-upstream-models.ts` 之类的 `/models` 接口拉取——已经显式删掉了，要它就破坏了本地维护的初衷
- ❌ 在清单里塞带日期的快照 id（`qwen3.6-plus-2026-04-02`）——用别名
- ❌ 重新加 picker 时只改 server 清单、不改前端 provider label/order/fallback
- ❌ 重新依赖 `ALIBABA_MODEL` env 作为聊天默认——picker 跟 chat route 都不再读它

## 当前清单（写文档时的快照，仅供对照）

| Provider | id                    | 用途                           |
| -------- | --------------------- | ------------------------------ |
| alibaba  | `qwen3.6-plus` ⭐默认 | 旗舰，1M context               |
| alibaba  | `qwen3.6-max-preview` | 最强能力                       |
| alibaba  | `qwen3.6-flash`       | 快速/低价                      |
| deepseek | `deepseek-v4-pro`     | DeepSeek 旗舰，hybrid thinking |
| deepseek | `deepseek-v4-flash`   | DeepSeek 低价款                |
| moonshot | `kimi-k2.6`           | Kimi 旗舰，默认开 thinking     |
| zhipu    | `glm-5.1`             | GLM 旗舰                       |
| zhipu    | `glm-4.5-air`         | GLM 轻量                       |
| minimax  | `MiniMax-M2.7`        | MiniMax 旗舰                   |
