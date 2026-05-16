"use client";

import type { PersistedInterviewTurn } from "@/lib/shared/interview-session";
import { MessageSquareTextIcon } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import { cn } from "@/lib/shared/utils";

interface ConversationTranscriptProps {
  turns: PersistedInterviewTurn[];
  className?: string;
}

export function ConversationTranscript({ turns, className }: ConversationTranscriptProps) {
  if (turns.length === 0) {
    return (
      <ConversationEmptyState
        className={className}
        description="本次面试还未收到对话内容。"
        icon={<MessageSquareTextIcon className="size-6" />}
        title="暂无对话记录"
      />
    );
  }

  return (
    <Conversation className={cn("min-h-0", className)} initial={false}>
      <ConversationContent className="gap-6 px-4 pt-2 pb-4">
        {turns.map((turn) => {
          const from = turn.role === "user" ? "user" : "assistant";
          const isUser = from === "user";

          return (
            <Message from={from} key={turn.id}>
              <div
                className={cn(
                  "flex items-center gap-2 text-muted-foreground text-xs",
                  isUser ? "justify-end" : "justify-start",
                )}
              >
                <span className="font-medium text-foreground">{isUser ? "候选人" : "面试官"}</span>
                <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={turn.createdAt} />
                {typeof turn.timeInCallSecs === "number" ? (
                  <span>· 通话 {turn.timeInCallSecs}s</span>
                ) : null}
              </div>
              <MessageContent
                className={
                  isUser
                    ? undefined
                    : "group-[.is-assistant]:w-fit group-[.is-assistant]:max-w-[88%] group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:border-border/70 group-[.is-assistant]:bg-muted/40 group-[.is-assistant]:px-3 group-[.is-assistant]:py-2"
                }
              >
                <span className="whitespace-pre-wrap">{turn.message}</span>
              </MessageContent>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
