"use client";

import type { AgentState, ReceivedMessage } from "@livekit/components-react";
import type { ComponentProps, ReactNode } from "react";
import type { OverlayScrollbars } from "overlayscrollbars";
import { useStickToBottomContext } from "use-stick-to-bottom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnimatePresence } from "motion/react";
import { AgentChatIndicator } from "@/components/agents-ui/agent-chat-indicator";
import { Conversation, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

import {
  interviewConnectionState,
  interviewConnectionText,
} from "@/lib/client/interview-connection-status";

/**
 * Props for the AgentChatTranscript component.
 */
export interface AgentChatTranscriptProps extends ComponentProps<"div"> {
  /**
   * The current state of the agent. When 'thinking', displays a loading indicator.
   */
  agentState?: AgentState;
  /**
   * Array of messages to display in the transcript.
   * @defaultValue []
   */
  messages?: ReceivedMessage[];
  /**
   * Additional CSS class names to apply to the conversation container.
   */
  className?: string;
}

function TranscriptScrollArea({ children }: { children: ReactNode }) {
  const { scrollRef, contentRef } = useStickToBottomContext();
  return (
    <ScrollArea
      className="h-full [--scroll-fade-size:2rem]"
      scrollFade
      events={{
        initialized: (instance: OverlayScrollbars) => scrollRef(instance.elements().viewport),
        destroyed: () => scrollRef(null),
      }}
    >
      <div ref={contentRef} className="flex flex-col gap-8 px-4 py-5 md:px-6">
        {children}
      </div>
    </ScrollArea>
  );
}

/**
 * A chat transcript component that displays a conversation between the user and agent.
 * Shows messages with timestamps and origin indicators, plus a thinking indicator
 * when the agent is processing.
 *
 * @extends ComponentProps<'div'>
 *
 * @example
 * ```tsx
 * <AgentChatTranscript
 *   agentState={agentState}
 *   messages={chatMessages}
 * />
 * ```
 */
export function AgentChatTranscript({
  agentState,
  messages = [],
  className,
  ...props
}: AgentChatTranscriptProps) {
  return (
    <Conversation className={className} {...props}>
      <TranscriptScrollArea>
        {messages.map((receivedMessage) => {
          const { id, timestamp, from, message } = receivedMessage;
          const connectionState = interviewConnectionState(receivedMessage);
          if (connectionState) {
            return (
              <p key={id} role="status" className="py-2 text-center text-sm text-muted-foreground">
                {interviewConnectionText(connectionState)}
              </p>
            );
          }
          const locale = navigator?.language ?? "en-US";
          const messageOrigin = from?.isLocal ? "user" : "assistant";
          const time = new Date(timestamp);
          const title = time.toLocaleTimeString(locale, { timeStyle: "full" });

          return (
            <Message key={id} title={title} from={messageOrigin}>
              <MessageContent className="group-[.is-user]:rounded-xl group-[.is-user]:border-transparent group-[.is-user]:bg-card group-[.is-user]:shadow-default dark:group-[.is-user]:bg-card">
                <MessageResponse>{message}</MessageResponse>
              </MessageContent>
            </Message>
          );
        })}
        <AnimatePresence>
          {agentState === "thinking" && <AgentChatIndicator size="sm" />}
        </AnimatePresence>
      </TranscriptScrollArea>
      <ConversationScrollButton className="rounded-lg border-transparent bg-control shadow-default hover:bg-component" />
    </Conversation>
  );
}
