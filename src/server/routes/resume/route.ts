import type { UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { zValidator } from "@hono/zod-validator";
import { generateText } from "ai";
import { withDevTools } from "@/server/agents/devtools";
import { factory } from "@/server/factory";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  upsertChatMessage,
} from "@/server/queries/chat";
import { inlineAttachmentsForModel } from "./inline-attachments";
import { resumeChatRequestSchema, resumeTitleRequestSchema } from "./schema";
import { runResumeScreening } from "./screening";
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

    const conversationOwned =
      userId && chatId ? (await checkConversationOwner(userId, chatId)) === "ok" : false;

    // On regenerate, drop the assistant message being replaced (and anything
    // after it) so the LLM does not see its own prior reply and "continue"
    // from there. `DefaultChatTransport` sends the full message list along
    // with `trigger`/`messageId`, expecting the server to slice.
    let messages = rawMessages as UIMessage[];
    if (trigger === "regenerate-message" && messageId) {
      const cutoff = messages.findIndex((m) => (m as UIMessage).id === messageId);
      if (cutoff !== -1) {
        messages = messages.slice(0, cutoff);
      }
      if (conversationOwned && chatId) {
        try {
          await deleteMessagesFromId({ conversationId: chatId, messageId });
        } catch (error) {
          console.error("[resume] failed to prune messages on regenerate", error);
        }
      }
    }

    // Persist the latest user message up front (fire-and-forget) so a
    // refresh mid-stream still shows what the user just sent. Run on every
    // trigger — `upsertChatMessage` is idempotent, and skipping on
    // regenerate would drop the user row if the original submit's
    // fire-and-forget persist never landed.
    if (conversationOwned && chatId) {
      const latestUser = [...messages]
        .toReversed()
        .find(
          (m): m is UIMessage =>
            typeof m === "object" && m !== null && (m as UIMessage).role === "user",
        );
      if (latestUser) {
        void (async () => {
          try {
            await upsertChatMessage({
              conversationId: chatId,
              message: latestUser,
            });
          } catch (error) {
            console.error("[resume] failed to persist user message", error);
          }
        })();
      }
    }

    const messagesForModel = userId ? await inlineAttachmentsForModel(userId, messages) : messages;

    const result = await runResumeScreening({
      enableThinking,
      jobDescription,
      messages: messagesForModel,
    });

    return result.toUIMessageStreamResponse({
      // Required for the SDK to emit a response-message id on the stream —
      // without it, `responseMessage.id` is undefined and the DB insert fails
      // (id is the primary key). Use pre-inline messages so the ids match
      // what the client sees.
      generateMessageId: () => crypto.randomUUID(),
      onFinish: async ({ responseMessage }) => {
        if (!conversationOwned || !chatId) {
          return;
        }
        if (!responseMessage.id) {
          console.error("[resume] response message has no id, skipping persist");
          return;
        }
        try {
          await upsertChatMessage({
            conversationId: chatId,
            message: responseMessage,
          });
        } catch (error) {
          console.error("[resume] failed to persist assistant message", error);
        }
      },
      originalMessages: messages,
      sendReasoning: enableThinking !== false,
      sendSources: true,
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
