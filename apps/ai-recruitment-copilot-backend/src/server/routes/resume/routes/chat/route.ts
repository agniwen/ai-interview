import type { ModelMessage, UIMessage } from "ai";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { zValidator } from "@hono/zod-validator";
import { toAISdkStream } from "@mastra/ai-sdk";
import { legacyUiMessageToArcMessage } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/adapters/arc-message-adapter";
import { createRecruitingCopilotAgent } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/recruiting-copilot-agent";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resumeChatRequestSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/schema";
import {
  checkConversationOwner,
  deleteMessagesFromId,
  upsertChatMessage,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";

function latestUserMessage(messages: UIMessage[]) {
  return [...messages]
    .toReversed()
    .find(
      (message): message is UIMessage =>
        typeof message === "object" && message !== null && message.role === "user",
    );
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function toModelMessages(messages: UIMessage[]): ModelMessage[] {
  return messages
    .map((message): ModelMessage | null => {
      const content = messageText(message);
      if (!content) {
        return null;
      }
      return { content, role: message.role };
    })
    .filter((message): message is ModelMessage => message !== null);
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

export const resumeChatRouter = factory
  .createApp()
  .post("/", zValidator("json", resumeChatRequestSchema), async (c) => {
    const { chatId, messages: rawMessages, trigger, messageId } = c.req.valid("json");

    const userId = c.var.user?.id;
    const orgId = (c.var.session as { activeOrganizationId?: string | null } | null)
      ?.activeOrganizationId;
    if (!orgId) {
      return c.json({ error: "No active workspace" }, 400);
    }

    const conversationOwned =
      userId && chatId ? (await checkConversationOwner(userId, chatId, orgId)) === "ok" : false;

    let messages = rawMessages as UIMessage[];
    if (trigger === "regenerate-message" && messageId) {
      const cutoff = messages.findIndex((message) => message.id === messageId);
      if (cutoff !== -1) {
        messages = messages.slice(0, cutoff);
      }
      if (conversationOwned && chatId) {
        try {
          await deleteMessagesFromId({ conversationId: chatId, messageId });
        } catch (error) {
          console.error("[copilot-chat] failed to prune messages on regenerate", error);
        }
      }
    }

    if (conversationOwned && chatId) {
      const latestUser = latestUserMessage(messages);
      if (latestUser) {
        void (async () => {
          try {
            await persistChatMessage({ chatId, message: latestUser, orgId });
          } catch (error) {
            console.error("[copilot-chat] failed to persist user message", error);
          }
        })();
      }
    }

    const agent = createRecruitingCopilotAgent({ organizationId: orgId });
    const agentStream = await agent.stream(toModelMessages(messages));
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
