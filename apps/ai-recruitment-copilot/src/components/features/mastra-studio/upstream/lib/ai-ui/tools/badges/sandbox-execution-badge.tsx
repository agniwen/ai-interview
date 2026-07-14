import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { CheckIcon, ChevronUpIcon, CopyIcon, TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DataMessagePart } from "../tool-card";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { ToolApprovalButtons } from "./tool-approval-buttons";
import { WORKSPACE_TOOLS } from "@/components/features/mastra-studio/upstream/domains/workspace/constants";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

// Matches the shape returned by workspace.getInfo() — flat, not nested under "workspace"
interface WorkspaceMetadata {
  toolName?: string;
  id?: string;
  name?: string;
  status?: string;
  sandbox?: {
    id?: string;
    name?: string;
    provider?: string;
    status?: string;
  };
  filesystem?: {
    id?: string;
    name?: string;
    provider?: string;
    status?: string;
  };
}

// Get status dot color based on sandbox status
const getStatusColor = (status?: string) => {
  switch (status) {
    case "running": {
      return "bg-green-500";
    }
    case "starting":
    case "initializing": {
      return "bg-yellow-500";
    }
    case "stopped":
    case "paused": {
      return "bg-gray-500";
    }
    case "error":
    case "failed": {
      return "bg-red-500";
    }
    default: {
      return "bg-accent6";
    }
  }
};

export interface SandboxExecutionBadgeProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  toolName: string;
  args: Record<string, unknown> | string;
  result: unknown;
  metadata?: MessageMetadata;
  toolCalled?: boolean;
  dataParts?: readonly DataMessagePart[];
}

const getPartData = (part?: DataMessagePart) =>
  typeof part?.data === "object" && part.data !== null
    ? (part.data as Record<string, unknown>)
    : undefined;

const isScopedPart = (part: DataMessagePart, toolCallId: string) =>
  getPartData(part)?.toolCallId === toolCallId;

const getCommandDisplay = (
  toolName: string,
  args: SandboxExecutionBadgeProps["args"],
  command?: string,
) => {
  try {
    const parsed = (typeof args === "object" ? args : JSON.parse(args)) as Record<string, unknown>;
    if (toolName === WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND) {
      return typeof parsed.command === "string" ? parsed.command : "";
    }
    if (
      toolName === WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT ||
      toolName === WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS
    ) {
      return command ?? `PID ${String(parsed.pid)}`;
    }
    return "";
  } catch {
    return toolName;
  }
};

const getDisplayName = (toolName: string) => {
  const names: Record<string, string> = {
    [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: "Execute Command",
    [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: "Get Process Output",
    [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: "Kill Process",
  };
  return names[toolName] ?? toolName;
};

const ExecutionStatus = ({
  isRunning,
  elapsedTime,
  exitCode,
  exitSuccess,
  wasKilled,
  executionTime,
}: {
  isRunning: boolean;
  elapsedTime: number;
  exitCode?: number;
  exitSuccess?: boolean;
  wasKilled?: boolean;
  executionTime?: number;
}) => {
  if (isRunning) {
    return (
      <>
        <span className="flex items-center gap-1.5 text-xs text-accent6">
          <span className="w-1.5 h-1.5 bg-accent6 rounded-full animate-pulse" />
          <span className="animate-pulse">running</span>
        </span>
        <span className="text-neutral6 text-xs tabular-nums">{elapsedTime}ms</span>
      </>
    );
  }
  let outcome = null;
  if (exitCode !== undefined) {
    if (exitSuccess) {
      outcome = <CheckIcon className="text-green-400" size={14} />;
    } else if (wasKilled) {
      outcome = (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-500/20 text-orange-400">
          killed
        </span>
      );
    } else {
      outcome = (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
          exit {exitCode}
        </span>
      );
    }
  }
  return (
    <>
      {outcome}
      {executionTime === undefined ? null : (
        <span className="text-neutral6 text-xs">{executionTime}ms</span>
      )}
    </>
  );
};

const getSandboxRunState = (dataParts: DataMessagePart[], toolCallId: string, result: unknown) => {
  const sandboxChunks = dataParts.filter(
    (chunk) =>
      (chunk.name === "sandbox-stdout" || chunk.name === "sandbox-stderr") &&
      isScopedPart(chunk, toolCallId),
  );
  const workspaceMetaPart = dataParts.find(
    (chunk) => chunk.name === "workspace-metadata" && isScopedPart(chunk, toolCallId),
  );
  const exitChunk = dataParts.find(
    (chunk) => chunk.name === "sandbox-exit" && isScopedPart(chunk, toolCallId),
  );
  const exitData = getPartData(exitChunk);
  const streamingContent = sandboxChunks
    .map((chunk) => getPartData(chunk)?.output)
    .filter((output): output is string => typeof output === "string")
    .join("");
  const isStreamingComplete = Boolean(exitChunk) || typeof result === "string";
  const hasStarted = Boolean(workspaceMetaPart);
  return {
    execMeta: getPartData(workspaceMetaPart) as WorkspaceMetadata | undefined,
    executionTime: exitData?.executionTimeMs as number | undefined,
    exitCode: exitData?.exitCode as number | undefined,
    exitSuccess: exitData?.success as boolean | undefined,
    firstChunkTime: getPartData(sandboxChunks[0])?.timestamp as number | undefined,
    hasStarted,
    isRunning: hasStarted && !isStreamingComplete,
    isStreamingComplete,
    outputContent: streamingContent || (typeof result === "string" ? result : ""),
    wasKilled: exitData?.killed as boolean | undefined,
  };
};

// Hook for live elapsed time while running
const useElapsedTime = (isRunning: boolean, startTime?: number) => {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      setElapsed(0);
      startRef.current = startTime || Date.now();
      const interval = setInterval(() => {
        if (startRef.current) {
          setElapsed(Date.now() - startRef.current);
        }
      }, 100);
      return () => clearInterval(interval);
    }
    startRef.current = null;
  }, [isRunning, startTime]);

  return elapsed;
};

interface TerminalBlockProps {
  command?: string;
  content: string;
  maxHeight?: string;
  onCopy?: () => void;
  isCopied?: boolean;
}

const TerminalBlock = ({
  command,
  content,
  maxHeight = "20rem",
  onCopy,
  isCopied,
}: TerminalBlockProps) => {
  const contentRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when content changes
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  return (
    <div className="rounded-md border border-border1 overflow-hidden">
      {/* Terminal header with command */}
      {command && (
        <div className="px-3 py-2 bg-surface3 border-b border-border1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-neutral6 text-xs shrink-0">$</span>
            <code className="text-xs text-neutral-300 font-mono truncate">{command}</code>
          </div>
          {onCopy && (
            <Button
              variant="default"
              size="icon-sm"
              tooltip="Copy output"
              onClick={onCopy}
              className="shrink-0"
            >
              <span className="grid">
                <span
                  style={{ gridArea: "1/1" }}
                  className={cn("transition-transform", isCopied ? "scale-100" : "scale-0")}
                >
                  <CheckIcon size={14} />
                </span>
                <span
                  style={{ gridArea: "1/1" }}
                  className={cn("transition-transform", isCopied ? "scale-0" : "scale-100")}
                >
                  <CopyIcon size={14} />
                </span>
              </span>
            </Button>
          )}
        </div>
      )}
      {/* Terminal content */}
      <pre
        ref={contentRef}
        style={{ maxHeight }}
        className="overflow-x-auto overflow-y-auto p-3 text-sm text-neutral-300 font-mono whitespace-pre-wrap bg-black"
      >
        {content || <span className="text-neutral6 italic">No output</span>}
      </pre>
    </div>
  );
};

export const SandboxExecutionBadge = ({
  toolName,
  args,
  result,
  metadata,
  toolCallId,
  toolApprovalMetadata,
  isNetwork,
  toolCalled: toolCalledProp,
  dataParts: dataPartsProp,
}: SandboxExecutionBadgeProps) => {
  // Get sandbox streaming data parts from the message
  const dataParts = useMemo(
    () => (dataPartsProp ?? []).filter((part) => part.type === "data"),
    [dataPartsProp],
  );

  const [isCollapsed, setIsCollapsed] = useState(false);
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    copiedDuration: 1500,
    showToast: false,
  });
  const { Link } = useLinkComponent();

  // Command info emitted by get_process_output (so we can show the original command)
  const commandChunk = dataParts.find(
    (chunk) => chunk.name === "sandbox-command" && isScopedPart(chunk, toolCallId),
  );

  // Parse args to get command info
  const commandData = getPartData(commandChunk);
  const commandDisplay = getCommandDisplay(
    toolName,
    args,
    typeof commandData?.command === "string" ? commandData.command : undefined,
  );

  const {
    execMeta,
    executionTime,
    exitCode,
    exitSuccess,
    firstChunkTime,
    hasStarted,
    isRunning,
    isStreamingComplete,
    outputContent,
    wasKilled,
  } = getSandboxRunState(dataParts, toolCallId, result);
  const toolCalled = toolCalledProp ?? (isStreamingComplete || hasStarted);

  const displayName = getDisplayName(toolName);

  // Get start time from first streaming chunk for live timer
  const elapsedTime = useElapsedTime(isRunning, firstChunkTime);

  const onCopy = () => {
    if (!outputContent || isCopied) {
      return;
    }
    copyToClipboard(outputContent);
  };

  return (
    <div className="mb-4" data-testid="sandbox-execution-badge">
      {/* Header row */}
      <div className="flex items-center gap-2 justify-between">
        <button
          onClick={() => setIsCollapsed((s) => !s)}
          className="flex items-center gap-2 min-w-0"
          type="button"
        >
          <Icon>
            <ChevronUpIcon
              className={cn("transition-all", isCollapsed ? "rotate-90" : "rotate-180")}
            />
          </Icon>
          <Badge icon={<TerminalSquare className="text-accent6" size={16} />}>{displayName}</Badge>
          {execMeta?.sandbox && (
            <Link
              href={execMeta.id ? `/workspaces/${execMeta.id}` : "/workspaces"}
              className="flex items-center gap-1.5 text-xs text-neutral6 px-1.5 py-0.5 rounded bg-surface3 border border-border1 hover:bg-surface4 hover:border-border2 transition-colors"
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <span
                className={cn("w-1.5 h-1.5 rounded-full", getStatusColor(execMeta.sandbox.status))}
              />
              <span>{execMeta.sandbox.name || execMeta.sandbox.provider}</span>
            </Link>
          )}
        </button>

        {/* Status area */}
        <div className="flex items-center gap-2">
          <ExecutionStatus
            isRunning={isRunning}
            elapsedTime={elapsedTime}
            exitCode={exitCode}
            exitSuccess={exitSuccess}
            wasKilled={wasKilled}
            executionTime={executionTime}
          />
        </div>
      </div>

      {/* Content area */}
      {!isCollapsed && (
        <div className="pt-2">
          {(outputContent || commandDisplay) && (
            <TerminalBlock
              command={commandDisplay}
              content={outputContent}
              onCopy={outputContent ? onCopy : undefined}
              isCopied={isCopied}
            />
          )}

          <ToolApprovalButtons
            toolCalled={toolCalled}
            toolCallId={toolCallId}
            toolApprovalMetadata={toolApprovalMetadata}
            toolName={toolName}
            isNetwork={isNetwork}
            isGenerateMode={metadata?.mode === "generate"}
          />
        </div>
      )}
    </div>
  );
};
