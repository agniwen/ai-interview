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
        if (status !== "completed" && status !== "cancelled" && status !== "failed") {
          return new Response(existingRun.readable, {
            headers: {
              "content-type": "text/event-stream",
              "x-workflow-run-id": existingRunId,
            },
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

    return new Response(run.readable, {
      headers: {
        "content-type": "text/event-stream",
        "x-workflow-run-id": run.runId,
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
