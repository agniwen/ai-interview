import type { UIMessage } from "ai";
import { zValidator } from "@hono/zod-validator";
import { listUpstreamModelIds } from "@/server/agents/list-upstream-models";
import { HARDCODED_DEFAULT_MODEL_ID, resolveChatModelId } from "@/server/agents/model-catalog";
import { factory } from "@/server/factory";
import { bakeParsedResumesIntoMessage } from "@/server/routes/resume/bake-parsed-resume";
import { inlineAttachmentsForModel } from "@/server/routes/resume/inline-attachments";
import { resumeChatRequestSchema } from "@/server/routes/resume/schema";
import { runResumeScreening } from "@/server/routes/resume/screening";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  upsertChatMessage,
} from "@/server/routes/chat/dao/chat";

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

export const resumeChatRouter = factory
  .createApp()
  .post("/", zValidator("json", resumeChatRequestSchema), async (c) => {
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
    // 从 session 解出 orgId,供 upsertChatMessage / runResumeScreening 共用
    // (chat_message.organization_id NOT NULL)。session 没有活跃 org 时直接拒,
    // 不再用 "org_default" 兜底——那样消息会被盖到一个假 org 上。
    // Resolve orgId from the session. chat_message.organization_id is NOT NULL,
    // and we used to fall back to "org_default" which silently tagged messages
    // with a fake org — reject instead so the caller knows session is unbound.
    const orgId = (c.var.session as { activeOrganizationId?: string | null } | null)
      ?.activeOrganizationId;
    if (!orgId) {
      return c.json({ error: "No active workspace" }, 400);
    }

    const conversationOwned =
      userId && chatId ? (await checkConversationOwner(userId, chatId, orgId)) === "ok" : false;

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
              organizationId: orgId,
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
      orgId,
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
            organizationId: orgId,
          });
        } catch (error) {
          console.error("[resume] failed to persist assistant message", error);
        }
      },
      originalMessages: messages,
      sendReasoning: enableThinking !== false,
      sendSources: true,
    });
  });
