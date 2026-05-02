import type { UIMessage } from "ai";
import { Chat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithApprovalResponses,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { LRUCache } from "lru-cache";
import { upsertChatMessageOnServer } from "@/lib/chat-api";
import { notifyConversationsChanged } from "./chat-events";
import { clearChatMeta } from "./chat-meta";
import { createChatTransport } from "./chat-transport";

export interface ChatFinishEvent {
  chatId: string;
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
    console.log("[chat-registry] evicting chat", chatId);
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

async function persistPartialMessage(chatId: string, message: UIMessage) {
  try {
    await upsertChatMessageOnServer(chatId, message);
  } catch (persistError) {
    console.error("[chat] client-side persist failed", persistError);
  }
}

export function getOrCreateChat(
  chatId: string,
  options: { initialMessages?: UIMessage[] } = {},
): Chat<UIMessage> {
  const existing = chats.get(chatId);
  if (existing) {
    return existing;
  }

  const chat = new Chat<UIMessage>({
    id: chatId,
    messages: options.initialMessages ?? [],
    // 工具调用完成后自动续跑下一步;hook 层的 `sendAutomaticallyWhen`
    // 在外部 Chat 实例下会被忽略,必须配置在构造器上。
    // Auto-resume after tool calls finish; the hook-level
    // `sendAutomaticallyWhen` is ignored when an external Chat
    // instance is passed in, so it must live on the constructor.
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      notifyConversationsChanged();

      if (message.role === "assistant" && (isAbort || isDisconnect || isError)) {
        void persistPartialMessage(chatId, message);
      }

      emitFinish({ chatId, isAbort, isDisconnect, isError, message });
    },
    // 工具调用完成后自动续跑下一步;hook 层的 `sendAutomaticallyWhen`
    // 在外部 Chat 实例下会被忽略,必须配置在构造器上。
    // Auto-resume after tool calls finish; the hook-level
    // `sendAutomaticallyWhen` is ignored when an external Chat
    // instance is passed in, so it must live on the constructor.
    sendAutomaticallyWhen: ({ messages }) =>
      lastAssistantMessageIsCompleteWithToolCalls({ messages }) ||
      lastAssistantMessageIsCompleteWithApprovalResponses({ messages }),
    transport: createChatTransport(chatId),
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
