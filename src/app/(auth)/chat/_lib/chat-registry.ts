import type { UIMessage } from "ai";
import { Chat } from "@ai-sdk/react";
import { LRUCache } from "lru-cache";
import { upsertChatMessageOnServer } from "@/lib/chat-api";
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
  },
  max: MAX_ACTIVE_CHATS,
});
const finishListeners = new Set<FinishListener>();

function notifyConversationsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("chat:conversations-changed"));
  }
}

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
    onFinish: ({ message, isAbort, isDisconnect, isError }) => {
      notifyConversationsChanged();

      if (message.role === "assistant" && (isAbort || isDisconnect || isError)) {
        void persistPartialMessage(chatId, message);
      }

      emitFinish({ chatId, isAbort, isDisconnect, isError, message });
    },
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
