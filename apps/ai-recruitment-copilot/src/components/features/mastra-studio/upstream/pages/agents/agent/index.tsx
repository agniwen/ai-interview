import { v4 as uuid } from "@lukeed/uuid";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useEffect, useMemo } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import { AgentSidebar } from "@/components/features/mastra-studio/upstream/domains/agents/agent-sidebar";
import { AgentChat } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-chat";
import { AgentChatShell } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-chat-shell";
import {
  AgentSidebarLoadingSkeleton,
  AgentViewLoadingSkeleton,
} from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-loading-skeletons";
import { AgentSettingsView } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-settings/agent-settings-view";
import { BrowserViewPanel } from "@/components/features/mastra-studio/upstream/domains/agents/components/browser-view";
import { ComposerRunOptions } from "@/components/features/mastra-studio/upstream/domains/agents/components/composer-run-options";
import "@/components/features/mastra-studio/upstream/domains/agents/components/agent-view-transition.css";
import { ActivatedSkillsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/activated-skills-context";
import { AgentSettingsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-context";
import { ObservationalMemoryProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import { WorkingMemoryProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-working-memory-context";
import { BrowserSessionProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-session-provider";
import { BrowserToolCallsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-tool-calls-context";
import { MemoryTimelineProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/memory-timeline-context";
import { useAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent";
import { buildAgentDefaultSettings } from "@/components/features/mastra-studio/upstream/domains/agents/utils/agent-default-settings";
import { resolveConditional } from "@/components/features/mastra-studio/upstream/domains/agents/utils/conditional";
import { firstDefined } from "@/components/features/mastra-studio/upstream/domains/agents/utils/presence";
import { ThreadInputProvider } from "@/components/features/mastra-studio/upstream/domains/conversation/context/thread-input-provider";
import {
  useMemory,
  useThreads,
} from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { SchemaRequestContextProvider } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

// With View Transitions support the chat/settings switch is choreographed in
// agent-view-transition.css; the in-DOM enter animation would replay inside the
// captured snapshot and double the motion, so it only serves as a fallback.
const supportsViewTransitions =
  typeof document !== "undefined" && "startViewTransition" in document;

function Agent({ view = "chat" }: { view?: "chat" | "settings" }) {
  const { agentId, threadId } = useParams();
  const [searchParams] = useSearchParams();
  const { data: agent, isLoading: isAgentLoading, error } = useAgent(agentId);
  const { data: memory } = useMemory(agentId);
  const navigate = useNavigate();
  const isSettingsView = view === "settings";
  const isNewThread = threadId === "new";

  // Generate a stable thread ID for new threads. Regenerate when threadId
  // changes (e.g., clicking "New Chat" navigates back to /chat/new).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- threadId is intentional: we need a new UUID per thread
  const newThreadId = useMemo(() => uuid(), [threadId]);

  const hasMemory = Boolean(memory?.result);

  const {
    data: threads,
    isLoading: isThreadsLoading,
    refetch: refreshThreads,
  } = useThreads({ agentId, isMemoryEnabled: hasMemory, resourceId: agentId });

  const sidebarThreads = useMemo(
    () =>
      (threads ?? []).map((thread) => ({
        ...thread,
        createdAt: new Date(thread.createdAt),
        updatedAt: new Date(thread.updatedAt),
      })),
    [threads],
  );

  useEffect(() => {
    if (isSettingsView || threadId) {
      return;
    }

    // Normalize /agents/:agentId to /agents/:agentId/chat/new
    void navigate(`/agents/${agentId}/chat/new`);
  }, [isSettingsView, threadId, agentId, navigate]);

  const messageId = firstDefined(searchParams.get("messageId"));

  const defaultSettings = useMemo(() => buildAgentDefaultSettings(agent), [agent]);

  // 401 check - session expired, needs re-authentication
  if (error && is401UnauthorizedError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <SessionExpired />
      </div>
    );
  }

  // 403 check - permission denied for agents
  if (error && is403ForbiddenError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <PermissionDenied resource="智能体" />
      </div>
    );
  }

  if (isAgentLoading) {
    return <AgentViewLoadingSkeleton agentId={agentId} view={view} />;
  }

  if (!agent) {
    return <div className="text-center py-4">未找到智能体</div>;
  }

  if (!isSettingsView && !threadId) {
    return null;
  }

  const actualThreadId = resolveConditional(
    isNewThread,
    () => newThreadId,
    () => firstDefined(threadId, newThreadId) as string,
  );

  const handleRefreshThreadList = async () => {
    await refreshThreads();

    if (isNewThread) {
      void navigate(`/agents/${agentId}/chat/${newThreadId}`);
    }
  };

  return (
    <AgentSettingsProvider agentId={agentId} defaultSettings={defaultSettings}>
      <SchemaRequestContextProvider>
        <WorkingMemoryProvider agentId={agentId} threadId={actualThreadId} resourceId={agentId}>
          <BrowserToolCallsProvider key={`browser-${agentId}-${actualThreadId}`}>
            <BrowserSessionProvider
              key={`session-${agentId}-${actualThreadId}`}
              agentId={agentId}
              threadId={actualThreadId}
              enabled={Boolean(agent?.browserTools?.length)}
            >
              <ThreadInputProvider>
                <ObservationalMemoryProvider>
                  <MemoryTimelineProvider key={`memory-timeline-${agentId}-${actualThreadId}`}>
                    <ActivatedSkillsProvider key={`${agentId}-${actualThreadId}`}>
                      <AgentChatShell
                        agentId={agentId}
                        view={view}
                        leftDrawerLabel="打开会话和记忆"
                        leftSlot={resolveConditional(
                          isThreadsLoading,
                          () => (
                            <AgentSidebarLoadingSkeleton />
                          ),
                          () => (
                            <AgentSidebar
                              agentId={agentId}
                              threadId={actualThreadId}
                              threads={sidebarThreads}
                            />
                          ),
                        )}
                        browserOverlay={<BrowserViewPanel />}
                      >
                        <div
                          key={view}
                          className={resolveConditional(
                            supportsViewTransitions,
                            () => "min-h-0 overflow-hidden",
                            () => "agent-view-enter min-h-0 overflow-hidden",
                          )}
                        >
                          {resolveConditional(
                            isSettingsView,
                            () => (
                              <AgentSettingsView agentId={agentId} />
                            ),
                            () => (
                              <AgentChat
                                key={actualThreadId}
                                agentId={agentId}
                                agentName={agent?.name}
                                modelVersion={agent?.modelVersion}
                                supportsMemory={agent?.supportsMemory}
                                threadId={actualThreadId}
                                memory={hasMemory}
                                refreshThreadList={handleRefreshThreadList}
                                modelList={agent?.modelList}
                                messageId={messageId}
                                isNewThread={isNewThread}
                                runOptionsSlot={
                                  <ComposerRunOptions
                                    requestContextSchema={agent?.requestContextSchema}
                                  />
                                }
                              />
                            ),
                          )}
                        </div>
                      </AgentChatShell>
                    </ActivatedSkillsProvider>
                  </MemoryTimelineProvider>
                </ObservationalMemoryProvider>
              </ThreadInputProvider>
            </BrowserSessionProvider>
          </BrowserToolCallsProvider>
        </WorkingMemoryProvider>
      </SchemaRequestContextProvider>
    </AgentSettingsProvider>
  );
}

export default Agent;
