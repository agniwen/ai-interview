import type { UIMessage } from "ai";
import { Chat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { LRUCache } from "lru-cache";
import { upsertChatMessageOnServer } from "@/lib/client/api";
import { notifyConversationsChanged } from "./chat-events";
import { clearChatMeta } from "./chat-meta";
import { createChatTransport } from "./chat-transport";

export interface ChatFinishEvent {
  chatId: string;
  // workspace slug the chat was created under;BackgroundStreamToaster 用它构造链接。
  // Workspace slug the chat lives in; consumed by BackgroundStreamToaster for link building.
  slug: string;
  message: UIMessage;
  isAbort: boolean;
  isDisconnect: boolean;
  isError: boolean;
}

type FinishListener = (event: ChatFinishEvent) => void;

const MAX_ACTIVE_CHATS = 8;

// LRU cap on concurrently-held Chat instances. An in-flight stream evicted
// here is aborted via `chat.stop()` in dispose — the abort path fires the
// Chat's onFinish with isAbort=true, so the partial assistant message is
// still persisted to the DB before the instance is discarded.
const chats = new LRUCache<string, Chat<UIMessage>>({
  dispose: (chat, chatId) => {
    chat.stop();
    clearChatMeta(chatId);
  },
  max: MAX_ACTIVE_CHATS,
});
const finishListeners = new Set<FinishListener>();

function emitFinish(event: ChatFinishEvent) {
  for (const listener of finishListeners) {
    listener(event);
  }
}

async function persistPartialMessage(slug: string, chatId: string, message: UIMessage) {
  try {
    await upsertChatMessageOnServer(slug, chatId, message);
  } catch (persistError) {
    console.error("[chat] client-side persist failed", persistError);
  }
}

export function shouldAutomaticallyContinueChat({ messages }: { messages: UIMessage[] }): boolean {
  return lastAssistantMessageIsCompleteWithApprovalResponses({ messages });
}

export function getOrCreateChat(
  chatId: string,
  slug: string,
  options: { initialMessages?: UIMessage[] } = {},
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
        void persistPartialMessage(slug, chatId, message);
      }

      emitFinish({ chatId, isAbort, isDisconnect, isError, message, slug });
    },
    // Server-executed Mastra tools already continue inside the same stream.
    // A new client request is only needed after the user answers an approval.
    sendAutomaticallyWhen: shouldAutomaticallyContinueChat,
    transport: createChatTransport(chatId, slug),
  });

  chats.set(chatId, chat);
  return chat;
}

export function hasChat(chatId: string): boolean {
  return chats.has(chatId);
}

export function subscribeChatFinish(listener: FinishListener): () => void {
  finishListeners.add(listener);
  return () => {
    finishListeners.delete(listener);
  };
}
