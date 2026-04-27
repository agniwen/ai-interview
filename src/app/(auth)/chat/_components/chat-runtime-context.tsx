"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import type { ChatStatus, FileUIPart, UIMessage } from "ai";
import { createContext, use, useMemo } from "react";
import type { ReactNode } from "react";

/**
 * Three contexts so that high-frequency message updates don't force the
 * composer / dialogs / suggestions to re-render. Consumers pick exactly the
 * slice they need and pay the re-render cost only when that slice changes.
 *
 * - MessagesContext: the messages array. Changes on every streamed chunk.
 *   Consumed by ConversationView + the download button.
 * - StreamingContext: derived booleans (isStreaming + thinking bubble). Flips
 *   only at the start/end of a response (~2× per turn).
 *   Consumed by QuickSuggestions, the dark-mode beam wrapper, and the list.
 * - ActionsContext: status + error + stable callbacks. Changes on status
 *   transitions (~4–5× per response). Consumed by Composer + ErrorBanner.
 */

interface MessagesValue {
  messages: UIMessage[];
}

interface StreamingValue {
  isStreaming: boolean;
  showAssistantThinkingBubble: boolean;
}

export interface SendMessageInput {
  text: string;
  files?: FileUIPart[];
}

interface ActionsValue {
  effectiveStatus: ChatStatus;
  error: Error | undefined;
  stop: () => void;
  regenerate: UseChatHelpers<UIMessage>["regenerate"];
  clearError: UseChatHelpers<UIMessage>["clearError"];
  setMessages: UseChatHelpers<UIMessage>["setMessages"];
  addToolOutput: UseChatHelpers<UIMessage>["addToolOutput"];
  sendMessage: (input: SendMessageInput) => Promise<void>;
}

const MessagesContext = createContext<MessagesValue | null>(null);
const StreamingContext = createContext<StreamingValue | null>(null);
const ActionsContext = createContext<ActionsValue | null>(null);

export function useChatMessagesContext(): MessagesValue {
  const value = use(MessagesContext);
  if (!value) {
    throw new Error("useChatMessagesContext must be used within ChatRuntimeProvider");
  }
  return value;
}

export function useChatStreamingContext(): StreamingValue {
  const value = use(StreamingContext);
  if (!value) {
    throw new Error("useChatStreamingContext must be used within ChatRuntimeProvider");
  }
  return value;
}

export function useChatActionsContext(): ActionsValue {
  const value = use(ActionsContext);
  if (!value) {
    throw new Error("useChatActionsContext must be used within ChatRuntimeProvider");
  }
  return value;
}

export interface ChatRuntimeProviderProps extends MessagesValue, StreamingValue, ActionsValue {
  children: ReactNode;
}

export function ChatRuntimeProvider({
  messages,
  isStreaming,
  showAssistantThinkingBubble,
  effectiveStatus,
  error,
  stop,
  regenerate,
  clearError,
  setMessages,
  addToolOutput,
  sendMessage,
  children,
}: ChatRuntimeProviderProps) {
  // Explicit useMemo so that the context value identity only changes when
  // its inputs actually change. Without this, a per-chunk parent re-render
  // would hand each Provider a fresh object and stampede every consumer
  // (including QuickSuggestions / Composer / DarkModeBeam) every chunk.
  const messagesValue = useMemo<MessagesValue>(() => ({ messages }), [messages]);
  const streamingValue = useMemo<StreamingValue>(
    () => ({ isStreaming, showAssistantThinkingBubble }),
    [isStreaming, showAssistantThinkingBubble],
  );
  const actionsValue = useMemo<ActionsValue>(
    () => ({
      addToolOutput,
      clearError,
      effectiveStatus,
      error,
      regenerate,
      sendMessage,
      setMessages,
      stop,
    }),
    [addToolOutput, clearError, effectiveStatus, error, regenerate, sendMessage, setMessages, stop],
  );

  return (
    <ActionsContext.Provider value={actionsValue}>
      <StreamingContext.Provider value={streamingValue}>
        <MessagesContext.Provider value={messagesValue}>{children}</MessagesContext.Provider>
      </StreamingContext.Provider>
    </ActionsContext.Provider>
  );
}
