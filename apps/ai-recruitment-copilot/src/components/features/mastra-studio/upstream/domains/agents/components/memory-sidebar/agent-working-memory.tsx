import { Button } from "@mastra/playground-ui/components/Button";
import { MarkdownRenderer } from "@mastra/playground-ui/components/MarkdownRenderer";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@mastra/playground-ui/components/Tooltip";
import { useCopyToClipboard } from "@mastra/playground-ui/hooks/use-copy-to-clipboard";
import { cn } from "@mastra/playground-ui/utils/cn";
import { toast } from "@mastra/playground-ui/utils/toast";
import { RefreshCcwIcon, ExternalLink } from "lucide-react";
import { useState } from "react";
import { useWorkingMemory } from "../../context/agent-working-memory-context";
import { CodeDisplay } from "./code-display";
import { useMemoryConfig } from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { isTruthy } from "../../utils/truthiness";
import { resolveConditional } from "../../utils/conditional";

interface AgentWorkingMemoryProps {
  agentId: string;
}

export const AgentWorkingMemory = ({ agentId }: AgentWorkingMemoryProps) => {
  const {
    threadExists,
    workingMemoryData,
    workingMemorySource,
    isLoading,
    isUpdating,
    updateWorkingMemory,
  } = useWorkingMemory();

  // Get memory config to check if working memory is enabled
  const { data, isLoading: isConfigLoading } = useMemoryConfig(agentId);
  const config = data?.config;
  // Check if working memory is enabled
  const isWorkingMemoryEnabled = Boolean(config?.workingMemory?.enabled);

  // All hooks must be called before any early returns
  const { isCopied, handleCopy } = useCopyToClipboard({
    copyMessage: "工作记忆已复制！",
    text: workingMemoryData ?? "",
  });
  const [editState, setEditState] = useState({
    source: workingMemoryData,
    value: workingMemoryData ?? "",
  });
  const [isEditing, setIsEditing] = useState(false);

  // Sync the buffer to fresh data, but not while editing — a background refetch or
  // streamed update would otherwise discard the user's in-progress edits.
  if (!isEditing && editState.source !== workingMemoryData) {
    setEditState({ source: workingMemoryData, value: workingMemoryData ?? "" });
  }

  if (isLoading || isConfigLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium text-neutral5">工作记忆</h3>
          {resolveConditional(
            isWorkingMemoryEnabled && workingMemorySource,
            () => (
              <span
                className={cn(
                  "text-xs font-medium px-2 py-0.5 rounded",
                  workingMemorySource === "resource"
                    ? "bg-purple-500/20 text-purple-400"
                    : "bg-blue-500/20 text-blue-400",
                )}
                title={
                  workingMemorySource === "resource"
                    ? "在此智能体的所有会话中共享"
                    : "仅适用于当前对话会话"
                }
              >
                {workingMemorySource}
              </span>
            ),
            () => null,
          )}
        </div>
        {resolveConditional(
          isWorkingMemoryEnabled && !threadExists,
          () => (
            <p className="text-xs text-neutral3">向智能体发送消息后即可使用工作记忆。</p>
          ),
          () => null,
        )}
      </div>

      {isWorkingMemoryEnabled ? (
        <>
          {isTruthy(!isEditing) ? (
            <>
              {workingMemoryData ? (
                <>
                  {workingMemoryData.trim().startsWith("{") ? (
                    <CodeDisplay
                      content={resolveConditional(
                        workingMemoryData,
                        (conditionValue) => conditionValue,
                        () => "",
                      )}
                      isCopied={isCopied}
                      onCopy={handleCopy}
                      className="bg-surface3 text-sm font-mono min-h-[150px] border border-border1 rounded-lg"
                    />
                  ) : (
                    <>
                      <div
                        className="bg-surface3 border border-border1 rounded-lg"
                        style={{ height: "300px" }}
                      >
                        <ScrollArea className="h-full">
                          <div className="p-3 cursor-pointer hover:bg-surface4/20 transition-colors relative group text-ui-xs">
                            <button
                              type="button"
                              onClick={handleCopy}
                              aria-label="复制工作记忆"
                              className="absolute inset-0 z-10 rounded-lg focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent1"
                            />
                            <div className="pointer-events-none">
                              <MarkdownRenderer>{workingMemoryData}</MarkdownRenderer>
                            </div>
                            {resolveConditional(
                              isCopied,
                              () => (
                                <span className="absolute top-2 right-2 z-20 text-ui-xs px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-500 pointer-events-none">
                                  已复制！
                                </span>
                              ),
                              () => null,
                            )}
                            <span className="absolute top-2 right-2 z-20 text-ui-xs px-1.5 py-0.5 rounded-full bg-surface3 text-neutral4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              点击复制
                            </span>
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-sm text-neutral3 font-mono">
                  暂无工作记忆内容。点击“编辑工作记忆”即可添加内容。
                </div>
              )}
            </>
          ) : (
            <textarea
              className="w-full min-h-[150px] p-3 border border-border1 rounded-lg bg-surface3 font-mono text-sm text-neutral5 resize-none"
              value={editState.value}
              onChange={(e) => setEditState((state) => ({ ...state, value: e.target.value }))}
              disabled={isUpdating}
              aria-label="工作记忆内容"
              placeholder="输入工作记忆内容…"
            />
          )}
          <div className="flex gap-2">
            {isTruthy(!isEditing) ? (
              <>
                {isTruthy(!threadExists) ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        aria-disabled="true"
                        onClick={(event) => event.preventDefault()}
                        className="text-xs cursor-not-allowed opacity-50"
                      >
                        编辑工作记忆
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>智能体调用 updateWorkingMemory 后，工作记忆将可用</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    onClick={() => setIsEditing(true)}
                    disabled={isUpdating}
                    className="text-xs"
                  >
                    编辑工作记忆
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  onClick={async () => {
                    try {
                      await updateWorkingMemory(editState.value);
                      setIsEditing(false);
                    } catch (error) {
                      console.error("Failed to update working memory:", error);
                      toast.error("更新工作记忆失败");
                    }
                  }}
                  disabled={isUpdating}
                  className="text-xs"
                >
                  {isUpdating ? <RefreshCcwIcon className="w-3 h-3 animate-spin" /> : "保存更改"}
                </Button>
                <Button
                  onClick={() => {
                    setEditState({
                      source: workingMemoryData,
                      value: workingMemoryData ?? "",
                    });
                    setIsEditing(false);
                  }}
                  disabled={isUpdating}
                  className="text-xs"
                >
                  取消
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="bg-surface3 border border-border1 rounded-lg p-4">
          <p className="text-sm text-neutral3 mb-3">
            此智能体尚未启用工作记忆。启用后可在多次对话间保持上下文。
          </p>
          <a
            href="https://mastra.ai/en/docs/memory/working-memory"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            了解工作记忆
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
};
