import { v4 as uuid } from "@lukeed/uuid";
import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { useEffect, useMemo } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import { SessionHeader } from "@/components/features/mastra-studio/upstream/components/session-header";
import { AgentChat } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-chat";
import { AgentChatLoadingSkeleton } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-loading-skeletons";
import { ActivatedSkillsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/activated-skills-context";
import { AgentSettingsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-context";
import { ObservationalMemoryProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-observational-memory-context";
import { WorkingMemoryProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-working-memory-context";
import { BrowserSessionProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-session-provider";
import { BrowserToolCallsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-tool-calls-context";
import { useAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent";
import { buildAgentDefaultSettings } from "@/components/features/mastra-studio/upstream/domains/agents/utils/agent-default-settings";
import { ThreadInputProvider } from "@/components/features/mastra-studio/upstream/domains/conversation/context/thread-input-provider";
import {
  useMemory,
  useThreads,
} from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { TracingSettingsProvider } from "@/components/features/mastra-studio/upstream/domains/observability/context/tracing-settings-context";
import { SchemaRequestContextProvider } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";

const AgentSessionLoadingSkeleton = () => (
  <MainContentLayout>
    <SessionHeader />
    <div
      className="grid overflow-y-auto relative h-full pt-6"
      data-testid="agent-session-skeleton"
      aria-busy="true"
    >
      <AgentChatLoadingSkeleton />
    </div>
  </MainContentLayout>
);

function AgentSession() {
  const { agentId, threadId } = useParams();
  const [searchParams] = useSearchParams();
  const { data: agent, isLoading: isAgentLoading } = useAgent(agentId);
  const { data: memory } = useMemory(agentId);
  const navigate = useNavigate();
  const isNewThread = threadId === "new";

  // eslint-disable-next-line react-hooks/exhaustive-deps -- threadId is intentional: we need a new UUID per thread
  const newThreadId = useMemo(() => uuid(), [threadId]);

  const hasMemory = Boolean(memory?.result);

  const { refetch: refreshThreads } = useThreads({
    agentId,
    isMemoryEnabled: hasMemory,
    resourceId: agentId,
  });

  useEffect(() => {
    if (!hasMemory) {
      return;
    }
    if (threadId) {
      return;
    }

    void navigate(`/agents/${agentId}/session/new`);
  }, [hasMemory, threadId, agentId, navigate]);

  const messageId = searchParams.get("messageId") ?? undefined;

  const defaultSettings = useMemo(() => buildAgentDefaultSettings(agent), [agent]);

  if (isAgentLoading) {
    return <AgentSessionLoadingSkeleton />;
  }

  if (!agent) {
    return <div className="text-center py-4">Agent not found</div>;
  }

  const actualThreadId = isNewThread ? newThreadId : (threadId ?? newThreadId);

  const handleRefreshThreadList = async () => {
    await refreshThreads();

    if (isNewThread) {
      void navigate(`/agents/${agentId}/session/${newThreadId}`);
    }
  };

  return (
    <TracingSettingsProvider entityId={agentId} entityType="agent">
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
                    <ActivatedSkillsProvider>
                      <MainContentLayout>
                        <SessionHeader />
                        <div className="grid overflow-y-auto relative h-full pt-6">
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
                            hideModelSwitcher
                          />
                        </div>
                      </MainContentLayout>
                    </ActivatedSkillsProvider>
                  </ObservationalMemoryProvider>
                </ThreadInputProvider>
              </BrowserSessionProvider>
            </BrowserToolCallsProvider>
          </WorkingMemoryProvider>
        </SchemaRequestContextProvider>
      </AgentSettingsProvider>
    </TracingSettingsProvider>
  );
}

export default AgentSession;
