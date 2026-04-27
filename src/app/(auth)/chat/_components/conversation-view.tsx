"use client";

import type { UIMessage } from "ai";
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

function ResumeScreeningIllustration() {
  return (
    <svg
      aria-hidden="true"
      className="size-20 text-primary sm:size-24"
      fill="none"
      viewBox="0 0 112 112"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="screening-flow"
          x1="18"
          x2="94"
          y1="26"
          y2="86"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path
        d="M20 23.5h29l11 11v45H20z"
        fill="currentColor"
        fillOpacity="0.08"
        stroke="url(#screening-flow)"
        strokeWidth="2.5"
      />
      <path d="M49 23.5V35h11" stroke="url(#screening-flow)" strokeWidth="2.5" />
      <path
        d="M29 44h20M29 52h14M29 60h11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.78"
        strokeWidth="2.5"
      />
      <rect
        fill="currentColor"
        fillOpacity="0.08"
        height="31"
        rx="10"
        stroke="url(#screening-flow)"
        strokeWidth="2.5"
        width="32"
        x="60"
        y="50"
      />
      <path
        d="M68 66.5 73.5 72l10.5-11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M61 37h11.5c7.18 0 13 5.82 13 13v3"
        stroke="url(#screening-flow)"
        strokeDasharray="4 5"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <path
        d="m81 50 4.5 5 4.5-5"
        stroke="url(#screening-flow)"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
      <circle
        cx="79.5"
        cy="25.5"
        fill="currentColor"
        fillOpacity="0.12"
        r="8.5"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="2"
      />
      <path
        d="M79.5 21.5v8M75.5 25.5h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.78"
        strokeWidth="2.2"
      />
      <path
        d="M14 77h10M88 86h10M12 33h5M92 40h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.3"
        strokeWidth="2"
      />
    </svg>
  );
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
              className="my-10 rounded-[1.75rem] border border-border/45 bg-background/28 backdrop-blur-md"
              description="上传候选人简历（最多 8 份）或输入筛选要求，助手会给出评分与推荐结论。"
              icon={<ResumeScreeningIllustration />}
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
