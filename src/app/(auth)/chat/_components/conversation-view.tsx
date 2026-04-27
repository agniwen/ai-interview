"use client";

import type { UIMessage } from "ai";
import { SparklesIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { getMessageTimeValue } from "../_lib/chat-message-utils";
import { ChatMessageItem } from "./chat-message-item";
import { useChatMessagesContext, useChatStreamingContext } from "./chat-runtime-context";

interface ConversationViewProps {
  userName: string;
  resumeImports: Record<string, string>;
  onResumeImported: (partId: string, interviewId: string) => void;
  onResumeImportMissing: (partId: string) => void;
  onApplyJDConfirm: (toolCallId: string, jobDescriptionId: string) => Promise<void>;
  onApplyJDIgnore: (toolCallId: string) => Promise<void>;
  onRegenerate: () => void;
}

interface MessageRenderEntry {
  message: UIMessage;
  startedAt: string | null;
}

function buildRenderEntries(messages: UIMessage[]): MessageRenderEntry[] {
  // Single pass that tracks the most recent user-message timestamp so each
  // assistant message gets its "started at" without an O(n) lookup per item.
  const entries: MessageRenderEntry[] = [];
  let lastUserStartedAt: string | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      const time = getMessageTimeValue(message);
      lastUserStartedAt = time ? time.toISOString() : null;
      entries.push({ message, startedAt: null });
    } else {
      entries.push({ message, startedAt: lastUserStartedAt });
    }
  }
  return entries;
}

function AssistantThinkingBubble() {
  return (
    <div>
      <p className="mb-2 text-left text-muted-foreground text-xs">
        简历筛选助手 · <TimeDisplay as="span" options={TIME_DISPLAY_OPTIONS} value={Date.now()} />
      </p>
      <Message from="assistant">
        <MessageContent className="px-0 py-1">
          <div aria-label="简历筛选助手正在思考" className="text-muted-foreground/80" role="status">
            <Shimmer duration={1.2}>思考中...</Shimmer>
          </div>
        </MessageContent>
      </Message>
    </div>
  );
}

export function ConversationView({
  userName,
  resumeImports,
  onResumeImported,
  onResumeImportMissing,
  onApplyJDConfirm,
  onApplyJDIgnore,
  onRegenerate,
}: ConversationViewProps) {
  const { messages } = useChatMessagesContext();
  const { isStreaming, showAssistantThinkingBubble } = useChatStreamingContext();
  const entries = buildRenderEntries(messages);

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <Conversation className="h-full">
        <ConversationContent className="mx-auto w-full max-w-5xl px-2 py-4 sm:py-6 md:px-6">
          {entries.length === 0 ? (
            <ConversationEmptyState
              className="my-10 rounded-2xl border border-dashed border-border/70 bg-background/70"
              description="上传候选人简历（最多 8 份）或输入筛选要求，助手会给出评分与推荐结论。"
              icon={<SparklesIcon className="size-5" />}
              title="开始筛选简历"
            />
          ) : (
            <>
              {entries.map(({ message, startedAt }, messageIndex) => {
                const isLastMessage = messageIndex === entries.length - 1;
                return (
                  <ChatMessageItem
                    isLastMessage={isLastMessage}
                    isStreaming={isStreaming}
                    key={message.id}
                    message={message}
                    onApplyJDConfirm={onApplyJDConfirm}
                    onApplyJDIgnore={onApplyJDIgnore}
                    onRegenerate={onRegenerate}
                    onResumeImported={onResumeImported}
                    onResumeImportMissing={onResumeImportMissing}
                    resumeImports={resumeImports}
                    startedAt={startedAt}
                    userName={userName}
                  />
                );
              })}
              {showAssistantThinkingBubble ? <AssistantThinkingBubble /> : null}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
