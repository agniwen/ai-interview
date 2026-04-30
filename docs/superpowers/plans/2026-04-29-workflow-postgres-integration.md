# Workflow + Postgres World 集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `POST /api/resume` 包成 Vercel `workflow`，并启用 `@workflow/world-postgres` 做持久化，让简历筛选 chat 在客户端断网/刷新后能从服务端续读流。

**Architecture:** 服务端 workflow 内部 1 个粗粒度 step 跑 LLM、1 个 step 持久化、1 个 step 清理 runId；客户端 `useChat` 用 `WorkflowChatTransport`，通过 `chat_conversation.active_workflow_run_id` 列做跨设备/刷新恢复。

**Tech Stack:** `workflow@^4.2.x` + `@workflow/ai@^4.x` + `@workflow/world-postgres@4.1.1`、Drizzle ORM、Hono、Next.js 16 App Router、`@ai-sdk/react` `useChat`。

**Spec:** `docs/superpowers/specs/2026-04-29-workflow-postgres-design.md`

---

## File Structure

| 路径                                                   | 类型 | 责任                                                                      |
| ------------------------------------------------------ | ---- | ------------------------------------------------------------------------- |
| `next.config.ts`                                       | 改   | 用 `withWorkflow` 包裹，启用 `"use workflow"` 编译期改写                  |
| `instrumentation.ts`                                   | 新   | Node runtime 启动 PG world worker                                         |
| `.env.example`                                         | 改   | 补 `WORKFLOW_TARGET_WORLD`                                                |
| `package.json`                                         | 改   | 加 `workflow` / `@workflow/ai` 依赖 + `db:setup` 脚本                     |
| `src/lib/db/schema.ts`                                 | 改   | `chat_conversation` 加 `active_workflow_run_id` 列                        |
| `src/server/queries/workflow-runs.ts`                  | 新   | `claim` / `clear` / `getActive` / `findConversationByActiveRunId`         |
| `src/server/queries/workflow-runs.test.ts`             | 新   | CAS / 越权校验单测                                                        |
| `src/server/queries/chat.ts`                           | 改   | `getUserConversation` 返回 `activeWorkflowRunId`                          |
| `src/server/workflows/resume-chat.ts`                  | 新   | `runResumeChatWorkflow` + 3 个 step                                       |
| `src/server/routes/resume/route.ts`                    | 改   | POST 改 `start(workflow)`、新增 `GET /:runId/stream`                      |
| `src/server/routes/resume/screening.ts`                | 改   | 新增导出 helper：把 stream 累积成 UIMessage                               |
| `src/app/(auth)/chat/_lib/chat-transport.ts`           | 改   | `DefaultChatTransport` → `WorkflowChatTransport`                          |
| `src/app/(auth)/chat/_lib/chat-registry.ts`            | 改   | `getOrCreateChat` 接受 `initialActiveRunId` 做 mount-time resume          |
| `src/app/(auth)/chat/_components/chat-page-client.tsx` | 改   | 把 `initialActiveRunId` 从 SSR 数据传到 registry 与 `useChat({ resume })` |

---

## Task 1: 安装依赖与环境变量

**Files:**

- Modify: `package.json` 依赖 + scripts
- Modify: `.env.example`

- [ ] **Step 1: 检查 `workflow` 主包最新版本**

```bash
pnpm view workflow versions --json | tail -20
pnpm view @workflow/ai versions --json | tail -10
```

预期：能看到 4.2.0-beta.x 或 stable 版本号。记下与 `@workflow/world-postgres@4.1.1` 同 major（4.x）的版本。

- [ ] **Step 2: 安装 `workflow` 和 `@workflow/ai`**

按 Step 1 看到的最新可用 4.2.x（若有 stable 用 stable，否则用最新 beta，参考 open-agents 用 `^4.2.0-beta.72`）：

```bash
pnpm add workflow@^4.2.0-beta.72 @workflow/ai@^4.2.0-beta.72
```

如果 `@workflow/ai` 在 npm 上无 4.2.0 系列，用 `pnpm view @workflow/ai versions --json` 找到与 `workflow` 同 major 的最高版本号。

- [ ] **Step 3: 验证依赖装上**

```bash
grep -E '"workflow"|"@workflow/ai"|"@workflow/world-postgres"' package.json
```

预期：三个 key 都在 dependencies 里，版本号是同 major（都是 4.x）。

- [ ] **Step 4: 在 `.env.example` 增加 workflow 相关 env**

`.env.example` 末尾追加：

```
# ────── Workflow（@workflow/world-postgres）──────
WORKFLOW_TARGET_WORLD=@workflow/world-postgres
# 不设置则回落到 DATABASE_URL；如果想让 workflow 表落到独立库，再启用：
# WORKFLOW_POSTGRES_URL=postgres://...
# WORKFLOW_POSTGRES_MAX_POOL_SIZE=10
```

- [ ] **Step 5: 在 `package.json` 增加 `db:setup` 脚本**

把 `scripts` 块里现有的 `db:migrate` 之外，增加：

```json
"db:setup": "pnpm db:migrate && pnpm dlx workflow-postgres-setup"
```

并更新 README 里"安装/启动"章节（如有）：本地 onboarding 与生产部署都使用 `pnpm db:setup` 而不是裸 `db:migrate`。如果 README 没相关章节就跳过。

- [ ] **Step 6: 在 `.env` 里加上变量（仅本地）**

```bash
# 把 .env.example 里新加的两行复制到本地 .env
# 不要 commit
echo 'WORKFLOW_TARGET_WORLD=@workflow/world-postgres' >> .env
```

注意：`.env` 在 `.gitignore` 里，不会被提交。

- [ ] **Step 7: 跑 workflow 表迁移**

```bash
pnpm dlx workflow-postgres-setup
```

预期：CLI 报告创建/确认了一组 `workflow_*` 表（runs/steps/queues/locks 之类），无错误退出。可以用 `psql $DATABASE_URL -c "\dt workflow*"` 抽查。

- [ ] **Step 8: 提交**

```bash
git add package.json pnpm-lock.yaml .env.example
git commit -m "chore(workflow): add workflow + @workflow/ai deps and db:setup script"
```

---

## Task 2: 添加 `chat_conversation.active_workflow_run_id` 列

**Files:**

- Modify: `src/lib/db/schema.ts:429-451`

- [ ] **Step 1: 修改 `chatConversation` 表定义**

在 `src/lib/db/schema.ts` 第 429-451 行，把表内追加一列 `activeWorkflowRunId` 并新增部分索引：

```ts
export const chatConversation = pgTable(
  "chat_conversation",
  {
    activeWorkflowRunId: text("active_workflow_run_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    isTitleGenerating: boolean("is_title_generating").default(false).notNull(),
    jobDescription: text("job_description").default("").notNull(),
    jobDescriptionConfig: jsonb("job_description_config").$type<JobDescriptionConfig>(),
    resumeImports: jsonb("resume_imports").$type<Record<string, string>>().default({}).notNull(),
    title: text("title").default("").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("chat_conversation_user_id_idx").on(table.userId),
    index("chat_conversation_user_updated_idx").on(table.userId, table.updatedAt),
    index("chat_conversation_active_run_idx")
      .on(table.activeWorkflowRunId)
      .where(sql`${table.activeWorkflowRunId} IS NOT NULL`),
  ],
);
```

确认文件顶部已经从 `drizzle-orm` 导入 `sql`；如果没有就加上。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。如果 `sql` 找不到，回到 Step 1 检查 import。

- [ ] **Step 3: 生成迁移**

```bash
pnpm db:generate
```

预期：`src/lib/db/migrations/` 下生成新 SQL 文件，内容包含 `ALTER TABLE chat_conversation ADD COLUMN active_workflow_run_id text` 和 `CREATE INDEX ... WHERE active_workflow_run_id IS NOT NULL`。

- [ ] **Step 4: 应用迁移**

```bash
pnpm db:migrate
```

预期：SQL 应用到本地 PG。可用 `psql $DATABASE_URL -c "\d chat_conversation"` 抽查列存在。

- [ ] **Step 5: 提交**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/
git commit -m "feat(db): add chat_conversation.active_workflow_run_id column"
```

---

## Task 3: workflow-runs.ts 查询 + 单测（TDD）

**Files:**

- Create: `src/server/queries/workflow-runs.ts`
- Create: `src/server/queries/workflow-runs.test.ts`

测试用真实 PG（vitest 已 `loadEnv()`，会读 `.env` 的 `DATABASE_URL`）。每个用例创建唯一 conversation 然后清理。

- [ ] **Step 1: 写单测（先红）**

`src/server/queries/workflow-runs.test.ts`：

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { chatConversation, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  claimActiveWorkflowRunId,
  clearActiveWorkflowRunId,
  findConversationByActiveRunId,
  getActiveWorkflowRunId,
} from "./workflow-runs";

describe("workflow-runs queries", () => {
  let userId: string;
  let conversationId: string;

  beforeEach(async () => {
    userId = `test-user-${nanoid(8)}`;
    conversationId = `test-conv-${nanoid(8)}`;
    await db.insert(user).values({
      id: userId,
      email: `${userId}@test.local`,
      emailVerified: false,
      name: "Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(chatConversation).values({
      id: conversationId,
      userId,
      title: "test",
    });
  });

  afterEach(async () => {
    await db.delete(chatConversation).where(eq(chatConversation.id, conversationId));
    await db.delete(user).where(eq(user.id, userId));
  });

  describe("claimActiveWorkflowRunId", () => {
    it("claims when column is NULL", async () => {
      const ok = await claimActiveWorkflowRunId(conversationId, "run-A");
      expect(ok).toBe(true);
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
    });

    it("is idempotent — same runId can re-claim", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const ok = await claimActiveWorkflowRunId(conversationId, "run-A");
      expect(ok).toBe(true);
    });

    it("rejects when a different runId already owns the conversation", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const ok = await claimActiveWorkflowRunId(conversationId, "run-B");
      expect(ok).toBe(false);
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
    });
  });

  describe("clearActiveWorkflowRunId", () => {
    it("clears unconditionally when no expectedRunId is passed", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      await clearActiveWorkflowRunId(conversationId);
      expect(await getActiveWorkflowRunId(conversationId)).toBeNull();
    });

    it("CAS-clears only when current matches expectedRunId", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      await clearActiveWorkflowRunId(conversationId, "run-X");
      expect(await getActiveWorkflowRunId(conversationId)).toBe("run-A");
      await clearActiveWorkflowRunId(conversationId, "run-A");
      expect(await getActiveWorkflowRunId(conversationId)).toBeNull();
    });
  });

  describe("findConversationByActiveRunId", () => {
    it("returns the conversation when runId belongs to the user", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const found = await findConversationByActiveRunId("run-A", userId);
      expect(found?.id).toBe(conversationId);
    });

    it("returns null for a runId owned by a different user", async () => {
      await claimActiveWorkflowRunId(conversationId, "run-A");
      const found = await findConversationByActiveRunId("run-A", "someone-else");
      expect(found).toBeNull();
    });

    it("returns null when no conversation has that runId active", async () => {
      const found = await findConversationByActiveRunId("ghost-run", userId);
      expect(found).toBeNull();
    });
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
pnpm test src/server/queries/workflow-runs.test.ts
```

预期：FAIL，因为 `./workflow-runs` 模块不存在。

- [ ] **Step 3: 实现 `workflow-runs.ts`**

`src/server/queries/workflow-runs.ts`：

```ts
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatConversation } from "@/lib/db/schema";

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
          : sql`${chatConversation.activeWorkflowRunId} IS NOT NULL`,
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

- [ ] **Step 4: 跑测试，确认通过**

```bash
pnpm test src/server/queries/workflow-runs.test.ts
```

预期：所有用例 PASS。

- [ ] **Step 5: 跑 lint + typecheck**

```bash
pnpm typecheck && pnpm dlx ultracite fix
```

预期：无报错。`ultracite fix` 会自动修复格式问题。

- [ ] **Step 6: 提交**

```bash
git add src/server/queries/workflow-runs.ts src/server/queries/workflow-runs.test.ts
git commit -m "feat(server): add workflow run id claim/clear queries with CAS"
```

---

## Task 4: 启动配置 — `next.config.ts` + `instrumentation.ts`

**Files:**

- Modify: `next.config.ts`
- Create: `instrumentation.ts`（项目根，与 `next.config.ts` 同目录）

- [ ] **Step 1: 包裹 `next.config.ts` 用 `withWorkflow`**

读取当前 `next.config.ts` 内容，把 export 改为 `withWorkflow(...)`：

```ts
import type { NextConfig } from "next";
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

注意：保留你当前 `next.config.ts` 里的所有现有字段，只改 import 和 default export。

- [ ] **Step 2: 创建 `instrumentation.ts`**

项目根目录新建 `instrumentation.ts`：

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getWorld } = await import("workflow/runtime");
    const world = await getWorld();
    await world.start?.();
  }
}
```

- [ ] **Step 3: 启动 dev 服务，确认 PG world 启动无报错**

```bash
pnpm dev
```

预期：终端日志中能看到 PG world 启动相关 info（具体形式依 SDK 版本），**无 `WORKFLOW_TARGET_WORLD not set` / `cannot connect to postgres` 等错误**。打开 http://localhost:3000，已有 chat 入口要正常加载（这一步还没改路由，所以行为应与改造前一致）。

- [ ] **Step 4: 确认 typecheck 通过**

```bash
pnpm typecheck
```

- [ ] **Step 5: 提交**

```bash
git add next.config.ts instrumentation.ts
git commit -m "feat(workflow): wrap next config with withWorkflow and start pg world in instrumentation"
```

---

## Task 5: workflow 文件 `resume-chat.ts`

**Files:**

- Create: `src/server/workflows/resume-chat.ts`
- Modify: `src/server/routes/resume/screening.ts`（导出 helper）

> 关键不确定项：`getWritable<UIMessageChunk>()` 的具体写入 API（`.write(chunk)` vs `.next(chunk)` vs pipe-style）以 SDK 类型为准；`run.readable` 在 `start()` 返回值里的字段名也以 SDK 类型为准。下面的代码按 open-agents 与官方文档示例的形态写出，typecheck 时如果有签名差异就跟随真实类型微调。

- [ ] **Step 1: 修改 `screening.ts` 增加 helper：把 stream 累积成 UIMessage 同时回写 chunk**

在 `src/server/routes/resume/screening.ts` 末尾**追加**导出（保留原有 `runResumeScreening`）：

```ts
import type { UIMessage, UIMessageChunk } from "ai";

/**
 * Iterate the stream produced by `runResumeScreening(...).toUIMessageStream(...)`,
 * forward each chunk to a writable, and return the accumulated assistant message.
 *
 * The accumulator builds a UIMessage by replaying chunks via the AI SDK's
 * `readUIMessageStream` helper. Caller is responsible for providing the writable.
 */
export async function pumpAssistantStream(args: {
  stream: ReadableStream<UIMessageChunk>;
  writable: { write: (chunk: UIMessageChunk) => Promise<void> | void };
  generateMessageId: () => string;
  originalMessages: UIMessage[];
}): Promise<UIMessage | null> {
  const { stream, writable, generateMessageId, originalMessages } = args;
  const { readUIMessageStream } = await import("ai");

  let lastMessage: UIMessage | null = null;

  // Tee the stream: one branch goes to the writable as raw chunks, the other
  // is consumed by readUIMessageStream to accumulate the final UIMessage.
  const [forClient, forAccumulator] = stream.tee();

  // Forward chunks to writable (no transform; client expects UIMessageChunk).
  const forwardPromise = (async () => {
    const reader = forClient.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
      }
    } finally {
      reader.releaseLock();
    }
  })();

  for await (const message of readUIMessageStream({
    generateId: generateMessageId,
    originalMessages,
    stream: forAccumulator,
  })) {
    lastMessage = message;
  }

  await forwardPromise;
  return lastMessage;
}
```

如果 `readUIMessageStream` 在你的 `ai@^6.x` 版本里命名不同（例如 `parseUIMessages`），跑 `pnpm typecheck` 后按真实导出名调整。

- [ ] **Step 2: 创建 `src/server/workflows/resume-chat.ts`**

```ts
import type { UIMessage, UIMessageChunk } from "ai";
import { getWritable } from "workflow";
import { upsertChatMessage } from "@/server/queries/chat";
import { clearActiveWorkflowRunId } from "@/server/queries/workflow-runs";
import { inlineAttachmentsForModel } from "@/server/routes/resume/inline-attachments";
import { pumpAssistantStream, runResumeScreening } from "@/server/routes/resume/screening";

export type ResumeChatWorkflowInput = {
  chatId: string;
  userId: string;
  messages: UIMessage[];
  jobDescription?: string;
  enableThinking?: boolean;
};

export async function runResumeChatWorkflow(input: ResumeChatWorkflowInput) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const assistantMessage = await runScreeningAndStream(input, writable);

  if (assistantMessage) {
    await persistAssistantMessageStep({
      conversationId: input.chatId,
      message: assistantMessage,
    });
  }

  await clearActiveWorkflowRunIdStep(input.chatId);
}

async function runScreeningAndStream(
  input: ResumeChatWorkflowInput,
  writable: ReturnType<typeof getWritable<UIMessageChunk>>,
): Promise<UIMessage | null> {
  "use step";

  const messagesForModel = await inlineAttachmentsForModel(input.userId, input.messages);

  const result = await runResumeScreening({
    enableThinking: input.enableThinking,
    jobDescription: input.jobDescription,
    messages: messagesForModel,
  });

  const stream = result.toUIMessageStream({
    generateMessageId: () => crypto.randomUUID(),
    originalMessages: input.messages,
    sendReasoning: input.enableThinking !== false,
    sendSources: true,
  });

  return await pumpAssistantStream({
    generateMessageId: () => crypto.randomUUID(),
    originalMessages: input.messages,
    stream,
    writable,
  });
}

async function persistAssistantMessageStep(args: { conversationId: string; message: UIMessage }) {
  "use step";
  await upsertChatMessage(args);
}

async function clearActiveWorkflowRunIdStep(conversationId: string) {
  "use step";
  await clearActiveWorkflowRunId(conversationId);
}
```

注意：上面用了 `result.toUIMessageStream(...)` —— `ai` 包的 `streamText` / agent 结果通常同时暴露 `.toUIMessageStream()` 和 `.toUIMessageStreamResponse()`。如果你的 `runResumeScreening` 返回的对象只有后者，临时方案：用 `.toUIMessageStreamResponse(...).body!` 拿到 `ReadableStream<UIMessageChunk>`。typecheck 时按实际签名调整。

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。常见失败：

- `getWritable` 签名不同 — 看 `node_modules/workflow/dist/*.d.ts` 找正确签名
- `pumpAssistantStream` 接口不匹配 writable — 调整 `writable.write` 的 await 处理

跑 `pnpm dev` 确认 dev 服务还能起（Step 5 的 instrumentation 应仍 OK）。

- [ ] **Step 4: 提交**

```bash
git add src/server/workflows/resume-chat.ts src/server/routes/resume/screening.ts
git commit -m "feat(workflow): add resume-chat workflow with streaming and persist steps"
```

---

## Task 6: 改造 `POST /api/resume` + 新增 `GET /api/resume/:runId/stream`

**Files:**

- Modify: `src/server/routes/resume/route.ts` 第 17-113 行（POST 整段重写 + 新增 GET）

> 这是关键路径改动。改完之后，旧的 `runResumeScreening` 直接调用路径不再走，所有流量经过 workflow。

- [ ] **Step 1: 重写 POST handler 接入 workflow**

把 `src/server/routes/resume/route.ts` 第 17-113 行的整段 POST 替换为：

```ts
import type { UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { zValidator } from "@hono/zod-validator";
import { generateText } from "ai";
import { getRun, start } from "workflow/api";
import { withDevTools } from "@/server/agents/devtools";
import { factory } from "@/server/factory";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  upsertChatMessage,
} from "@/server/queries/chat";
import {
  claimActiveWorkflowRunId,
  clearActiveWorkflowRunId,
  findConversationByActiveRunId,
  getActiveWorkflowRunId,
} from "@/server/queries/workflow-runs";
import { runResumeChatWorkflow } from "@/server/workflows/resume-chat";
import { resumeChatRequestSchema, resumeTitleRequestSchema } from "./schema";
import { sanitizeTitle } from "./utils";

export const resumeRouter = factory
  .createApp()
  .post("/", zValidator("json", resumeChatRequestSchema), async (c) => {
    const {
      chatId,
      enableThinking,
      jobDescription,
      messages: rawMessages,
      trigger,
      messageId,
    } = c.req.valid("json");
    const userId = c.var.user?.id;

    if (!userId || !chatId) {
      return c.json({ error: "missing_user_or_chat" }, 401);
    }

    const ownership = await checkConversationOwner(userId, chatId);
    if (ownership !== "ok") {
      return c.json({ error: "forbidden" }, ownership === "forbidden" ? 403 : 404);
    }

    let messages = rawMessages as UIMessage[];
    if (trigger === "regenerate-message" && messageId) {
      const cutoff = messages.findIndex((m) => (m as UIMessage).id === messageId);
      if (cutoff !== -1) {
        messages = messages.slice(0, cutoff);
      }
      try {
        await deleteMessagesFromId({ conversationId: chatId, messageId });
      } catch (error) {
        console.error("[resume] failed to prune messages on regenerate", error);
      }
    }

    // Persist latest user message up front so a refresh shows what was sent.
    const latestUser = [...messages]
      .toReversed()
      .find(
        (m): m is UIMessage =>
          typeof m === "object" && m !== null && (m as UIMessage).role === "user",
      );
    if (latestUser) {
      void (async () => {
        try {
          await upsertChatMessage({ conversationId: chatId, message: latestUser });
        } catch (error) {
          console.error("[resume] failed to persist user message", error);
        }
      })();
    }

    // 1. Reuse an in-flight run if the conversation already has one running.
    const existingRunId = await getActiveWorkflowRunId(chatId);
    if (existingRunId) {
      try {
        const existingRun = getRun(existingRunId);
        const status = await existingRun.status;
        if (status === "running") {
          return new Response(existingRun.readable, {
            headers: {
              "x-workflow-run-id": existingRunId,
              "content-type": "text/event-stream",
            },
          });
        }
      } catch (error) {
        console.warn("[resume] stale active run; clearing", { existingRunId, error });
      }
      await clearActiveWorkflowRunId(chatId, existingRunId);
    }

    // 2. Start a new workflow run.
    const run = await start(runResumeChatWorkflow, [
      {
        chatId,
        enableThinking,
        jobDescription,
        messages,
        userId,
      },
    ]);

    // 3. CAS-claim the runId. If a concurrent request beat us to it, cancel.
    const claimed = await claimActiveWorkflowRunId(chatId, run.runId);
    if (!claimed) {
      try {
        await run.cancel?.();
      } catch (error) {
        console.error("[resume] failed to cancel concurrent run", error);
      }
      return c.json({ error: "concurrent_run_started" }, 409);
    }

    return new Response(run.readable, {
      headers: {
        "x-workflow-run-id": run.runId,
        "content-type": "text/event-stream",
      },
    });
  })
  .get("/:runId/stream", async (c) => {
    const runId = c.req.param("runId");
    const userId = c.var.user?.id;
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const conversation = await findConversationByActiveRunId(runId, userId);
    if (!conversation) {
      return new Response(null, { status: 204 });
    }

    let run: ReturnType<typeof getRun>;
    try {
      run = getRun(runId);
    } catch {
      await clearActiveWorkflowRunId(conversation.id, runId);
      return new Response(null, { status: 204 });
    }

    const status = await run.status;
    if (status === "completed" || status === "cancelled" || status === "failed") {
      await clearActiveWorkflowRunId(conversation.id, runId);
      return new Response(null, { status: 204 });
    }

    const startIndexParam = c.req.query("startIndex");
    const readable = run.getReadable({
      startIndex: startIndexParam ? Number.parseInt(startIndexParam, 10) : undefined,
    });
    const tailIndex = await readable.getTailIndex();

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream",
        "x-workflow-stream-tail-index": String(tailIndex),
      },
    });
  })
  .post("/title", zValidator("json", resumeTitleRequestSchema), async (c) => {
    const { hasFiles, text } = c.req.valid("json");

    const apiKey = process.env.ALIBABA_API_KEY;

    if (!apiKey) {
      return c.json(
        {
          error: "Missing ALIBABA_API_KEY. Please configure your environment variables.",
        },
        500,
      );
    }

    const baseURL =
      process.env.ALIBABA_BASE_URL?.trim() || "https://dashscope.aliyuncs.com/compatible-mode/v1";

    const provider = createOpenAICompatible({
      apiKey,
      baseURL,
      name: "alibaba",
      transformRequestBody: (body) => ({
        ...body,
        enable_thinking: false,
      }),
    });

    const modelId = process.env.ALIBABA_FAST_MODEL ?? "qwen-turbo";

    try {
      const { text: titleText } = await generateText({
        model: withDevTools(provider(modelId)),
        prompt: `你是会话标题助手。请根据用户第一条消息的意图生成一个中文标题。
要求:
- 只输出标题，不要任何解释
- 8 到 16 个字，最长不超过 28 字
- 准确表达任务意图，避免空泛词
- 不要标点结尾
- 若消息中提到候选人简历筛选、评分、对比、面试建议等，请体现关键动作
- 若包含上传文件语境（hasFiles=true），可体现"简历"或"附件"语义

hasFiles=${hasFiles ? "true" : "false"}
用户消息:
${text}`,
        temperature: 0.2,
      });

      const safeTitle = sanitizeTitle(titleText);

      if (!safeTitle) {
        return c.json({ title: "新对话" });
      }

      return c.json({ title: safeTitle });
    } catch {
      return c.json({ title: "新对话" });
    }
  });
```

注意删除原文件里下面这些不再使用的 import：`runResumeScreening`、`inlineAttachmentsForModel`（已挪进 workflow）。`upsertChatMessage` 仍用于 user message persist 所以保留。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。常见失败点：

- `run.readable` 不存在 — 用 `run.getReadable()` 替代（不传 startIndex 即从 0 开始）
- `run.cancel` 签名不同 — 看真实类型并按需调整
- Hono 的 `c.var.user` 类型 — 确认你的 auth middleware 形态（参考其他路由）

- [ ] **Step 3: 跑 dev，烟雾测一次正常 chat**

```bash
pnpm dev
```

打开浏览器，进入已有 chat，发一条消息，观察：

- Network 面板看到 `POST /api/resume` 返回 200，response header 有 `x-workflow-run-id`
- 流式回复正常显示
- 流结束后刷新页面，最后的 assistant message 已落库（消息不丢）
- DB 抽查：`SELECT id, active_workflow_run_id FROM chat_conversation WHERE id='<chatId>';` 应该是 NULL（流结束 step 已清）

如果在这步发现明显 bug（流不出 / 报错），回到 Task 5 检查 workflow 文件。

- [ ] **Step 4: 提交**

```bash
git add src/server/routes/resume/route.ts
git commit -m "feat(api): switch /api/resume to workflow and add /:runId/stream resume endpoint"
```

---

## Task 7: `getUserConversation` 返回 `activeWorkflowRunId`

**Files:**

- Modify: `src/server/queries/chat.ts:15-69`

- [ ] **Step 1: 在 `ChatConversationDetail` 接口加字段**

修改 `src/server/queries/chat.ts` 第 15-20 行：

```ts
export interface ChatConversationDetail extends ChatConversationSummary {
  activeWorkflowRunId: string | null;
  jobDescription: string;
  jobDescriptionConfig: JobDescriptionConfig | null;
  resumeImports: Record<string, string>;
  messages: UIMessage[];
}
```

- [ ] **Step 2: 在 `getUserConversation` 返回值里包含该列**

修改第 38-69 行的 `getUserConversation`，在 return 对象里追加 `activeWorkflowRunId`：

```ts
return {
  activeWorkflowRunId: row.activeWorkflowRunId,
  createdAt: row.createdAt,
  id: row.id,
  isTitleGenerating: row.isTitleGenerating,
  jobDescription: row.jobDescription,
  jobDescriptionConfig: row.jobDescriptionConfig ?? null,
  messages: messages.map((m) => m.content),
  resumeImports: row.resumeImports ?? {},
  title: row.title,
  updatedAt: row.updatedAt,
};
```

无需改 `select` —— 已经是 `select()`（all columns）。

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

预期：可能有几个调用方因为接口字段变化报错（少见，因为是新增）。如果有，按 TS 提示修。

- [ ] **Step 4: 提交**

```bash
git add src/server/queries/chat.ts
git commit -m "feat(server): expose activeWorkflowRunId on conversation detail"
```

---

## Task 8: 客户端 transport 切换到 `WorkflowChatTransport`

**Files:**

- Modify: `src/app/(auth)/chat/_lib/chat-transport.ts` 整文件重写

> 关键不确定项：`WorkflowChatTransport` 的构造选项（`onChatSendMessage` / `onChatEnd` / `prepareReconnectToStreamRequest`）名字与官方 docs 一致；如果实际包导出签名不同，按真实类型调整。

- [ ] **Step 1: 重写 `chat-transport.ts`**

```ts
import { WorkflowChatTransport } from "@workflow/ai";
import { getChatMeta } from "./chat-meta";

const CHAT_REQUEST_TIMEOUT_MS = 8 * 60 * 1000;
const ACTIVE_RUN_LS_KEY = (chatId: string) => `active-workflow-run:${chatId}`;

export function getStoredActiveRunId(chatId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_RUN_LS_KEY(chatId));
}

export function setStoredActiveRunId(chatId: string, runId: string | null) {
  if (typeof window === "undefined") return;
  if (runId) {
    window.localStorage.setItem(ACTIVE_RUN_LS_KEY(chatId), runId);
  } else {
    window.localStorage.removeItem(ACTIVE_RUN_LS_KEY(chatId));
  }
}

export function createChatTransport(chatId: string, initialActiveRunId: string | null) {
  // localStorage is the fast-path hint. Server-injected initialActiveRunId is
  // the source of truth on first mount; transport still re-reads localStorage
  // on subsequent reconnects within the same tab.
  if (initialActiveRunId) {
    setStoredActiveRunId(chatId, initialActiveRunId);
  }

  return new WorkflowChatTransport({
    api: "/api/resume",
    body: () => {
      const meta = getChatMeta(chatId);
      const jd = meta.jobDescription.trim();
      return {
        chatId,
        enableThinking: meta.enableThinking,
        ...(jd && { jobDescription: jd }),
      };
    },
    fetch: async (fetchInput, init) => {
      const timeoutController = new AbortController();
      const timeoutId = window.setTimeout(() => {
        timeoutController.abort("Chat request timed out after 8 minutes.");
      }, CHAT_REQUEST_TIMEOUT_MS);

      if (init?.signal) {
        if (init.signal.aborted) {
          timeoutController.abort(init.signal.reason);
        } else {
          init.signal.addEventListener(
            "abort",
            () => timeoutController.abort(init.signal?.reason),
            { once: true },
          );
        }
      }

      try {
        return await fetch(fetchInput, {
          ...init,
          signal: timeoutController.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    },
    onChatSendMessage: (response) => {
      const runId = response.headers.get("x-workflow-run-id");
      if (runId) {
        setStoredActiveRunId(chatId, runId);
      }
    },
    onChatEnd: () => {
      setStoredActiveRunId(chatId, null);
    },
    prepareReconnectToStreamRequest: ({ api, ...rest }) => {
      const runId = getStoredActiveRunId(chatId);
      if (!runId) {
        throw new Error(`No active workflow run for chat ${chatId}`);
      }
      return {
        ...rest,
        api: `${api}/${encodeURIComponent(runId)}/stream`,
      };
    },
    prepareSendMessagesRequest: ({ id, messages, trigger, messageId, body, headers }) => {
      let outgoingMessages = messages;
      if (trigger === "regenerate-message" && messageId) {
        const cutoff = messages.findIndex((m) => m.id === messageId);
        if (cutoff !== -1) {
          outgoingMessages = messages.slice(0, cutoff);
        }
      }
      return {
        body: {
          ...body,
          id,
          messageId,
          messages: outgoingMessages,
          trigger,
        },
        headers,
      };
    },
  });
}
```

注意：`api: '/api/resume'` 保持不变；重连端点拼出 `/api/resume/:runId/stream`，与 Task 6 的 GET 路由一致。

- [ ] **Step 2: 跑 typecheck**

```bash
pnpm typecheck
```

预期：通过。常见失败：`WorkflowChatTransport` 的构造选项实际名字与 docs 略不同。看 `node_modules/@workflow/ai/dist/*.d.ts` 调整。

- [ ] **Step 3: 提交（暂不跑 dev — registry 还没改）**

```bash
git add src/app/\(auth\)/chat/_lib/chat-transport.ts
git commit -m "feat(client): switch chat transport to WorkflowChatTransport"
```

---

## Task 9: registry 与 page client 加 mount-time resume

**Files:**

- Modify: `src/app/(auth)/chat/_lib/chat-registry.ts:53-92`
- Modify: `src/app/(auth)/chat/_components/chat-page-client.tsx:133-146`

- [ ] **Step 1: 让 `getOrCreateChat` 接受 `initialActiveRunId`**

把 `chat-registry.ts:53` 的 `getOrCreateChat` 签名扩展：

```ts
export function getOrCreateChat(
  chatId: string,
  options: { initialMessages?: UIMessage[]; initialActiveRunId?: string | null } = {},
): Chat<UIMessage> {
  const existing = chats.get(chatId);
  if (existing) {
    return existing;
  }

  const chat = new Chat<UIMessage>({
    id: chatId,
    messages: options.initialMessages ?? [],
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      notifyConversationsChanged();

      if (message.role === "assistant" && (isAbort || isDisconnect || isError)) {
        void persistPartialMessage(chatId, message);
      }

      emitFinish({ chatId, isAbort, isDisconnect, isError, message });
    },
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    transport: createChatTransport(chatId, options.initialActiveRunId ?? null),
  });

  chats.set(chatId, chat);
  return chat;
}
```

- [ ] **Step 2: 在 `chat-page-client.tsx` 把 `initialActiveRunId` 从 SSR 数据传进 registry，并启用 `useChat({ resume })`**

`chat-page-client.tsx:133-146` 那段改为：

```ts
const initialActiveRunId =
  activeConversationId && props.initialConversation?.id === activeConversationId
    ? props.initialConversation.activeWorkflowRunId
    : null;

const boundChat = useMemo(
  () =>
    activeConversationId ? getOrCreateChat(activeConversationId, { initialActiveRunId }) : null,
  // intentionally stable across initialActiveRunId changes — registry holds
  // the chat instance; we only want SSR-time runId on first creation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [activeConversationId],
);

const shouldResumeOnMountRef = useRef(
  Boolean(initialActiveRunId) &&
    boundChat?.status !== "streaming" &&
    boundChat?.status !== "submitted",
);

const { addToolOutput, messages, setMessages, status, stop, error, regenerate, clearError } =
  useChat(
    boundChat
      ? {
          chat: boundChat,
          experimental_throttle: 50,
          resume: shouldResumeOnMountRef.current,
        }
      : { experimental_throttle: 50 },
  );
```

注意：`props.initialConversation` 的形状需要包含 `activeWorkflowRunId` —— Task 7 已经在 server 端补上了，这里靠 SSR 传递。如果 `props.initialConversation` 类型还是旧的，跑 typecheck 时按提示更新它的类型定义（顺着引用链找到该 prop 的 type alias 加上字段）。

- [ ] **Step 3: 跑 typecheck**

```bash
pnpm typecheck
```

按报错调整 prop 类型链。

- [ ] **Step 4: 跑 dev 做端到端手测**

```bash
pnpm dev
```

浏览器手测 4 个场景（来自 spec 的测试策略）：

1. **正常 chat：** 发消息 → 流式回复 → 刷新 → 历史完整
2. **断网重连：** 发消息 → 立即开 airplane mode 5 秒 → 关 airplane → 流应接上继续
3. **跨设备：** A 设备发起 → B 设备打开同 conversation URL → 看到 A 正在生成的流
4. **终态后刷新：** 流结束 5 秒后刷新 → 显示历史，**不应**再触发 GET `/api/resume/:runId/stream`（看 Network 面板）

DB 抽查：每次场景结束后 `SELECT active_workflow_run_id FROM chat_conversation WHERE id='<chatId>'` 应为 NULL。

- [ ] **Step 5: 提交**

```bash
git add src/app/\(auth\)/chat/_lib/chat-registry.ts src/app/\(auth\)/chat/_components/chat-page-client.tsx
git commit -m "feat(client): wire mount-time workflow run resume into chat page"
```

---

## Task 10: 验证、清理、收尾

**Files:**

- 全项目

- [ ] **Step 1: 全套验证**

```bash
pnpm typecheck && pnpm test && pnpm dlx ultracite check
```

预期：全过。`ultracite check` 报问题用 `pnpm dlx ultracite fix` 修。

- [ ] **Step 2: 检查是否有遗留的旧路径调用**

```bash
git grep -nE 'runResumeScreening|toUIMessageStreamResponse' src/server/routes/resume/route.ts
```

预期：route.ts 里**不应**再出现 `runResumeScreening` 或 `toUIMessageStreamResponse` 直接调用（已经下沉到 workflow 内）。Title 子路由 `/title` 不受影响保持原样。

- [ ] **Step 3: 检查依赖图清晰**

```bash
git grep -nE 'from "workflow"|from "@workflow/' src/
```

预期：`workflow` 主包只在 `src/server/workflows/` 和 `src/server/routes/resume/route.ts` 出现；`@workflow/ai` 只在 `src/app/(auth)/chat/_lib/chat-transport.ts` 出现。客户端代码不应 import 服务端 workflow 文件。

- [ ] **Step 4: 把 spec 状态改为 Implemented**

修改 `docs/superpowers/specs/2026-04-29-workflow-postgres-design.md` 第 5 行：

```markdown
**状态：** Implemented（2026-04-29）
```

- [ ] **Step 5: 最终提交**

```bash
git add docs/superpowers/specs/2026-04-29-workflow-postgres-design.md
git commit -m "docs(spec): mark workflow-postgres design as implemented"
```

- [ ] **Step 6: 部署前清单（不在本次提交，留作 PR 描述）**

PR 描述里要写上：

- ⚠️ 部署到生产前，需在生产 PG 上**先**跑 `pnpm dlx workflow-postgres-setup` 建 `workflow_*` 表
- ⚠️ 生产 env 需补 `WORKFLOW_TARGET_WORLD=@workflow/world-postgres`
- ⚠️ 与 Vercel 不兼容：本变更只能部署到长进程 Docker / VM
- 回滚方案：`git revert` workflow 相关 commits；`workflow_*` 表保留无副作用

---

## Self-Review

**Spec 覆盖检查：**

| Spec 章节                                  | Plan 任务                                            |
| ------------------------------------------ | ---------------------------------------------------- |
| 数据库 schema 改动 §1 加列                 | Task 2                                               |
| 数据库 schema 改动 §2 workflow 表 CLI 管理 | Task 1 Step 5/7                                      |
| 数据库 schema 改动 §3 chat_message 不变    | 无需任务                                             |
| 文件清单 — 新增                            | Task 3 / 4 / 5                                       |
| 文件清单 — 改动                            | Task 2 / 4 / 6 / 7 / 8 / 9                           |
| 实现骨架 — workflow 文件                   | Task 5                                               |
| 实现骨架 — POST /api/resume                | Task 6 Step 1                                        |
| 实现骨架 — GET /:runId/stream              | Task 6 Step 1                                        |
| 实现骨架 — DB helpers                      | Task 3                                               |
| 客户端改动 — chat-transport.ts             | Task 8                                               |
| 客户端改动 — chat-page-client.tsx          | Task 9                                               |
| 启动配置 — next.config.ts                  | Task 4 Step 1                                        |
| 启动配置 — instrumentation.ts              | Task 4 Step 2                                        |
| 启动配置 — .env.example                    | Task 1 Step 4                                        |
| 依赖增量                                   | Task 1 Step 1-3                                      |
| 错误与边界场景                             | 体现在 Task 6 的代码块（claim 失败 / status 终态等） |
| 回滚                                       | Task 10 Step 6 PR 描述                               |
| 测试策略 — CAS 单测                        | Task 3                                               |
| 测试策略 — 手测端到端                      | Task 9 Step 4                                        |

**Placeholder scan：** 全文搜了 `TBD` / `TODO` / `implement later` / `add error handling` / `similar to`，没有命中。

**类型一致性：** `claimActiveWorkflowRunId` / `clearActiveWorkflowRunId` / `getActiveWorkflowRunId` / `findConversationByActiveRunId` 跨 Task 3、Task 6、Task 9 名字一致；`runResumeChatWorkflow` 在 Task 5 定义并由 Task 6 import；`createChatTransport(chatId, initialActiveRunId)` 在 Task 8 定义、Task 9 使用，参数顺序匹配。
