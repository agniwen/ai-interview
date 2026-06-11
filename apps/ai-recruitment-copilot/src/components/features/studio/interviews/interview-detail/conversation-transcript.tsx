"use client";

import type { PersistedInterviewTurn } from "@arc/db-schema/interview-session";
import { MessageSquareTextIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import Markdown from "react-markdown";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { coalescePersistedInterviewTurns } from "@arc/shared/interview-transcript-turns";
import { cn } from "@arc/shared/utils";

interface ConversationTranscriptProps {
  turns: PersistedInterviewTurn[];
  activeTurnIndex?: number | null;
  className?: string;
}

export function ConversationTranscript({
  turns,
  activeTurnIndex,
  className,
}: ConversationTranscriptProps) {
  const turnRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const displayTurns = useMemo(() => coalescePersistedInterviewTurns(turns), [turns]);

  useEffect(() => {
    if (activeTurnIndex === null || activeTurnIndex === undefined) {
      return;
    }
    turnRefs.current[activeTurnIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeTurnIndex]);

  if (displayTurns.length === 0) {
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
        {displayTurns.map((turn) => {
          const from = turn.role === "user" ? "user" : "assistant";
          const isUser = from === "user";
          const isActive =
            activeTurnIndex !== null &&
            activeTurnIndex !== undefined &&
            turn.rawTurnIndexes.includes(activeTurnIndex);

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
              <div
                ref={(node) => {
                  for (const turnIndex of turn.rawTurnIndexes) {
                    turnRefs.current[turnIndex] = node;
                  }
                }}
              >
                <MessageContent
                  className={cn(
                    isUser
                      ? undefined
                      : "group-[.is-assistant]:w-fit group-[.is-assistant]:max-w-[88%] group-[.is-assistant]:rounded-2xl group-[.is-assistant]:border group-[.is-assistant]:border-border/70 group-[.is-assistant]:bg-muted/40 group-[.is-assistant]:px-3 group-[.is-assistant]:py-2",
                    isActive && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background",
                  )}
                >
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{turn.message}</span>
                  ) : (
                    <Markdown>{turn.message}</Markdown>
                  )}
                </MessageContent>
              </div>
            </Message>
          );
        })}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
