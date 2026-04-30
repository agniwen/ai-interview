# 全局面试配置设计 / Global Interview Config Design

## 背景 / Background

当前面试 agent 的开场白、结束语，以及（尚未实现的）公司情况上下文都硬编码在 Python 代码中：

- 开场白：`agent/src/interview_agent.py:114-117` `on_enter()` 内联指令
- 结束语：`agent/src/interview_agent.py:44-48` `EndCallTool(end_instructions=...)` 与 `agent/src/agent.py:238` 的兜底告别文案
- 公司情况：当前不存在

需求是把这三项做成"全局配置"——管理员可在 Studio 后台编辑、整个系统共用同一份。

## 设计决策 / Decisions

| 维度              | 选择                                                      |
| ----------------- | --------------------------------------------------------- |
| 配置作用域        | 单条全局单例配置（不按岗位/面试官覆盖）                   |
| 开场白/结束语语义 | 指令模板，让 LLM 演绎（与现状一致）                       |
| 公司情况注入位置  | 注入到系统提示（`build_instructions`），让 LLM 全程可参考 |
| 权限              | 仅管理员（沿用 `canAccessAdmin`）                         |
| 数据落地          | 新建 `global_config` 表（结构化字段、单行）               |

## 架构 / Architecture

```
┌─────────────────┐   GET/PUT /api/global-config   ┌──────────────────┐
│  Studio UI      │ ─────────────────────────────► │  Hono route      │
│  /studio/       │                                │  + admin mw      │
│  global-config  │ ◄───────────────────────────── │                  │
└─────────────────┘                                └──────────────────┘
                                                            │
                                                            ▼
                                                  ┌──────────────────┐
                                                  │ global_config    │
                                                  │ (singleton row)  │
                                                  └──────────────────┘
                                                            │ read on
                                                            │ token issue
                                                            ▼
┌─────────────────┐   participant.metadata (JSON)  ┌──────────────────┐
│ /api/interview/ │ ─────────────────────────────► │  Python agent    │
│ ...token        │                                │  (build_instr.,  │
│                 │                                │   on_enter,      │
│                 │                                │   end_call)      │
└─────────────────┘                                └──────────────────┘
```

## 数据层 / Data Layer

### 新表 `global_config`

文件：`src/lib/db/schema.ts`

```ts
// 全局配置（单例表）/ Global config (singleton table)
export const globalConfig = pgTable("global_config", {
  id: text("id").primaryKey().default("singleton"),
  openingInstructions: text("opening_instructions").notNull().default(""),
  closingInstructions: text("closing_instructions").notNull().default(""),
  companyContext: text("company_context").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id),
});
```

**单例约束：** 通过固定 `id = 'singleton'` 保证只有一行；`PUT` 用 upsert（`onConflictDoUpdate` on `id`）。

**默认值：** 全部空串。空串被视作"未配置"，agent 端 fallback 到现有硬编码文案，保证向后兼容。

### 查询模块

文件：`src/server/queries/global-config.ts`

```ts
export async function getGlobalConfig(): Promise<GlobalConfig> {
  const row = await db.query.globalConfig.findFirst({
    where: eq(globalConfig.id, "singleton"),
  });
  return (
    row ?? {
      id: "singleton",
      openingInstructions: "",
      closingInstructions: "",
      companyContext: "",
      updatedAt: new Date(),
      updatedBy: null,
    }
  );
}

export async function upsertGlobalConfig(input, userId): Promise<GlobalConfig> {
  // upsert by id='singleton'
}
```

## 后端 API / Backend API

### 新路由

文件：`src/server/routes/global-config/route.ts`，挂载到 `/api/global-config`，整路由套 `adminMiddleware`（参考 `src/server/middlewares/admin.ts`）。

| 方法  | 路径 | 入参                                                           | 返回                                                                      |
| ----- | ---- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GET` | `/`  | —                                                              | `{ openingInstructions, closingInstructions, companyContext, updatedAt }` |
| `PUT` | `/`  | `{ openingInstructions, closingInstructions, companyContext }` | 同上                                                                      |

校验用 zod；三个字段都为 `string`，无长度上限（实际 textarea 长度由前端约束）。

## Web UI

### 侧边栏 / Sidebar

文件：`src/app/(auth)/studio/_components/studio-sidebar-slots.tsx`

在 `navGroups` 末尾追加新组：

```ts
{
  items: [
    {
      href: '/studio/global-config',
      icon: SettingsIcon,
      title: '全局配置',
    },
  ],
  label: '系统配置',
}
```

### 页面 / Page

路径：`src/app/(auth)/studio/global-config/page.tsx`

- Server Component，加载初始配置 → 渲染 `<GlobalConfigForm initial={...} />`
- 表单组件 Client Component，三个 `<Textarea>`（开场白指令 / 结束语指令 / 公司情况），下方"保存"按钮
- 每个字段下面附简短帮助文字，并提示可用占位符 `{候选人姓名}` `{岗位}`（提示词，由 LLM 自行替换，非字面替换）
- 保存逻辑：`fetch('/api/global-config', { method: 'PUT', body })`，成功后 toast 提示
- 复用项目现有 form pattern（参考 `src/app/(auth)/studio/interviewers/`、`src/app/(auth)/studio/departments/`）

## Web → Agent 数据传递 / Metadata

文件：`src/server/routes/interview/route.ts`（约 188 行 `participantMetadata` 构造处）

token 颁发时同步读取一次全局配置：

```ts
const cfg = await getGlobalConfig();
const participantMetadata = JSON.stringify({
  // ...existing fields
  global_opening_instructions: cfg.openingInstructions,
  global_closing_instructions: cfg.closingInstructions,
  global_company_context: cfg.companyContext,
});
```

## Agent 端改动 / Agent Changes

### `agent/src/prompts.py` `build_instructions`

在现有 `prefix_sections` 拼接逻辑中追加：

```python
global_company_context = (interview_context.get("global_company_context") or "").strip()
# ...
if global_company_context:
    prefix_sections += f"## 公司情况\n{global_company_context}\n\n"
```

位置：放在"面试官角色设定"之后、"岗位说明"之前。空值不渲染该段。

### `agent/src/interview_agent.py`

**默认 fallback 常量**（顶部新增）：

```python
DEFAULT_OPENING_INSTRUCTIONS = (
    '用候选人的名字"{candidate_name}"打招呼，简短介绍你是今天"{target_role}"岗位的'
    '面试官，告知面试即将开始，准备好了就确认开始。语气友好专业，一两句话即可。'
)
DEFAULT_CLOSING_INSTRUCTIONS = "感谢候选人参加本次面试，祝你一切顺利。"
```

**`__init__` 改动：**

```python
opening = (interview_context.get("global_opening_instructions") or "").strip()
closing = (interview_context.get("global_closing_instructions") or "").strip()
self._opening_instructions = opening or DEFAULT_OPENING_INSTRUCTIONS.format(
    candidate_name=..., target_role=...
)
self._closing_instructions = closing or DEFAULT_CLOSING_INSTRUCTIONS

end_call_tool = EndCallTool(
    extra_description="...",
    delete_room=True,
    end_instructions=self._closing_instructions,
)
```

**`on_enter` 改动：**

```python
async def on_enter(self):
    instructions = (
        f"{self._opening_instructions}\n\n"
        f"候选人姓名：{self._candidate_name}；岗位：{self._target_role}"
    )
    await self.session.generate_reply(instructions=instructions)
```

候选人姓名/岗位以"补充信息"形式追加到指令尾部，LLM 自行决定如何引用。这样自定义开场白指令不必硬约定占位符语法。

### `agent/src/agent.py:238` 兜底告别

将硬编码 `"祝其一切顺利，然后告知面试到此结束，不要继续提问。"` 改为引用同一个 `closing_instructions`（保持开场/结束的来源一致）。具体做法：把 `closing_instructions` 经 `interview_agent` 暴露的属性传出来后拼接使用。

## 错误处理 / Error Handling

| 场景                                                 | 行为                                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `global_config` 表为空 / 行不存在                    | `getGlobalConfig` 返回空串字段 → metadata 传空串 → agent fallback 到默认硬编码 → 行为与现状一致 |
| metadata 缺少新字段（旧 web 部署 + 新 agent 或反之） | `.get(key, "")` → 同上 fallback                                                                 |
| 非管理员访问 API                                     | `adminMiddleware` 返回 403                                                                      |
| 保存失败                                             | 表单 toast 报错，不修改本地状态                                                                 |

向后兼容：先部署 web（建表 + 默认空配置），再部署 agent；过渡期 agent 不读新字段也无问题。

## 测试 / Testing

### Web

文件：`src/server/routes/global-config/__tests__/route.test.ts`

- 非 admin → 403
- admin GET 空表 → 返回三个空串
- admin PUT → 再 GET 返回新值
- PUT 第二次（同 singleton id）→ 更新而非创建新行

参考：`src/server/feishu/__tests__/router.test.ts`

### Agent

文件：`agent/tests/test_prompts.py`（新增或扩展）

- `build_instructions` 传入非空 `global_company_context` → 输出包含 `## 公司情况` 与该文本
- 传入空串 → 输出不包含 `## 公司情况`

文件：`agent/tests/test_interview_agent.py`（新增或扩展）

- 传入非空 `global_opening_instructions` → `self._opening_instructions` 等于该值（不带 `{candidate_name}` 替换，因为指令模板里这个占位符是给 LLM 看的）
- 传入空 → 等于 `DEFAULT_OPENING_INSTRUCTIONS` 经候选人/岗位格式化后的值
- 传入非空 `global_closing_instructions` → `EndCallTool` 收到该值

UI 层不写 e2e；手动验证保存与回显。

## 部署顺序 / Rollout

1. 合并并迁移 schema：`npm run db:push`（新表创建，默认无行）
2. 部署 web：管理员可编辑配置，但旧 agent 还没读新字段（无影响）
3. 部署 agent：开始消费新字段；空配置时仍走 fallback
4. 管理员在 `/studio/global-config` 录入实际文案

## 范围之外 / Out of Scope

- 多版本 / 历史回滚
- 按岗位或面试官覆盖
- 字面文案模板（逐字念）模式
- i18n 多语言配置
- 富文本编辑器（保持纯 textarea）
