import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { memo, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { Navigate, useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentBuilderMobileMenu } from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/agent-edit/agent-builder-mobile-menu";
import { AgentChatPanelChat } from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/agent-edit/agent-chat-panel";
import { ViewTopBar } from "@/components/features/mastra-studio/upstream/domains/agent-builder/components/agent-view/view-top-bar";
import { AgentColorProvider } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/agent-color-context";
import { useStreamRunning } from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/stream-chat-context";
import {
  ViewPageProvider,
  useViewPage,
} from "@/components/features/mastra-studio/upstream/domains/agent-builder/contexts/view-page-context";
import { useBuilderAgentAccess } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-agent-access";
import { useChannelConnectToast } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-channel-connect-toast";
import { AgentBuilderViewLayout } from "@/components/features/mastra-studio/upstream/domains/agent-builder/layouts/agent-builder-view-layout";
import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";
import { storedAgentToFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/services/stored-agent-to-form-values";
import { BrowserViewPanel } from "@/components/features/mastra-studio/upstream/domains/agents/components/browser-view";
import { BrowserSessionProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-session-provider";
import { BrowserToolCallsProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/browser-tool-calls-context";
import type { StoredAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { useStoredAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { useCurrentUser } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-current-user";

export default function AgentBuilderAgentView() {
  const { id: agentId } = useParams<{ id: string }>();
  const { data: storedAgent, isLoading: isStoredAgentLoading } = useStoredAgent(agentId, {
    status: "draft",
  });
  const { data: currentUser, isLoading: isCurrentUserLoading } = useCurrentUser();
  const { canWrite } = useBuilderAgentAccess();
  useChannelConnectToast();

  if (!agentId) {
    return null;
  } // dead branch, agentId is forced to exist in this specific oute

  if (isStoredAgentLoading || isCurrentUserLoading) {
    return <AgentBuilderAgentViewSkeleton />;
  }
  if (!storedAgent) {
    return <Navigate to="/agent-builder/agents" replace />;
  }

  return (
    <ViewPageProvider
      agentId={agentId}
      storedAgent={storedAgent}
      currentUserId={currentUser?.id}
      canWrite={canWrite}
    >
      <ViewPageForm storedAgent={storedAgent} />
    </ViewPageProvider>
  );
}

interface ViewPageFormProps {
  storedAgent: StoredAgent;
}

const ViewPageForm = ({ storedAgent }: ViewPageFormProps) => {
  const { hasBrowser, agentId, threadId } = useViewPage();
  const [defaultValues] = useState(() => storedAgentToFormValues(storedAgent));
  const formMethods = useForm<AgentBuilderEditFormValues>({ defaultValues });

  const body = <ViewPageBody hasBrowser={hasBrowser} />;

  if (hasBrowser) {
    return (
      <FormProvider {...formMethods}>
        <AgentColorProvider agentId={agentId}>
          <BrowserToolCallsProvider>
            <BrowserSessionProvider agentId={agentId} threadId={threadId}>
              {body}
            </BrowserSessionProvider>
          </BrowserToolCallsProvider>
        </AgentColorProvider>
      </FormProvider>
    );
  }

  return (
    <FormProvider {...formMethods}>
      <AgentColorProvider agentId={agentId}>{body}</AgentColorProvider>
    </FormProvider>
  );
};

const ViewPageBody = memo(function ViewPageBody({ hasBrowser }: { hasBrowser: boolean }) {
  const topBar = useMemo(() => <ViewTopBarSlot />, []);
  const chat = useMemo(() => <AgentChatPanelChat hasBrowser={hasBrowser} />, [hasBrowser]);
  const browserOverlay = useMemo(
    () => (hasBrowser ? <BrowserViewPanel /> : undefined),
    [hasBrowser],
  );

  return <AgentBuilderViewLayout topBar={topBar} chat={chat} browserOverlay={browserOverlay} />;
});

const ViewTopBarSlot = () => {
  const { canModify, onModeToggle, isOwner, agentId, agent } = useViewPage();
  const isRunning = useStreamRunning();

  return (
    <ViewTopBar
      mode={canModify ? "test" : undefined}
      onModeToggle={onModeToggle}
      modeToggleDisabled={isRunning}
      mobileMenu={
        isOwner && (
          <AgentBuilderMobileMenu
            agentId={agentId}
            showEditAgent
            showDelete
            agentName={agent.name}
            disabled={isRunning}
          />
        )
      }
    />
  );
};

const AgentBuilderAgentViewSkeleton = () => (
  <div className="h-screen w-screen flex items-center justify-center">
    <Spinner />
  </div>
);
