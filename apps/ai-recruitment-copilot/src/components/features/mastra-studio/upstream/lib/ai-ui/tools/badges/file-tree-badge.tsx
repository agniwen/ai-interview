import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { CodeEditor } from "@mastra/playground-ui/components/CodeEditor";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ChevronUpIcon, CopyIcon, CheckIcon, FolderTree, HardDrive } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import type { DataMessagePart } from "../tool-card";
import type { ToolApprovalButtonsProps } from "./tool-approval-buttons";
import { ToolApprovalButtons } from "./tool-approval-buttons";
import type { MessageMetadata } from "@/components/features/mastra-studio/upstream/lib/ai-ui/messages/message-metadata";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

// Matches the shape returned by workspace.getInfo()
interface WorkspaceMetadata {
  toolName?: string;
  id?: string;
  name?: string;
  status?: string;
  filesystem?: {
    id?: string;
    name?: string;
    provider?: string;
    status?: string;
  };
  sandbox?: {
    id?: string;
    name?: string;
    provider?: string;
    status?: string;
  };
}

interface ParsedArgs {
  path?: string;
  maxDepth?: number;
  showHidden?: boolean;
  dirsOnly?: boolean;
  exclude?: string;
  extension?: string;
}

export interface FileTreeBadgeProps extends Omit<ToolApprovalButtonsProps, "toolCalled"> {
  toolName: string;
  args: Record<string, unknown> | string;
  result: unknown;
  metadata?: MessageMetadata;
  toolCalled?: boolean;
  dataParts?: readonly DataMessagePart[];
}

const parseArgs = (args: FileTreeBadgeProps["args"]): ParsedArgs => {
  try {
    return typeof args === "object" ? (args as ParsedArgs) : JSON.parse(args);
  } catch {
    return { path: "." };
  }
};

const buildArgsDisplay = (args: ParsedArgs) => {
  const display: string[] = [];
  if (args.maxDepth !== undefined && args.maxDepth !== 3) {
    display.push(`深度：${args.maxDepth}`);
  }
  if (args.showHidden) {
    display.push("包含隐藏项");
  }
  if (args.dirsOnly) {
    display.push("仅目录");
  }
  if (args.exclude) {
    display.push(`排除：${args.exclude}`);
  }
  if (args.extension) {
    display.push(`扩展名：${args.extension}`);
  }
  return display;
};

const parseTreeResult = (result: unknown) => {
  if (typeof result !== "string" || !result) {
    return { summary: "", treeOutput: "" };
  }
  const separator = result.lastIndexOf("\n\n");
  return separator === -1
    ? { summary: "", treeOutput: result }
    : { summary: result.slice(separator + 2), treeOutput: result.slice(0, separator) };
};

const isWorkspaceMetadataPart = (part: DataMessagePart, toolCallId: string) => {
  if (part.type !== "data" || part.name !== "workspace-metadata") {
    return false;
  }
  return (
    typeof part.data === "object" &&
    part.data !== null &&
    "toolCallId" in part.data &&
    part.data.toolCallId === toolCallId
  );
};

const copyTreeOutput = (
  treeOutput: string,
  isCopied: boolean,
  copyToClipboard: (value: string) => void,
) => {
  if (treeOutput && !isCopied) {
    copyToClipboard(treeOutput);
  }
};

const ArgsSummary = ({ values }: { values: string[] }) =>
  values.length > 0 ? (
    <span className="text-neutral4 font-normal ml-1">({values.join(", ")})</span>
  ) : null;

const CollapsedSummary = ({
  isCollapsed,
  hasResult,
  summary,
}: {
  isCollapsed: boolean;
  hasResult: boolean;
  summary: string;
}) =>
  isCollapsed && hasResult && summary ? (
    <span className="text-neutral6 text-xs">{summary}</span>
  ) : null;

export const FileTreeBadge = ({
  toolName,
  args,
  result,
  toolCallId,
  toolApprovalMetadata,
  isNetwork,
  toolCalled: toolCalledProp,
  dataParts,
}: FileTreeBadgeProps) => {
  // Expand by default when approval is required (so buttons are visible)
  const [isCollapsed, setIsCollapsed] = useState(!toolApprovalMetadata);
  const { isCopied, copyToClipboard } = useCopyToClipboard({
    copiedDuration: 1500,
    showToast: false,
  });

  // Sync collapsed state when toolApprovalMetadata changes (like BadgeWrapper does)
  useEffect(() => {
    setIsCollapsed(!toolApprovalMetadata);
  }, [toolApprovalMetadata]);
  const { Link } = useLinkComponent();

  // Parse args
  const parsedArgs = parseArgs(args);

  const { path = ".", maxDepth, showHidden, dirsOnly, exclude, extension } = parsedArgs;

  // Build args display string
  const argsDisplay = buildArgsDisplay({ dirsOnly, exclude, extension, maxDepth, showHidden });

  // Get tree output + summary from result string: "tree\n\nsummary"
  const { treeOutput, summary } = parseTreeResult(result);

  const hasResult = !!treeOutput;
  const toolCalled = toolCalledProp ?? hasResult;

  // Extract filesystem metadata from message data parts (via writer.custom), scoped to this tool call
  const workspaceMetadata = useMemo(
    () => (dataParts ?? []).find((part) => isWorkspaceMetadataPart(part, toolCallId)),
    [dataParts, toolCallId],
  );

  const wsMeta = workspaceMetadata?.data as WorkspaceMetadata | undefined;

  const onCopy = () => {
    copyTreeOutput(treeOutput, isCopied, copyToClipboard);
  };

  return (
    <div className="mb-4" data-testid="file-tree-badge">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
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
          <Badge icon={<FolderTree className="text-accent6" size={16} />}>
            文件列表 <span className="text-neutral6 font-normal ml-1">{path}</span>
            <ArgsSummary values={argsDisplay} />
          </Badge>
        </button>

        {/* Filesystem badge - outside button to prevent overlap */}
        {wsMeta?.filesystem && (
          <Link
            href={
              wsMeta.id
                ? `/workspaces/${wsMeta.id}?path=${encodeURIComponent(path)}`
                : "/workspaces"
            }
            className="flex items-center gap-1.5 text-xs text-neutral6 px-1.5 py-0.5 rounded bg-surface3 border border-border1 hover:bg-surface4 hover:border-border2 transition-colors"
          >
            <HardDrive className="size-3" />
            <span>{wsMeta.name || wsMeta.filesystem.name}</span>
          </Link>
        )}

        {/* Summary - show in header when collapsed */}
        <CollapsedSummary isCollapsed={isCollapsed} hasResult={hasResult} summary={summary} />
      </div>

      {/* Content area */}
      {!isCollapsed && (
        <div className="pt-2">
          {/* Approval UI - styled like ToolBadge/BadgeWrapper when awaiting approval */}
          {toolApprovalMetadata && !toolCalled && (
            <div className="p-4 rounded-lg bg-surface2 flex flex-col gap-4">
              <div>
                <p className="font-medium pb-2">工具参数</p>
                <CodeEditor data={parsedArgs as Record<string, unknown>} data-testid="tool-args" />
              </div>
              <ToolApprovalButtons
                toolCalled={toolCalled}
                toolCallId={toolCallId}
                toolApprovalMetadata={toolApprovalMetadata}
                toolName={toolName}
                isNetwork={isNetwork}
              />
            </div>
          )}

          {/* Tree output panel - custom UI after tool has been called */}
          {toolCalled && treeOutput && (
            <div className="rounded-md border border-border1 bg-surface2 overflow-hidden">
              {/* Panel header with summary and copy button */}
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border1 bg-surface3">
                {summary && <span className="text-neutral6 text-xs">{summary}</span>}
                <Button
                  variant="default"
                  size="icon-sm"
                  tooltip="复制目录树"
                  onClick={onCopy}
                  disabled={!treeOutput}
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
              </div>

              {/* Tree content */}
              <pre className="p-3 text-xs font-mono text-mastra-el-6 overflow-x-auto whitespace-pre max-h-dropdown-max-height overflow-y-auto">
                {treeOutput}
              </pre>
            </div>
          )}

          {/* Loading state */}
          {toolCalled && !hasResult && (
            <div className="rounded-md border border-border1 bg-surface2 px-3 py-2">
              <span className="text-xs text-neutral6">加载中...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
