import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import type { AgentMessage } from "./agent-badge";
import { AgentBadge } from "./agent-badge";
import { LoadingBadge } from "./loading-badge";
import { resolveToChildMessages } from "./resolve-child-messages";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { useAgentMessages } from "@/components/features/mastra-studio/upstream/hooks/use-agent-messages";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";

interface SubAgentToolResult {
  toolName: string;
  toolCallId: string;
  result: unknown;
  args: Record<string, unknown>;
}

export interface AgentBadgeWrapperProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  agentId: string;
  result?: {
    childMessages?: AgentMessage[];
    subAgentResourceId?: string;
    subAgentThreadId?: string;
    subAgentToolResults?: SubAgentToolResult[];
    text?: string;
  };
  metadata?: MessageMetadata;
  suspendPayload?: unknown;
  toolCalled?: boolean;
  isComplete?: boolean;
  renderToolMessage: React.ComponentProps<typeof AgentBadge>["renderToolMessage"];
}

const resolveAgentMessages = (
  result: AgentBadgeWrapperProps["result"],
  fetchedMessages: AgentMessage[],
) => {
  if (result?.childMessages?.length) {
    return result.childMessages;
  }
  if (result?.subAgentToolResults?.length) {
    const messages: AgentMessage[] = result.subAgentToolResults.map((toolResult) => ({
      args: toolResult.args,
      toolCallId: toolResult.toolCallId,
      toolName: toolResult.toolName,
      toolOutput: toolResult.result,
      type: "tool",
    }));
    if (result.text) {
      messages.push({ content: result.text, type: "text" });
    }
    return messages;
  }
  if (result?.text) {
    return [{ content: result.text, type: "text" } satisfies AgentMessage];
  }
  return fetchedMessages;
};

export const AgentBadgeWrapper = ({
  agentId,
  result,
  metadata,
  toolCallId,
  toolApprovalMetadata,
  toolName,
  isNetwork,
  suspendPayload,
  toolCalled,
  isComplete,
  renderToolMessage,
}: AgentBadgeWrapperProps) => {
  const shouldFetchAgentMessages = Boolean(
    result?.subAgentThreadId && !result.text && !result.subAgentToolResults?.length,
  );
  const { data, isLoading } = useAgentMessages({
    agentId,
    memory: true,
    threadId: shouldFetchAgentMessages ? result?.subAgentThreadId : undefined,
  });

  if (isLoading) {
    return <LoadingBadge />;
  }

  const convertedMessages = data?.messages ? toAISdkV5Messages(data.messages) : [];

  // Build child messages from available sources:
  // 1. childMessages (built during live streaming by toUIMessageFromAgent)
  // 2. subAgentToolResults (from backend tool-result, available after approval or on refresh)
  // 3. resolveToChildMessages (fetched from subagent thread via API)
  const childMessages = resolveAgentMessages(
    result,
    resolveToChildMessages(convertedMessages) as AgentMessage[],
  );

  const hasStreamingChildMessages = Boolean(result && Object.hasOwn(result, "childMessages"));

  return (
    <AgentBadge
      agentId={agentId}
      messages={childMessages ?? []}
      keepOpenForStreamingChildMessages={hasStreamingChildMessages}
      metadata={metadata}
      toolCallId={toolCallId}
      toolApprovalMetadata={toolApprovalMetadata}
      toolName={toolName}
      isNetwork={isNetwork}
      suspendPayload={suspendPayload}
      toolCalled={toolCalled}
      isComplete={isComplete}
      renderToolMessage={renderToolMessage}
    />
  );
};
