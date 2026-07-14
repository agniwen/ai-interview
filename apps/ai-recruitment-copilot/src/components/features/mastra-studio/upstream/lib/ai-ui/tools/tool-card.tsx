import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { AskUserTool } from "./ask-user-tool";
import { AgentBadgeWrapper } from "./badges/agent-badge-wrapper";
import type { AgentBadgeWrapperProps } from "./badges/agent-badge-wrapper";
import { CodeModeBadge, getCodeModeCall } from "./badges/code-mode-badge";
import { FileTreeBadge } from "./badges/file-tree-badge";
import { ObservationMarkerBadge } from "./badges/observation-marker-badge";
import { SandboxExecutionBadge } from "./badges/sandbox-execution-badge";
import { ToolBadge } from "./badges/tool-badge";
import { useWorkflowStream, WorkflowBadge } from "./badges/workflow-badge";
import type { WorkflowBadgeProps } from "./badges/workflow-badge";
import { useActivatedSkills } from "@/components/features/mastra-studio/upstream/domains/agents/context/activated-skills-context";
import {
  isBrowserTool,
  isBrowserToolError,
  useBrowserToolCallsSafe,
} from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-tool-calls-context";
import type { BrowserSessionProbe } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-browser-session-probe";
import { McpAppToolResult } from "@/components/features/mastra-studio/upstream/domains/mcps/components/mcp-app-tool-result";
import { useMcpAppTools } from "@/components/features/mastra-studio/upstream/domains/mcps/hooks/use-mcp-app-tools";
import { WorkflowRunProvider } from "@/components/features/mastra-studio/upstream/domains/workflows";
import { WORKSPACE_TOOLS } from "@/components/features/mastra-studio/upstream/domains/workspace/constants";
import { useChatSend } from "@/components/features/mastra-studio/upstream/lib/ai-ui/chat/chat-context";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";

/**
 * Plain-prop tool dispatcher for the main agent chat, replacing assistant-ui's
 * `ToolFallback` (which read `ToolCallMessagePartProps`/`useAui`). `MessageRow`
 * normalizes both v4 `ToolInvocation` and v5 `DynamicTool` parts into this shape.
 *
 * It is a real component (not a render function) on purpose: it must host hooks —
 * notably `useWorkflowStream(output)` inside `WorkflowRunProvider` so a streaming
 * workflow run keeps animating a live `WorkflowGraph`, exactly as before.
 */
/**
 * A `data`-typed message part emitted by the agent via `writer.custom`, scoped to
 * a tool call by `data.toolCallId`. `MessageRow` collects these from the parent
 * `MastraDBMessage` and forwards them so badges (file-tree, sandbox) can read live
 * streaming metadata without reaching into assistant-ui state.
 */
export interface DataMessagePart {
  type: string;
  name?: string;
  data?: unknown;
}

export interface ToolCardProps {
  toolName: string;
  input?: Record<string, unknown>;
  output?: unknown;
  toolCallId: string;
  /** Part state: v5 `output-available`/`output-error`/`input-available`, or v4 `result`/`call`. */
  state?: string;
  metadata?: MessageMetadata;
  /** `data`-typed parts from the parent message, for badges that read live streaming metadata. */
  dataParts?: readonly DataMessagePart[];
}

const TASK_TOOL_NAMES = new Set(["task_write", "task_update", "task_complete", "task_check"]);
const EMPTY_ARGS: Record<string, unknown> = {};
const renderHiddenTool = () => null;

const getToolIdentity = (toolName: string, metadata?: MessageMetadata) => {
  const isAgent =
    (metadata?.mode === "network" && metadata.from === "AGENT") || toolName.startsWith("agent-");
  const isWorkflow =
    (metadata?.mode === "network" && metadata.from === "WORKFLOW") ||
    toolName.startsWith("workflow-");
  return {
    agentToolName: toolName.startsWith("agent-") ? toolName.slice("agent-".length) : toolName,
    isAgent,
    isNetwork: metadata?.mode === "network",
    isWorkflow,
    workflowToolName: toolName.startsWith("workflow-")
      ? toolName.slice("workflow-".length)
      : toolName,
  };
};

const getToolMetadata = (
  metadata: MessageMetadata | undefined,
  toolName: string,
  toolCallId: string,
) => {
  const supportsMetadata =
    metadata?.mode === "stream" || metadata?.mode === "network" || metadata?.mode === "generate";
  const approvals = supportsMetadata ? metadata?.requireApprovalMetadata : undefined;
  const suspendedTools = supportsMetadata ? metadata?.suspendedTools : undefined;
  return {
    suspendedToolMetadata: suspendedTools?.[toolName] ?? suspendedTools?.[toolCallId],
    toolApprovalMetadata: approvals?.[toolName] ?? approvals?.[toolCallId],
    toolCalled: metadata?.mode === "network" && metadata.hasMoreMessages ? true : undefined,
  };
};

const getDisplayToolName = (
  toolName: string,
  agentToolName: string,
  workflowToolName: string,
  isAgent: boolean,
  isWorkflow: boolean,
) => {
  if (isAgent) {
    return agentToolName;
  }
  return isWorkflow ? workflowToolName : toolName;
};

export const ToolCardInner = ({
  toolName,
  input,
  output,
  toolCallId,
  state,
  metadata,
  dataParts,
}: ToolCardProps) => {
  // All hooks must run unconditionally before any conditional returns.
  const browserCtx = useBrowserToolCallsSafe();
  const isBrowser = isBrowserTool(toolName);
  const { activateSkill } = useActivatedSkills();
  const { data: mcpAppToolsMap } = useMcpAppTools();
  const send = useChatSend();
  const queryClient = useQueryClient();

  const args = input ?? EMPTY_ARGS;
  const result = output;
  const resultRecord =
    typeof result === "object" && result !== null ? (result as Record<string, unknown>) : undefined;
  const isComplete = state === "output-available" || state === "result";

  const handleMcpAppSendMessage = useCallback(
    (content: string) => {
      send({ message: content });
    },
    [send],
  );

  useEffect(() => {
    if (!isBrowser || !browserCtx) {
      return;
    }

    let status: "pending" | "complete" | "error" = "pending";
    if (result !== undefined) {
      status = isBrowserToolError(result) ? "error" : "complete";
    }

    browserCtx.registerToolCall({
      args: typeof args === "object" ? args : {},
      result,
      status,
      timestamp: Date.now(),
      toolCallId,
      toolName,
    });

    // Seeing any browser tool call means the server has an active session for
    // this thread, so the probe can flip to `hasSession: true` immediately.
    // `setQueriesData` always notifies observers, so read synchronously via
    // `getQueriesData` first and only write entries that need to change.
    // Preserve each probe's existing `screencastAvailable`.
    const cachedProbes = queryClient.getQueriesData<BrowserSessionProbe>({
      queryKey: ["browser-session-probe"],
    });
    const needsUpdate = cachedProbes.some(
      ([, data]) => data?.screencastAvailable && !data.hasSession,
    );
    if (needsUpdate) {
      queryClient.setQueriesData<BrowserSessionProbe>(
        { queryKey: ["browser-session-probe"] },
        (prev) => {
          if (!prev) {
            return prev;
          }
          if (!prev.screencastAvailable) {
            return prev;
          }
          if (prev.hasSession) {
            return prev;
          }
          return { ...prev, hasSession: true };
        },
      );
    }
  }, [isBrowser, toolCallId, toolName, args, result, browserCtx, queryClient]);

  // Detect skill activation tool calls.
  useEffect(() => {
    if (toolName !== "skill") {
      return;
    }
    if (typeof args.name !== "string") {
      return;
    }
    if (!isComplete) {
      return;
    }
    activateSkill(args.name);
  }, [toolName, args?.name, isComplete, activateSkill]);

  useWorkflowStream(result as WorkflowBadgeProps["result"]);

  // OM observation markers render as ObservationMarkerBadge.
  const renderObservation = () => {
    const omData = (resultRecord?.omData ?? args) as Record<string, unknown>;
    return (
      <ObservationMarkerBadge
        toolName={toolName}
        args={omData}
        metadata={metadata ? { ...metadata, omData } : undefined}
      />
    );
  };

  const { agentToolName, isAgent, isNetwork, isWorkflow, workflowToolName } = getToolIdentity(
    toolName,
    metadata,
  );
  const { suspendedToolMetadata, toolApprovalMetadata, toolCalled } = getToolMetadata(
    metadata,
    toolName,
    toolCallId,
  );

  const isBackgroundTaskResult =
    result && typeof result === "string" && result.toLowerCase().includes("background task");

  // ask_user tool renders a dedicated interactive component for answering questions.
  const renderAskUser = () => (
    <AskUserTool toolName={toolName} toolCallId={toolCallId} output={output} metadata={metadata} />
  );

  const renderBackgroundTask = () => (
    <ToolBadge
      toolName={getDisplayToolName(toolName, agentToolName, workflowToolName, isAgent, isWorkflow)}
      args={args}
      result={result as AgentBadgeWrapperProps["result"]}
      toolOutput={[]}
      metadata={metadata}
      toolCallId={toolCallId}
      toolApprovalMetadata={toolApprovalMetadata}
      suspendPayload={suspendedToolMetadata?.suspendPayload}
      isNetwork={isNetwork}
      toolCalled={toolCalled}
      withoutArgs={isAgent || isWorkflow}
    />
  );

  const renderAgent = () => (
    <AgentBadgeWrapper
      agentId={agentToolName}
      result={result as AgentBadgeWrapperProps["result"]}
      metadata={metadata}
      toolCallId={toolCallId}
      toolApprovalMetadata={toolApprovalMetadata}
      toolName={toolName}
      isNetwork={isNetwork}
      suspendPayload={suspendedToolMetadata?.suspendPayload}
      toolCalled={toolCalled}
      isComplete={isComplete}
      renderToolMessage={(message, childMetadata) => (
        <WorkflowRunProvider workflowId="" withoutTimeTravel>
          <ToolCardInner
            toolName={message.toolName}
            input={message.args}
            output={message.toolOutput}
            state="output-available"
            toolCallId={message.toolCallId}
            metadata={childMetadata}
          />
        </WorkflowRunProvider>
      )}
    />
  );

  const renderWorkflow = () => {
    const isStreaming = metadata?.mode === "stream" || metadata?.mode === "network";

    return (
      <WorkflowBadge
        workflowId={workflowToolName}
        isStreaming={isStreaming}
        result={result as WorkflowBadgeProps["result"]}
        metadata={metadata}
        toolCallId={toolCallId}
        toolApprovalMetadata={toolApprovalMetadata}
        suspendPayload={suspendedToolMetadata?.suspendPayload}
        toolName={toolName}
        isNetwork={isNetwork}
        toolCalled={toolCalled}
      />
    );
  };

  const isListFiles = toolName === WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES;

  const renderFileList = () => (
    <FileTreeBadge
      toolName={toolName}
      args={args}
      result={result}
      metadata={metadata}
      toolCallId={toolCallId}
      toolApprovalMetadata={toolApprovalMetadata}
      isNetwork={isNetwork ?? false}
      toolCalled={toolCalled}
      dataParts={dataParts}
    />
  );

  const isSandboxExecution =
    toolName === WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND ||
    toolName === WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT ||
    toolName === WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS;

  const renderSandbox = () => (
    <SandboxExecutionBadge
      toolName={toolName}
      args={args}
      result={result}
      metadata={metadata}
      toolCallId={toolCallId}
      toolApprovalMetadata={toolApprovalMetadata}
      isNetwork={isNetwork}
      toolCalled={toolCalled}
      dataParts={dataParts}
    />
  );

  // Code Mode (`execute_typescript`) calls carry a `code` string arg and a
  // `CodeModeResult` shape. Detect by shape since the tool id is configurable.
  const codeModeCall = getCodeModeCall(args, result);

  const renderCodeMode = () => {
    if (!codeModeCall) {
      return null;
    }
    return (
      <CodeModeBadge
        toolName={toolName}
        code={codeModeCall.code}
        result={codeModeCall.result}
        metadata={metadata}
        toolCallId={toolCallId}
        toolApprovalMetadata={toolApprovalMetadata}
        isNetwork={isNetwork}
        toolCalled={toolCalled}
      />
    );
  };

  const mcpAppInfo = mcpAppToolsMap?.[toolName];

  const renderFallback = () => (
    <>
      <ToolBadge
        toolName={toolName}
        args={args}
        result={result}
        toolOutput={(resultRecord?.toolOutput as { toolId: string }[] | undefined) ?? []}
        metadata={metadata}
        toolCallId={toolCallId}
        toolApprovalMetadata={toolApprovalMetadata}
        suspendPayload={suspendedToolMetadata?.suspendPayload}
        isNetwork={isNetwork}
        toolCalled={toolCalled}
      />
      {mcpAppInfo && result !== undefined && (
        <McpAppToolResult
          appInfo={mcpAppInfo}
          toolArgs={args}
          toolResult={result}
          onSendMessage={handleMcpAppSendMessage}
        />
      )}
    </>
  );

  const renderers = [
    { matches: () => toolName === "mastra-memory-om-observation", render: renderObservation },
    { matches: () => toolName === "updateWorkingMemory", render: renderHiddenTool },
    { matches: () => TASK_TOOL_NAMES.has(toolName), render: renderHiddenTool },
    { matches: () => toolName === "ask_user", render: renderAskUser },
    { matches: () => Boolean(isBackgroundTaskResult), render: renderBackgroundTask },
    { matches: () => isAgent, render: renderAgent },
    { matches: () => isWorkflow, render: renderWorkflow },
    { matches: () => isListFiles, render: renderFileList },
    { matches: () => isSandboxExecution, render: renderSandbox },
    { matches: () => Boolean(codeModeCall), render: renderCodeMode },
  ];
  return renderers.find(({ matches }) => matches())?.render() ?? renderFallback();
};

export const ToolCard = (props: ToolCardProps) => (
  <WorkflowRunProvider workflowId="" withoutTimeTravel>
    <ToolCardInner {...props} />
  </WorkflowRunProvider>
);
