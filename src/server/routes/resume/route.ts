import type { UIMessage } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { zValidator } from "@hono/zod-validator";
import { generateText } from "ai";
import { withDevTools } from "@/server/agents/devtools";
import { listUpstreamModelIds } from "@/server/agents/list-upstream-models";
import {
  describeModelId,
  HARDCODED_DEFAULT_MODEL_ID,
  isChatCapableId,
  resolveChatModelId,
  SECONDARY_DEFAULT_MODEL_ID,
} from "@/server/agents/model-catalog";
import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  upsertChatMessage,
} from "@/server/routes/chat/dao/chat";
import { bakeParsedResumesIntoMessage } from "./bake-parsed-resume";
import { inlineAttachmentsForModel } from "./inline-attachments";
import { resumeChatRequestSchema, resumeTitleRequestSchema } from "./schema";
import { runResumeScreening } from "./screening";
import { sanitizeTitle } from "./utils";

const DASHSCOPE_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/**
 * 把客户端传入的 model id 收敛到上游最近一次成功列表内。
 * Clamp the client-supplied model id against the latest upstream snapshot.
 */
async function resolveModelForChat(requestedModel: string | undefined): Promise<string> {
  const apiKey = process.env.ALIBABA_API_KEY;
  const baseURL = process.env.ALIBABA_BASE_URL?.trim() || DASHSCOPE_DEFAULT_BASE_URL;
  const upstreamIds = apiKey ? await listUpstreamModelIds({ apiKey, baseURL }) : null;
  const fallbackId = process.env.ALIBABA_MODEL?.trim() || HARDCODED_DEFAULT_MODEL_ID;
  return resolveChatModelId(requestedModel, upstreamIds, fallbackId);
}

export const resumeRouter = factory
  .createApp()
  .use("*", authMiddleware)
  .get("/models", async (c) => {
    const apiKey = process.env.ALIBABA_API_KEY;
    if (!apiKey) {
      return c.json({ error: "Missing ALIBABA_API_KEY" }, 500);
    }
    const baseURL = process.env.ALIBABA_BASE_URL?.trim() || DASHSCOPE_DEFAULT_BASE_URL;

    const upstreamIds = await listUpstreamModelIds({ apiKey, baseURL });

    // 完全跟随上游：能拉到就过滤掉非聊天 id 后展示，拉不到就返回空 + reachable=false。
    // Source of truth = upstream `/models`. Filter out non-chat ids; on failure
    // we return an empty list and surface `upstreamReachable: false` to the UI.
    const models = upstreamIds
      ? [...upstreamIds]
          .filter((id) => isChatCapableId(id))
          .toSorted()
          .map(describeModelId)
      : [];

    // 默认 id 兜底链：硬编码 > 二级兜底（qwen-plus-latest）> 列表第一个。
    // Default id fallback chain: HARDCODED → SECONDARY (qwen-plus-latest) →
    // first listed model.
    const defaultId = (() => {
      if (models.some((m) => m.id === HARDCODED_DEFAULT_MODEL_ID)) {
        return HARDCODED_DEFAULT_MODEL_ID;
      }
      if (models.some((m) => m.id === SECONDARY_DEFAULT_MODEL_ID)) {
        return SECONDARY_DEFAULT_MODEL_ID;
      }
      return models[0]?.id ?? HARDCODED_DEFAULT_MODEL_ID;
    })();

    return c.json({ defaultId, models, upstreamReachable: upstreamIds !== null }, 200);
  })
  .post("/chat", zValidator("json", resumeChatRequestSchema), async (c) => {
    const {
      chatId,
      enableThinking,
      jobDescription,
      messages: rawMessages,
      model,
      trigger,
      messageId,
    } = c.req.valid("json");

    const resolvedModel = await resolveModelForChat(model);
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
            const baked = userId
              ? await bakeParsedResumesIntoMessage(userId, latestUser)
              : latestUser;
            await upsertChatMessage({
              conversationId: chatId,
              message: baked,
            });
          } catch (error) {
            console.error("[resume] failed to persist user message", error);
          }
        })();
      }
    }

    // Bake the parsed resume info into the in-memory message list too so the
    // screening agent sees the same shape that's about to be persisted.
    let bakedMessages = messages;
    if (userId) {
      bakedMessages = await Promise.all(
        messages.map((m) => bakeParsedResumesIntoMessage(userId, m)),
      );
    }

    const messagesForModel = userId
      ? await inlineAttachmentsForModel(userId, bakedMessages)
      : bakedMessages;

    const result = await runResumeScreening({
      enableThinking,
      jobDescription,
      messages: messagesForModel,
      modelId: resolvedModel,
      userId: userId ?? null,
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

    const modelId = process.env.ALIBABA_FAST_MODEL ?? "deepseek-v4-flash";

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
        return c.json({ title: "新对话" }, 200);
      }

      return c.json({ title: safeTitle }, 200);
    } catch {
      return c.json({ title: "新对话" }, 200);
    }
  });
