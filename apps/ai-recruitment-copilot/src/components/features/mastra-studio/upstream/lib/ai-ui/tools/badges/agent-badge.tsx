import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import React from "react";
import type { ReactNode } from "react";
import Markdown from "react-markdown9";
import { BackgroundTaskMetadataDialogTrigger } from "./background-task-metadata-dialog";
import { BadgeWrapper } from "./badge-wrapper";
import { NetworkChoiceMetadataDialogTrigger } from "./network-choice-metadata-dialog";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { ToolApprovalButtons } from "./tool-approval-buttons";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";

interface TextMessage {
  type: "text";
  content: string;
}

interface ToolMessage {
  type: "tool";
  toolName: string;
  toolOutput?: unknown;
  args?: Record<string, unknown>;
  toolCallId: string;
  result?: unknown;
}

export type AgentMessage = TextMessage | ToolMessage;

export interface AgentBadgeProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  agentId: string;
  messages: AgentMessage[];
  metadata?: MessageMetadata;
  suspendPayload?: unknown;
  toolCalled?: boolean;
  isComplete?: boolean;
  keepOpenForStreamingChildMessages?: boolean;
  renderToolMessage: (message: ToolMessage, metadata: MessageMetadata) => ReactNode;
}

const supportsToolMetadata = (metadata?: MessageMetadata) =>
  metadata?.mode === "stream" || metadata?.mode === "network" || metadata?.mode === "generate";

const renderExtraInfo = (metadata: MessageMetadata | undefined, toolCallId: string) => {
  if (metadata?.mode === "network") {
    const { routingDecision } = metadata;
    return (
      <NetworkChoiceMetadataDialogTrigger
        selectionReason={routingDecision?.selectionReason ?? metadata.selectionReason ?? ""}
        input={
          (routingDecision ?? metadata.agentInput) as string | Record<string, unknown> | undefined
        }
      />
    );
  }
  const bgEntry = metadata?.backgroundTasks?.[toolCallId];
  return bgEntry?.taskId && bgEntry.startedAt ? (
    <BackgroundTaskMetadataDialogTrigger backgroundTask={bgEntry} />
  ) : null;
};

const AgentMessages = ({
  messages,
  metadata,
  renderToolMessage,
}: {
  messages: AgentMessage[];
  metadata: MessageMetadata;
  renderToolMessage: AgentBadgeProps["renderToolMessage"];
}) => (
  <>
    {messages.map((message, index) =>
      message.type === "text" ? (
        <Markdown key={index}>{message.content}</Markdown>
      ) : (
        <React.Fragment key={index}>{renderToolMessage(message, metadata)}</React.Fragment>
      ),
    )}
  </>
);

export const AgentBadge = ({
  agentId,
  messages = [],
  metadata,
  toolCallId,
  toolApprovalMetadata,
  toolName,
  isNetwork,
  suspendPayload,
  toolCalled: toolCalledProp,
  isComplete = false,
  keepOpenForStreamingChildMessages = false,
  renderToolMessage,
}: AgentBadgeProps) => {
  const childMetadata: MessageMetadata = {
    mode: "stream",
    requireApprovalMetadata: supportsToolMetadata(metadata)
      ? metadata?.requireApprovalMetadata
      : undefined,
    suspendedTools: supportsToolMetadata(metadata) ? metadata?.suspendedTools : undefined,
  };

  const allChildToolsComplete =
    messages.length > 0 &&
    messages.every((message) => {
      if (message.type === "text") {
        return true;
      }
      return message.toolOutput !== undefined;
    });

  const toolCalled = isNetwork ? (toolCalledProp ?? allChildToolsComplete) : allChildToolsComplete;

  const shouldCollapseContent =
    isComplete && !toolApprovalMetadata && !keepOpenForStreamingChildMessages;

  const suspendPayloadSlot =
    typeof suspendPayload === "string" ? (
      <pre className="whitespace-pre bg-surface4 p-4 rounded-md overflow-x-auto">
        {suspendPayload}
      </pre>
    ) : (
      <CodeEditor
        data={suspendPayload as Record<string, unknown> | Record<string, unknown>[] | undefined}
        data-testid="tool-suspend-payload"
      />
    );

  return (
    <BadgeWrapper
      data-testid="agent-badge"
      icon={<AgentIcon className="text-accent1" />}
      title={agentId}
      initialCollapsed={shouldCollapseContent}
      extraInfo={renderExtraInfo(metadata, toolCallId)}
    >
      <AgentMessages
        messages={messages}
        metadata={childMetadata}
        renderToolMessage={renderToolMessage}
      />

      {suspendPayloadSlot !== undefined && Boolean(suspendPayload) && (
        <div>
          <p className="font-medium pb-2">智能体挂起载荷</p>
          {suspendPayloadSlot}
        </div>
      )}

      <ToolApprovalButtons
        toolCalled={toolCalled}
        toolCallId={toolCallId}
        toolApprovalMetadata={toolApprovalMetadata}
        toolName={toolName}
        isNetwork={isNetwork}
        isGenerateMode={metadata?.mode === "generate"}
      />
    </BadgeWrapper>
  );
};
