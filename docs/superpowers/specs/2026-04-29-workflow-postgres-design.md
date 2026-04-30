# 集成 Vercel Workflow（Postgres world）实现可恢复的简历筛选 chat

**日期：** 2026-04-29
**作者：** Claude (with @sakurawen)
**状态：** Implemented（2026-04-30）

## 背景

`POST /api/resume` 是简历筛选的流式聊天端点。当前实现：

- 客户端 `useChat` + `DefaultChatTransport`
- 服务端 `runResumeScreening()` → `ToolLoopAgent` → `result.toUIMessageStreamResponse()`
- 消息持久化在 `onFinish` 回调里 fire-and-forget
- 无重连能力：客户端断网/刷新即丢失正在进行的回答

问题：长时间生成（特别是带 `enableThinking`）时，移动端切后台 / 网络抖动会让用户失去当前回答。`onFinish` 回调在 client abort 时**不会触发**，`chat_message` 也写不进去，最终用户重开页面只能看到自己刚发出去的 user message，没有 assistant 回复。

## 目标

引入 Vercel `workflow` 包，把 `/api/resume` 的执行从 HTTP 请求生命周期里**解耦到服务端持久任务**。客户端断开不影响服务端继续推进 LLM 流；重连时凭 `runId` 续读流的尾部。

非目标：

- 把 agent 多步推理重构成多个独立 step（粗粒度包裹即可，见「实现骨架」）
- LiveKit 语音面试相关的 workflow 化
- run 治理 UI / cancel UI

## 关键决策

| #   | 决策               | 选项                                                  | 选定                               |
| --- | ------------------ | ----------------------------------------------------- | ---------------------------------- |
| 1   | 集成范围           | A: 仅 `/api/resume` / B: A + Postgres world / C: 更大 | B                                  |
| 2   | `runId` 持久化位置 | A: DB 列 / B: localStorage / C: 两者                  | A（DB 真源 + localStorage 快路径） |
| 3   | workflow 内部粒度  | A: 粗粒度 1 step / B: 每次 LLM 一个 step / C: 折中    | A                                  |
| 4   | 重连端点路由风格   | A: Hono / B: Next 原生                                | A                                  |
| 5   | workflow 文件位置  | A: `src/app/workflows/` / B: `src/server/workflows/`  | B                                  |
| 6   | 回滚保险           | A: 运行时 flag / B: 直接全切 + git revert             | B                                  |

## 总体架构

```
                 浏览器
                    │
     ┌──────────────┴──────────────┐
     │  useChat + WorkflowChatTransport (@workflow/ai)
     │   ├─ POST /api/resume                       → 启动 run
     │   └─ GET  /api/resume/:runId/stream         → 重连续读
     └──────────────┬──────────────┘
                    │
        Next.js 进程（Docker / standalone）
        ┌───────────┴───────────────────────┐
        │  Hono /api/resume 路由             │
        │  ├ POST  → start(runResumeChatWf)  │
        │  │        → 返回 run.readable       │
        │  └ GET   → getRun(runId)            │
        │           .getReadable({startIndex})│
        │                                    │
        │  src/server/workflows/             │
        │  └ resume-chat.ts                  │     instrumentation.ts
        │    "use workflow"                  │     └ getWorld().start()
        │    ├ step: runScreeningAndStream() │       (Node 启动时拉 PG worker)
        │    └ step: persistAssistantMessage │
        └───────────┬───────────────────────┘
                    │
            PostgreSQL（同一个 DATABASE_URL）
            ├ chat_conversation（已有，加列 active_workflow_run_id）
            ├ chat_message（已有）
            └ workflow_*（新建，由 workflow-postgres-setup CLI 管理）
```

**职责划分：**

- `withWorkflow`（`workflow/next`）在编译期识别 `"use workflow"` / `"use step"` 指令，改写为可恢复的执行单元
- `instrumentation.ts` 在 Node runtime 启动时拉起 PG world 后台 worker（拉队列、推进 run）
- workflow run 的生命周期完全活在服务端：客户端断开不影响 run 继续跑
- 客户端只订阅 `getReadable()` 流；重连时凭 `runId` 重新拿到同一个流的尾部继续读

**关键不变量：**

- 一个 `chat_conversation` 同一时刻最多有 1 个 active run（由 `active_workflow_run_id` + 幂等 claim 强制）
- run 终结（completed / cancelled / failed）后必须把 `active_workflow_run_id` 清空（CAS）
- assistant message 持久化逻辑搬进 workflow step 内 —— 关键原因：`onFinish` 在客户端断开时不触发，但 step 一定会跑完

## 数据库 schema 改动

### 1. `chat_conversation` 加列（Drizzle 管理）

```ts
// src/lib/db/schema.ts —— chatConversation 表内追加
activeWorkflowRunId: text('active_workflow_run_id'),  // nullable
```

部分索引（仅索引非 NULL 行）：

```ts
index("chat_conversation_active_run_idx")
  .on(table.activeWorkflowRunId)
  .where(sql`active_workflow_run_id IS NOT NULL`);
```

### 2. workflow 自身表（CLI 管理，不入 Drizzle schema）

`npx workflow-postgres-setup` 在 `DATABASE_URL` 上幂等创建 `workflow_*` 表。**不要写进 Drizzle schema** —— 否则 `db:push` / `db:generate` 会把 SDK 的表当成 drift 处理，反复尝试同步。

新增聚合脚本：

```jsonc
// package.json
"scripts": {
  "db:setup": "pnpm db:migrate && pnpm dlx workflow-postgres-setup"
}
```

部署流水线和本地 onboarding 都改用 `db:setup`。

### 3. `chat_message` 不变

只是写入位点从 `onFinish` 回调搬进 workflow step，schema 不动。

## 文件清单

### 新增

```
src/server/workflows/resume-chat.ts        ← "use workflow" + 两个 "use step"
src/server/queries/workflow-runs.ts        ← claim / clear / find by runId
instrumentation.ts                          ← Next 根目录，启动 PG world
```

### 改动

```
next.config.ts                              ← 包一层 withWorkflow
src/lib/db/schema.ts                        ← chat_conversation 加列
src/server/routes/resume/route.ts           ← POST 改 start()，新增 GET :runId/stream
src/app/(auth)/chat/_components/
  └─ chat-transport.ts                      ← 替换为 WorkflowChatTransport
src/app/(auth)/chat/_components/
  └─ chat-page-client.tsx                   ← 加 mount-time resume 逻辑
src/server/queries/chat.ts                  ← 改 conversation 查询返回 activeWorkflowRunId
package.json                                ← 加 workflow / @workflow/ai 依赖 + db:setup 脚本
.env.example                                ← 加 WORKFLOW_TARGET_WORLD
```

## 实现骨架

### `src/server/workflows/resume-chat.ts`

```ts
import { getWritable } from "workflow";
import type { UIMessageChunk, UIMessage } from "ai";

type WorkflowInput = {
  conversationId: string;
  userId: string;
  messages: UIMessage[];
  jobDescription?: string;
  enableThinking?: boolean;
  trigger?: "submit-user-message" | "regenerate-message";
  regenerateMessageId?: string;
};

export async function runResumeChatWorkflow(input: WorkflowInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const assistantMessage = await runScreeningAndStream(input, writable);

  await persistAssistantMessage({
    conversationId: input.conversationId,
    message: assistantMessage,
  });

  await clearActiveWorkflowRunIdStep(input.conversationId);
}

async function runScreeningAndStream(
  input: WorkflowInput,
  writable: ReturnType<typeof getWritable<UIMessageChunk>>,
): Promise<UIMessage> {
  "use step";
  // 复用 runResumeScreening。把 result.toUIMessageStream() 的 chunk
  // 逐块写进 writable，结束时返回累积出的完整 assistant message。
  // 实现细节：可在迭代 chunk 时同时累积成 message（AI SDK 提供 helper）。
}

async function persistAssistantMessage(args: { conversationId: string; message: UIMessage }) {
  "use step";
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId);
}
```

**约束：**

- workflow 入参要可序列化（PG 存储）。`messages` 里附件/图片的大字段要在入参前裁剪（保留现有 `stripNonImageFileParts` 等逻辑）
- step 之间通过返回值传 assistant message —— 引擎序列化入库。assistant message 通常只是 LLM 文本/思考/tool-call 元数据，体积不大；但工具返回的 PDF 解析结果等大对象不要直接塞进 message，按现有实现走中间存储 + 引用即可
- `getWritable<UIMessageChunk>()` 类型对齐 `ai` 包；客户端 `WorkflowChatTransport` 按此反序列化
- step 内部不要直接 throw 业务可恢复错误（会触发 workflow 重试整个 step）—— 把"用户级"错误（鉴权、参数校验）留在 POST 路由里挡掉，step 抛错应只代表系统故障

### `POST /api/resume`（Hono）

```ts
import { start, getRun } from 'workflow/api';
import { runResumeChatWorkflow } from '@/server/workflows/resume-chat';

.post('/', zValidator('json', resumeChatRequestSchema), async (c) => {
  const { conversationId, messages, jobDescription, enableThinking,
          trigger, regenerateMessageId } = c.req.valid('json');
  const userId = c.var.session.userId;

  // 1. 复用已有 active run（用户重发同一条 / 多 tab 同时打开）
  const existing = await getActiveWorkflowRunId(conversationId);
  if (existing) {
    const existingRun = getRun(existing);
    const status = await existingRun.status;
    if (status === 'running') {
      return c.body(existingRun.readable, 200, {
        'x-workflow-run-id': existing,
        'content-type': 'text/event-stream',
      });
    }
    await clearActiveWorkflowRunId(conversationId, existing);
  }

  // 2. 启动新 run
  const run = await start(runResumeChatWorkflow, [{
    conversationId, userId, messages, jobDescription, enableThinking,
    trigger, regenerateMessageId,
  }]);

  // 3. CAS claim
  const claimed = await claimActiveWorkflowRunId(conversationId, run.runId);
  if (!claimed) {
    await run.cancel?.();
    return c.json({ error: 'concurrent_run_started' }, 409);
  }

  return c.body(run.readable, 200, {
    'x-workflow-run-id': run.runId,
    'content-type': 'text/event-stream',
  });
})
```

### `GET /api/resume/:runId/stream`（Hono，新增）

```ts
.get('/:runId/stream', async (c) => {
  const runId = c.req.param('runId');
  const userId = c.var.session.userId;
  const startIndex = c.req.query('startIndex');

  // 越权校验
  const conversation = await findConversationByActiveRunId(runId, userId);
  if (!conversation) {
    return c.body(null, 204);
  }

  const run = getRun(runId);
  const status = await run.status;
  if (status === 'completed' || status === 'cancelled' || status === 'failed') {
    await clearActiveWorkflowRunId(conversation.id, runId);
    return c.body(null, 204);
  }

  const readable = run.getReadable({
    startIndex: startIndex ? Number.parseInt(startIndex, 10) : undefined,
  });
  const tailIndex = await readable.getTailIndex();

  return c.body(readable, 200, {
    'x-workflow-stream-tail-index': String(tailIndex),
    'content-type': 'text/event-stream',
  });
})
```

### DB helpers — `src/server/queries/workflow-runs.ts`

```ts
// 幂等 claim：未占用 OR 占用者就是自己时写入
export async function claimActiveWorkflowRunId(
  conversationId: string,
  runId: string,
): Promise<boolean> {
  const result = await db
    .update(chatConversation)
    .set({ activeWorkflowRunId: runId })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        or(
          isNull(chatConversation.activeWorkflowRunId),
          eq(chatConversation.activeWorkflowRunId, runId),
        ),
      ),
    )
    .returning({ id: chatConversation.id });
  return result.length > 0;
}

// CAS 清除：仅当当前列等于预期 runId 时才清空（防止误清新 run）
export async function clearActiveWorkflowRunId(
  conversationId: string,
  expectedRunId?: string,
): Promise<void> {
  await db
    .update(chatConversation)
    .set({ activeWorkflowRunId: null })
    .where(
      and(
        eq(chatConversation.id, conversationId),
        expectedRunId
          ? eq(chatConversation.activeWorkflowRunId, expectedRunId)
          : sql`active_workflow_run_id IS NOT NULL`,
      ),
    );
}

export async function getActiveWorkflowRunId(conversationId: string): Promise<string | null> {
  const [row] = await db
    .select({ activeWorkflowRunId: chatConversation.activeWorkflowRunId })
    .from(chatConversation)
    .where(eq(chatConversation.id, conversationId))
    .limit(1);
  return row?.activeWorkflowRunId ?? null;
}

// 重连端点用：校验 runId 归属当前 user 的 conversation
export async function findConversationByActiveRunId(runId: string, userId: string) {
  const [row] = await db
    .select()
    .from(chatConversation)
    .where(
      and(eq(chatConversation.activeWorkflowRunId, runId), eq(chatConversation.userId, userId)),
    )
    .limit(1);
  return row ?? null;
}
```

## 客户端改动

### `chat-transport.ts`

```ts
import { WorkflowChatTransport } from "@workflow/ai";

export function createChatTransport(getSnapshot: () => ChatMetaSnapshot) {
  return new WorkflowChatTransport({
    api: "/api/resume",
    body: () => {
      const meta = getSnapshot();
      return {
        conversationId: meta.conversationId,
        jobDescription: meta.jobDescription,
        enableThinking: meta.enableThinking,
      };
    },
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      const conversationId = getSnapshot().conversationId;
      if (runId && conversationId) {
        localStorage.setItem(`active-run:${conversationId}`, runId);
      }
    },
    onChatEnd: () => {
      const conversationId = getSnapshot().conversationId;
      if (conversationId) {
        localStorage.removeItem(`active-run:${conversationId}`);
      }
    },
    prepareReconnectToStreamRequest: ({ api, ...rest }) => {
      const snap = getSnapshot();
      const runId =
        snap.initialActiveRunId ?? localStorage.getItem(`active-run:${snap.conversationId}`);
      if (!runId) throw new Error("No active workflow run");
      return { ...rest, api: `/api/resume/${encodeURIComponent(runId)}/stream` };
    },
  });
}
```

`localStorage` 是快路径提示，**真源是 `chat_conversation.active_workflow_run_id`**（SSR 注入到客户端首屏）。

### `chat-page-client.tsx`

```ts
const initialActiveRunId = props.initialConversation?.activeWorkflowRunId ?? null;

const shouldResumeOnMountRef = useRef(
  Boolean(initialActiveRunId) && boundChat?.status !== 'streaming',
);

const { ... } = useChat({
  chat: boundChat,
  resume: shouldResumeOnMountRef.current,
  experimental_throttle: 50,
});
```

`useChat` 看到 `resume: true` 时会在 mount 后自动调 `prepareReconnectToStreamRequest` 拼出的重连 URL。

## 启动配置

### `next.config.ts`

```ts
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  output: "standalone",
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  transpilePackages: ["@repo/adapter-feishu"],
};

export default withWorkflow(nextConfig);
```

### `instrumentation.ts`（项目根）

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWorld } = await import("workflow/runtime");
    const world = await getWorld();
    await world.start?.();
  }
}
```

用 `=== 'nodejs'` 比官方示例 `!== 'edge'` 更严格 —— 构建期 `NEXT_RUNTIME` 为 `undefined`，避免误启动。

### `.env.example`

```
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
# 不设置则回落到 DATABASE_URL；如果 workflow 表想放别的库再设：
# WORKFLOW_POSTGRES_URL=postgres://...
# WORKFLOW_POSTGRES_MAX_POOL_SIZE=10
```

## 依赖增量

```jsonc
"dependencies": {
  "workflow": "^4.2.0",
  "@workflow/ai": "^4.1.0",
  "@workflow/world-postgres": "^4.1.1"   // 已有
}
```

实施时先 `pnpm view workflow versions` 确认最新稳定/beta 版本号，与 `@workflow/ai`、`@workflow/world-postgres` 对齐到同一 major。如果 4.2 系列尚无 stable，可参考 open-agents 用 `^4.2.0-beta.72`。

## 错误与边界场景

| 场景                          | 处理                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| step 抛错                     | workflow 引擎按重试策略重试；最终失败则 run `failed`，流以错误结束，客户端 `useChat` 进入 `error` |
| 重连时 run 已 `completed`     | GET 返回 204，清理 `activeWorkflowRunId`；SSR 拿到的 messages 已含完整结果                        |
| 重连时 run 还在跑             | `getReadable({ startIndex })` 续读；`startIndex` 由 `WorkflowChatTransport` 自动管理              |
| POST 时已有 active run        | 复用旧 run 的 `readable`（用户感知无缝）                                                          |
| `claim` 因并发失败            | 取消刚启的 run，返回 409，客户端可重试                                                            |
| `instrumentation.ts` 启动失败 | Next 进程崩溃 — 是希望的行为                                                                      |
| run 卡死（worker 挂）         | 不在本期处理；运维通过 `workflow_*` 表自查                                                        |
| DELETE conversation           | 同步 `run.cancel?.()` 并清 `activeWorkflowRunId`                                                  |

## 回滚

直接全切。出问题 `git revert` workflow 相关 commits；`workflow_*` 表留着不影响旧路径。

## 测试策略

- **单元测试（Vitest + 真实 PG）：**
  - `claimActiveWorkflowRunId` / `clearActiveWorkflowRunId` 的 CAS 行为
  - `findConversationByActiveRunId` 越权检查
- **不写 workflow 引擎集成测**（引擎自身已测试，step 内部都是现成函数调用）
- **手测端到端：**
  1. 正常 chat：发消息 → 流式回复 → 刷新页面 → 上一条已落库
  2. 重连：发消息 → airplane mode 5 秒 → 恢复 → 流应接上继续
  3. 跨设备：A 发起 → B 打开同一 conversation → 看到 A 的流
  4. 终态后刷新：流结束 5 秒后刷新 → 显示历史，不触发重连
- **回归：** conversation CRUD、metadata patch、列表 不应受影响

## 不在范围（YAGNI）

- workflow 多步 agent loop（粗粒度方案已涵盖）
- 跨 conversation 的 run 治理面板
- run 取消的 UI 按钮
- 多副本 Next 进程的额外协调（PG world 自带 DB 锁）
- `interview` LiveKit 相关 workflow 化

## Open questions

- `workflow` 主包当前是否有 4.2 stable 版本？实施时先 `pnpm view workflow versions` 确认；若仅 beta，则锁定与 `@workflow/world-postgres@4.1.1` 兼容的 beta 号
- `WorkflowChatTransport` 的 `prepareReconnectToStreamRequest` 在 SSR 注入 `initialActiveRunId` 之外是否还有更原生的 hydrate 钩子？实施时再核 `@workflow/ai` API
