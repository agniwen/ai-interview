import type { UIMessage, UIMessageChunk } from "ai";
import type { Context } from "hono";
import type { Env } from "@/server/type";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { zValidator } from "@hono/zod-validator";
import { createUIMessageStreamResponse, generateText, isToolUIPart } from "ai";
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

/**
 * 流端点用的"无内容但已完成"响应。
 *
 * **不能用 204** —— `WorkflowChatTransport.reconnectToStreamIterator` 拿到 204
 * 会因为 `res.body` 为 null 直接抛 "Failed to fetch chat: 204", 把 chat status
 * 推到 "error", 然后 useStreamRecovery 的 error 分支又会触发自动 retry, 形成
 * 反复 GET 同一个 stream 端点 → 每次 204 → status=error → 又 retry 的死循环。
 *
 * 解决: 200 + 一个只含 `finish` chunk 的 SSE stream。SDK 解析到 finish 后
 * `gotFinish=true`, 干净退出 reconnect while 循环, status 不会变 error,
 * 也就不再触发 recovery 重连。
 *
 * Streaming-endpoint "no content but finished" response.
 *
 * **DO NOT use 204** — `WorkflowChatTransport.reconnectToStreamIterator` will
 * throw on `!res.body` (which 204 implies), bumping chat status to "error",
 * which then trips useStreamRecovery's error branch and produces a retry
 * loop hammering this endpoint.
 *
 * Return a 200 with an SSE stream containing just a `finish` chunk so the
 * SDK exits cleanly with status === "ready".
 */
function emptyFinishedStreamResponse(): Response {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: "finish" });
      controller.close();
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/**
 * 统一处理 chat 路由的认证 + ownership 校验, 把分散在各个 handler 顶部的同款
 * 逻辑收敛到一处。
 *  - `silentFailure: true`: 流端点用 —— 把所有 401/403/404 转成"已完成的空流"
 *    (200 + finish chunk), transport 层 reconnect 不会因此抛错或重连。
 *  - 默认: 标准的 401 / 403 / 404 JSON 响应。
 *
 * Centralizes auth + ownership for chat routes that take chatId. Pass
 * `silentFailure: true` to swallow all auth/ownership failures as a finished
 * empty stream (used by the streaming GET so transport reconnect stays quiet).
 */
interface AuthorizeFailure {
  ok: false;
  response: Response;
}
type AuthorizeResult = { ok: true; userId: string } | AuthorizeFailure;

function silentAuthFailure(): AuthorizeFailure {
  return { ok: false, response: emptyFinishedStreamResponse() };
}

async function authorizeChatRequest(
  c: Context<Env>,
  chatId: string,
  options: { silentFailure?: boolean } = {},
): Promise<AuthorizeResult> {
  const userId = c.var.user?.id;
  if (!userId) {
    if (options.silentFailure) {
      return silentAuthFailure();
    }
    return { ok: false, response: c.json({ error: "unauthorized" }, 401) };
  }

  const ownership = await checkConversationOwner(userId, chatId);
  if (ownership !== "ok") {
    if (options.silentFailure) {
      return silentAuthFailure();
    }
    return {
      ok: false,
      response: c.json({ error: ownership }, ownership === "forbidden" ? 403 : 404),
    };
  }

  return { ok: true, userId };
}

/**
 * 客户端 auto-submit 的场景下(approval 响应 / 客户端 tool 结果回填), 末尾消息
 * 是已经带 tool 结果的 assistant message。仅靠 workflow 的 onFinish 落库, 在
 * 下一轮 stream 刚启动的 1-2s 内刷新, 用户会看到 DB 里仍是旧的
 * approval-requested 状态, UI 又渲染一遍确认/取消按钮。
 * 所以在启动新 workflow 之前先把这条 assistant 快照同步写一次; workflow
 * 完成时会用合并后的 responseMessage 再覆盖一次, 终态保持一致。
 *
 * When the client auto-submits after an approval click / tool result, the
 * trailing message is an assistant message that already carries the tool
 * result. Without persisting up front, a refresh during the new turn's first
 * 1-2s shows the stale (pre-result) row, making the UI re-render approval
 * buttons. Persist now; the workflow's onFinish overwrites this row later
 * with the merged responseMessage.
 */
async function persistAssistantToolResultSnapshot(
  chatId: string,
  messages: UIMessage[],
): Promise<void> {
  const latestMessage = messages.at(-1);
  if (!latestMessage || latestMessage.role !== "assistant") {
    return;
  }
  const hasClientToolResults = latestMessage.parts?.some(
    (part) =>
      isToolUIPart(part) &&
      (part.state === "output-available" ||
        part.state === "output-error" ||
        part.state === "approval-responded"),
  );
  if (!hasClientToolResults) {
    return;
  }
  try {
    await upsertChatMessage({ conversationId: chatId, message: latestMessage });
  } catch (error) {
    console.error("[resume] failed to persist assistant tool-result snapshot", error);
  }
}

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

    if (!chatId) {
      return c.json({ error: "missing_chat" }, 400);
    }

    const auth = await authorizeChatRequest(c, chatId);
    if (!auth.ok) {
      return auth.response;
    }
    const { userId } = auth;

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

    await persistAssistantToolResultSnapshot(chatId, messages);

    // 1. Reuse an in-flight run if the conversation already has one running.
    const existingRunId = await getActiveWorkflowRunId(chatId);
    if (existingRunId) {
      try {
        const existingRun = getRun(existingRunId);
        const status = await existingRun.status;
        if (status !== "completed" && status !== "cancelled" && status !== "failed") {
          return createUIMessageStreamResponse({
            headers: {
              "x-workflow-run-id": existingRunId,
            },
            stream: existingRun.readable,
          });
        }
      } catch (error) {
        console.warn("[resume] stale active run; clearing", { error, existingRunId });
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
        await run.cancel();
      } catch (error) {
        console.error("[resume] failed to cancel concurrent run", error);
      }
      return c.json({ error: "concurrent_run_started" }, 409);
    }

    return createUIMessageStreamResponse({
      headers: {
        "x-workflow-run-id": run.runId,
      },
      stream: run.readable,
    });
  })
  // 通过 chatId 续接当前活跃的 workflow stream:
  // 服务端从 DB 读取 `activeWorkflowRunId`，前端因此不再需要 localStorage 记录 runId。
  // Resume the active workflow stream by chatId — the server resolves
  // `activeWorkflowRunId` from the DB so the client no longer needs
  // localStorage to remember the runId.
  .get("/by-chat/:chatId/stream", async (c) => {
    const chatId = c.req.param("chatId");
    // silentFailure: 把 401/403/404 一律当作"没有可恢复的流"返回 204,
    // transport 层 reconnect 不会抛异常。
    // silentFailure: collapse all auth/ownership failures into a 204 so the
    // transport's reconnect path stays quiet.
    const auth = await authorizeChatRequest(c, chatId, { silentFailure: true });
    if (!auth.ok) {
      return auth.response;
    }

    const runId = await getActiveWorkflowRunId(chatId);
    if (!runId) {
      return emptyFinishedStreamResponse();
    }

    let run: ReturnType<typeof getRun>;
    try {
      run = getRun(runId);
    } catch {
      await clearActiveWorkflowRunId(chatId, runId);
      return emptyFinishedStreamResponse();
    }

    const status = await run.status;
    if (status === "completed" || status === "cancelled" || status === "failed") {
      await clearActiveWorkflowRunId(chatId, runId);
      return emptyFinishedStreamResponse();
    }

    const startIndexParam = c.req.query("startIndex");
    const readable = run.getReadable({
      startIndex: startIndexParam ? Number.parseInt(startIndexParam, 10) : undefined,
    });
    const tailIndex = await readable.getTailIndex();

    return createUIMessageStreamResponse({
      headers: {
        "x-workflow-run-id": runId,
        "x-workflow-stream-tail-index": String(tailIndex),
      },
      stream: readable,
    });
  })
  // 客户端点 stop 时调用: 取消活跃的 workflow run, 清理 activeWorkflowRunId,
  // 并尽力把客户端持有的最新 assistant 快照落库, 避免中途 stop 时丢失生成内容。
  // Cancel the active workflow run when the user clicks stop, clear
  // activeWorkflowRunId and best-effort persist the client-held assistant
  // snapshot so mid-stream output isn't lost.
  .post("/by-chat/:chatId/stop", async (c) => {
    const chatId = c.req.param("chatId");
    const auth = await authorizeChatRequest(c, chatId);
    if (!auth.ok) {
      return auth.response;
    }

    // 即便没有 active run 也返回成功 —— stop 调用幂等。
    // No active run is still success — stop must be idempotent.
    const runId = await getActiveWorkflowRunId(chatId);

    // 尽力持久化客户端的 assistant 快照, 失败不阻塞 cancel。
    // Best-effort persist: failure here must not block cancellation.
    try {
      const body = (await c.req.json().catch(() => null)) as {
        assistantMessage?: UIMessage;
      } | null;
      const snapshot = body?.assistantMessage;
      if (snapshot && snapshot.role === "assistant" && typeof snapshot.id === "string") {
        await upsertChatMessage({ conversationId: chatId, message: snapshot });
      }
    } catch (error) {
      console.error("[resume] stop: snapshot persist failed", error);
    }

    if (!runId) {
      return c.json({ success: true });
    }

    try {
      const run = getRun(runId);
      await run.cancel();
    } catch (error) {
      console.error("[resume] failed to cancel run", { error, runId });
      return c.json({ error: "cancel_failed" }, 500);
    }

    // 立即清掉 activeWorkflowRunId, 防止后续刷新 / 新一轮发送 reattach 到已取消的 run。
    // Clear immediately so a refresh / next prompt doesn't reattach to a
    // cancelled (but not yet terminal) run.
    await clearActiveWorkflowRunId(chatId, runId);

    return c.json({ success: true });
  })
  // 兼容旧的 runId 续接路径，保留给当前还在跑的 workflow（发布期）。
  // Backward-compat runId resume path; kept for in-flight workflows during rollout.
  .get("/:runId/stream", async (c) => {
    const runId = c.req.param("runId");
    const userId = c.var.user?.id;
    if (!userId) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const conversation = await findConversationByActiveRunId(runId, userId);
    if (!conversation) {
      return emptyFinishedStreamResponse();
    }

    let run: ReturnType<typeof getRun>;
    try {
      run = getRun(runId);
    } catch {
      await clearActiveWorkflowRunId(conversation.id, runId);
      return emptyFinishedStreamResponse();
    }

    const status = await run.status;
    if (status === "completed" || status === "cancelled" || status === "failed") {
      await clearActiveWorkflowRunId(conversation.id, runId);
      return emptyFinishedStreamResponse();
    }

    const startIndexParam = c.req.query("startIndex");
    const readable = run.getReadable({
      startIndex: startIndexParam ? Number.parseInt(startIndexParam, 10) : undefined,
    });
    const tailIndex = await readable.getTailIndex();

    return createUIMessageStreamResponse({
      headers: {
        "x-workflow-stream-tail-index": String(tailIndex),
      },
      stream: readable,
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
