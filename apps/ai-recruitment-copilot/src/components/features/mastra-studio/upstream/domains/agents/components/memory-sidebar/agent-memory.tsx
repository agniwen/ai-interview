import { Button } from "@mastra/playground-ui/components/Button";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { cn } from "@mastra/playground-ui/utils/cn";
import { ExternalLink, Copy } from "lucide-react";
import { useCallback } from "react";
import { AgentObservationalMemory } from "./agent-observational-memory";
import { AgentWorkingMemory } from "./agent-working-memory";
import { useThreadInput } from "@/components/features/mastra-studio/upstream/domains/conversation/context/use-thread-input";
import {
  useMemoryConfig,
  useMemorySearch,
  useCloneThread,
  useMemoryWithOMStatus,
  useThread,
} from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { MemorySearch } from "@/components/features/mastra-studio/upstream/lib/ai-ui/memory-search";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { resolveConditional } from "../../utils/conditional";

interface AgentMemoryProps {
  agentId: string;
  threadId: string;
  memoryType?: "local" | "gateway";
}

export function AgentMemory({ agentId, threadId, memoryType }: AgentMemoryProps) {
  const isGatewayMemory = memoryType === "gateway";
  const { threadInput: chatInputValue } = useThreadInput(threadId);

  const { paths, navigate } = useLinkComponent();

  // Resolve the thread's actual resourceId (may differ from agentId for externally-created threads)
  const { data: thread } = useThread({ agentId, threadId });
  const effectiveResourceId = thread?.resourceId ?? agentId;

  // Get memory config to check if semantic recall is enabled
  const { data, isLoading: isConfigLoading } = useMemoryConfig(agentId);

  // Check if semantic recall is enabled
  const config = data?.config;
  const isSemanticRecallEnabled = Boolean(config?.semanticRecall);

  // Check if observational memory is enabled
  const { data: omStatus } = useMemoryWithOMStatus({
    agentId,
    resourceId: effectiveResourceId,
    threadId,
  });
  const isOMEnabled = omStatus?.observationalMemory?.enabled ?? false;

  // Get memory search hook
  const { mutateAsync: searchMemory, data: searchMemoryData } = useMemorySearch({
    agentId: agentId || "",
    resourceId: effectiveResourceId || "",
    threadId,
  });

  // Get clone thread hook
  const { mutateAsync: cloneThread, isPending: isCloning } = useCloneThread();

  // Handle cloning the current thread
  const handleCloneThread = useCallback(async () => {
    if (!threadId || !agentId) {
      return;
    }

    const result = await cloneThread({ agentId, threadId });
    // Navigate to the cloned thread
    if (result?.thread?.id) {
      navigate(paths.agentThreadLink(agentId, result.thread.id));
    }
  }, [threadId, agentId, cloneThread, navigate, paths]);

  // Handle clicking on a search result to scroll to the message
  const handleResultClick = useCallback(
    (messageId: string, resultThreadId?: string) => {
      // If the result is from a different thread, navigate to that thread with message ID
      if (resultThreadId && resultThreadId !== threadId) {
        navigate(paths.agentThreadLink(agentId, resultThreadId, messageId));
      } else {
        // Find the message element by id and scroll to it
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
          // Optionally highlight the message
          messageElement.classList.add("bg-surface4");
          setTimeout(() => {
            messageElement.classList.remove("bg-surface4");
          }, 2000);
        }
      }
    },
    [agentId, threadId, navigate, paths],
  );

  const searchScope = searchMemoryData?.searchScope;

  if (isConfigLoading) {
    return (
      <div className="flex flex-col h-full p-4 gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-w-0">
      {/* Clone Thread Section */}
      {resolveConditional(
        threadId,
        () => (
          <div className="p-4 border-b border-border1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-neutral5">克隆会话</h3>
                <p className="text-xs text-neutral3 mt-1">创建此对话的副本</p>
              </div>
              <Button onClick={handleCloneThread} disabled={isCloning}>
                <Copy className="w-4 h-4 mr-2" />
                {isCloning ? "正在克隆…" : "克隆"}
              </Button>
            </div>
          </div>
        ),
        () => null,
      )}

      {/* Observational Memory Section - moved above Semantic Recall */}
      {resolveConditional(
        isOMEnabled,
        () => (
          <div className="border-b border-border1 min-w-0 overflow-hidden">
            <AgentObservationalMemory
              agentId={agentId}
              resourceId={effectiveResourceId}
              threadId={threadId}
            />
          </div>
        ),
        () => null,
      )}

      {/* Memory Search Section - hidden for gateway memory */}
      {resolveConditional(
        !isGatewayMemory,
        () => (
          <div className="p-4 border-b border-border1">
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-medium text-neutral5">语义召回</h3>
                {searchMemoryData?.searchScope && (
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded",
                      searchScope === "resource"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-blue-500/20 text-blue-400",
                    )}
                    title={searchScope === "resource" ? "在所有会话中搜索" : "仅在当前会话中搜索"}
                  >
                    {searchScope}
                  </span>
                )}
              </div>
            </div>
            {isSemanticRecallEnabled ? (
              <MemorySearch
                searchMemory={(query) =>
                  searchMemory({ memoryConfig: { lastMessages: 0 }, searchQuery: query })
                }
                onResultClick={handleResultClick}
                currentThreadId={threadId}
                className="w-full"
                chatInputValue={chatInputValue}
              />
            ) : (
              <div className="bg-surface3 border border-border1 rounded-lg p-4">
                <p className="text-sm text-neutral3 mb-3">
                  此智能体尚未启用语义召回。启用后可搜索历史对话。
                </p>
                <a
                  href="https://mastra.ai/en/docs/memory/semantic-recall"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  了解语义召回
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        ),
        () => null,
      )}

      {/* Working Memory Section - hidden for gateway memory */}
      {resolveConditional(
        !isGatewayMemory,
        () => (
          <div>
            <AgentWorkingMemory agentId={agentId} />
          </div>
        ),
        () => null,
      )}

      {/* Gateway Memory indicator */}
      {resolveConditional(
        isGatewayMemory,
        () => (
          <div className="p-4 border-b border-border1">
            <div className="bg-surface3 border border-border1 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                  网关
                </span>
                <h3 className="text-sm font-medium text-neutral5">记忆网关</h3>
              </div>
              <p className="text-xs text-neutral3">
                记忆由记忆网关管理。会话和观测内容存储在远端。
              </p>
            </div>
          </div>
        ),
        () => null,
      )}
    </div>
  );
}
