import type { UIMessage } from "ai";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { zValidator } from "@hono/zod-validator";
import { toAISdkStream } from "@mastra/ai-sdk";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { legacyUiMessageToArcMessage } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/arc-message-adapter";
import { createRecruitingCopilotAgent } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/recruiting-copilot-agent";
import { mastra } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/index";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { resumeChatRequestSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/schema";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  loadConversationContextBindings,
  upsertChatMessage,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";
import { extractV6NativeApproval } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/utils/extract-v6-native-approval";
import { EMPTY_CHAT_CONTEXT_BINDINGS } from "@arc/db-schema/chat-context-bindings";
import { loadResumeRecordFocus } from "./dao";
import { resolveRecruitingCopilotFocus } from "./focus";
import { hasExplicitJobBindingConsent, validateClientChatMessages } from "./messages";

function latestUserMessage(messages: UIMessage[]) {
  return [...messages]
    .toReversed()
    .find(
      (message): message is UIMessage =>
        typeof message === "object" && message !== null && message.role === "user",
    );
}

async function persistChatMessage({
  chatId,
  message,
  orgId,
}: {
  chatId: string;
  message: UIMessage;
  orgId: string;
}) {
  await upsertChatMessage({
    conversationId: chatId,
    message: legacyUiMessageToArcMessage(message),
    organizationId: orgId,
  });
}

async function prepareConversationMessages({
  chatId,
  conversationOwned,
  messageId,
  messages,
  orgId,
  trigger,
}: {
  chatId?: string;
  conversationOwned: boolean;
  messageId?: string;
  messages: UIMessage[];
  orgId: string;
  trigger?: "regenerate-message" | "submit-message";
}): Promise<{ error: string } | { messages: UIMessage[] }> {
  let preparedMessages = messages;
  if (trigger === "regenerate-message" && messageId) {
    const cutoff = preparedMessages.findIndex((message) => message.id === messageId);
    if (cutoff !== -1) {
      preparedMessages = preparedMessages.slice(0, cutoff);
    }
    if (conversationOwned && chatId) {
      try {
        await deleteMessagesFromId({ conversationId: chatId, messageId });
      } catch (error) {
        console.error("[copilot-chat] failed to prune messages on regenerate", error);
        return { error: "无法重新生成这条消息，请稍后重试。" };
      }
    }
  }

  if (conversationOwned && chatId) {
    const latestUser = latestUserMessage(preparedMessages);
    if (latestUser) {
      try {
        await persistChatMessage({ chatId, message: latestUser, orgId });
      } catch (error) {
        console.error("[copilot-chat] failed to persist user message", error);
        return { error: "消息保存失败，请稍后重试。" };
      }
    }
  }

  return { messages: preparedMessages };
}

export const resumeChatRouter = factory
  .createApp()
  .use("*", requirePermission("chat", "create"))
  .post("/", zValidator("json", resumeChatRequestSchema), async (c) => {
    const { chatId, focus, messages: rawMessages, trigger, messageId } = c.req.valid("json");

    const userId = c.var.user?.id;
    const orgId = c.var.activeOrg?.id;
    if (!(orgId && userId)) {
      return c.json({ error: "Workspace context is required" }, 403);
    }

    const validatedMessages = await validateClientChatMessages(rawMessages);
    if ("error" in validatedMessages) {
      return c.json({ error: validatedMessages.error }, 400);
    }
    const visibilityScope = await resolveRecruitingVisibilityScope({
      currentRole: c.var.member?.role,
      organizationId: orgId,
      userId,
    });
    const resolvedFocus = await resolveRecruitingCopilotFocus(
      { focus, organizationId: orgId, visibilityScope },
      { loadResumeRecord: loadResumeRecordFocus },
    );
    if (resolvedFocus?.kind === "not_found") {
      return c.json({ error: "候选人记录不存在或不属于当前 workspace。" }, 404);
    }

    const conversationOwned = chatId
      ? (await checkConversationOwner(userId, chatId, orgId)) === "ok"
      : false;
    const contextBindings =
      conversationOwned && chatId
        ? await loadConversationContextBindings(chatId, orgId)
        : EMPTY_CHAT_CONTEXT_BINDINGS;

    const preparedConversation = await prepareConversationMessages({
      chatId,
      conversationOwned,
      messageId,
      messages: validatedMessages.messages,
      orgId,
      trigger,
    });
    if ("error" in preparedConversation) {
      return c.json({ error: preparedConversation.error }, 500);
    }
    const { messages } = preparedConversation;

    const agent = createRecruitingCopilotAgent({
      bindingConsent: hasExplicitJobBindingConsent(messages),
      contextBindings,
      conversationId: conversationOwned ? chatId : null,
      focus: resolvedFocus ?? undefined,
      organizationId: orgId,
      visibilityScope,
    });
    agent.__registerMastra(mastra);

    const nativeApproval = extractV6NativeApproval(messages);
    const agentStream = nativeApproval
      ? await agent.resumeStream(nativeApproval.resumeData, { runId: nativeApproval.runId })
      : await agent.stream(await convertToModelMessages(messages));
    const stream = createUIMessageStream<UIMessage>({
      execute: ({ writer }) => {
        writer.merge(
          toAISdkStream(agentStream, {
            from: "agent",
            sendReasoning: false,
            sendSources: true,
            version: "v6",
          }),
        );
      },
      generateId: () => crypto.randomUUID(),
      onError: () => "招聘 Copilot 暂时无法响应，请稍后重试。",
      onFinish: async ({ responseMessage }) => {
        if (!(conversationOwned && chatId)) {
          return;
        }
        if (!responseMessage.id) {
          console.error("[copilot-chat] response message has no id, skipping persist");
          return;
        }
        try {
          await persistChatMessage({ chatId, message: responseMessage, orgId });
        } catch (error) {
          console.error("[copilot-chat] failed to persist assistant message", error);
        }
      },
      originalMessages: messages,
    });

    return createUIMessageStreamResponse({ stream });
  });
