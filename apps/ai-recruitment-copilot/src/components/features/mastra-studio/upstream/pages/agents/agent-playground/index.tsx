import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useCallback, useMemo, useState } from "react";
import { useParams } from "@/components/features/mastra-studio/router/compat";
import { AgentPlaygroundView } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-playground/agent-playground-view";
import { AgentEditFormProvider } from "@/components/features/mastra-studio/upstream/domains/agents/context/agent-edit-form-context";
import { useAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent";
import { useAgentCmsForm } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-cms-form";
import {
  useAgentVersions,
  useAgentVersion,
} from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-versions";
import { useStoredAgent } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-stored-agents";
import { mapAgentResponseToDataSource } from "@/components/features/mastra-studio/upstream/domains/agents/utils/compute-agent-initial-values";
import type { AgentDataSource } from "@/components/features/mastra-studio/upstream/domains/agents/utils/compute-agent-initial-values";
import { useEditorSource } from "@/components/features/mastra-studio/upstream/domains/configuration/hooks/use-editor-source";
import { useMemory } from "@/components/features/mastra-studio/upstream/domains/memory/hooks/use-memory";
import { useMastraPlatform } from "@/components/features/mastra-studio/upstream/lib/mastra-platform/hooks/use-mastra-platform";
import { resolveConditional } from "../../../domains/agents/utils/conditional";
import { firstDefined } from "../../../domains/agents/utils/presence";
import { allTruthy, anyTruthy } from "../../../domains/agents/utils/truthiness";

function getVersionCount(versions: unknown[] | undefined): number {
  if (!versions) {
    return 0;
  }
  return versions.length;
}

function getOpenPrTitle(canOpenPr: boolean): string | undefined {
  if (canOpenPr) {
    return "为这些 JSON 更改创建拉取请求";
  }
  return undefined;
}

function getCodeAgentFlags(
  codeAgent: { source?: string; editor?: unknown } | null | undefined,
  editorSource: string | undefined,
) {
  const isCodeAgentOverride = codeAgent?.source === "code";
  const isCodeSourceAgent = allTruthy(isCodeAgentOverride, editorSource === "code");
  const isCodeAgentEditable = anyTruthy(!isCodeAgentOverride, codeAgent?.editor !== false);
  return {
    isCodeAgentEditable,
    isCodeAgentOverride,
    isCodeSourceAgent,
    showCodeModeActions: allTruthy(isCodeSourceAgent, isCodeAgentEditable),
  };
}

function getVersionFlags({
  latestVersionId,
  activeVersionId,
  selectedVersionId,
  hasVersionData,
}: {
  latestVersionId: string | undefined;
  activeVersionId: string | undefined;
  selectedVersionId: string | null;
  hasVersionData: boolean;
}) {
  const isViewingVersion = allTruthy(selectedVersionId, hasVersionData);
  return {
    hasDraft: allTruthy(latestVersionId, latestVersionId !== activeVersionId),
    isViewingPreviousVersion: allTruthy(isViewingVersion, selectedVersionId !== latestVersionId),
    isViewingVersion,
  };
}

function getOptionalString(value: string | null | undefined): string | undefined {
  if (value === null) {
    return undefined;
  }
  return value;
}

function getViewedVersionId(
  isViewingPreviousVersion: boolean,
  selectedVersionId: string | null,
): string | undefined {
  if (!isViewingPreviousVersion) {
    return undefined;
  }
  return getOptionalString(selectedVersionId);
}

function AgentPlayground() {
  const { agentId } = useParams();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const { data: codeAgent, isLoading: isLoadingCodeAgent, error } = useAgent(agentId);
  const { data: memory } = useMemory(agentId);
  const editorSource = useEditorSource();
  const { isMastraPlatform, mastraPlatformApiEndpoint, mastraPlatformProjectId } =
    useMastraPlatform();

  // Fetch versions first — this endpoint returns an empty array for code-only agents
  const { data: versionsData } = useAgentVersions({
    agentId,
    params: { orderBy: { direction: "DESC" } },
  });

  // Only fetch stored agent details when versions exist (avoids 404 for code-only agents)
  const versions = versionsData?.versions;
  const hasVersions = getVersionCount(versions) > 0;
  const { data: storedAgent, isLoading: isLoadingStoredAgent } = useStoredAgent(agentId, {
    enabled: hasVersions,
    status: "draft",
  });

  const { isCodeAgentEditable, isCodeAgentOverride, isCodeSourceAgent, showCodeModeActions } =
    getCodeAgentFlags(codeAgent, editorSource);
  const canOpenPr = allTruthy(
    showCodeModeActions,
    isMastraPlatform,
    mastraPlatformApiEndpoint,
    mastraPlatformProjectId,
  );
  const openPrTitle = getOpenPrTitle(canOpenPr);
  const isLoading = anyTruthy(isLoadingCodeAgent, allTruthy(hasVersions, isLoadingStoredAgent));
  const hasMemory = Boolean(memory?.result);

  // Fetch version data when a specific version is selected
  const { data: versionData } = useAgentVersion({
    agentId: firstDefined(agentId, "") as string,
    versionId: firstDefined(selectedVersionId, "") as string,
  });

  const activeVersionId = storedAgent?.activeVersionId;
  const latestVersion = versions?.[0];
  const { hasDraft, isViewingPreviousVersion, isViewingVersion } = getVersionFlags({
    activeVersionId,
    hasVersionData: Boolean(versionData),
    latestVersionId: latestVersion?.id,
    selectedVersionId,
  });

  // Switch data source based on selected version
  const dataSource = useMemo<AgentDataSource>(() => {
    if (isViewingVersion && versionData) {
      return versionData;
    }
    if (storedAgent) {
      return storedAgent;
    }
    if (codeAgent) {
      return mapAgentResponseToDataSource(codeAgent);
    }
    return {} as AgentDataSource;
  }, [isViewingVersion, versionData, storedAgent, codeAgent]);

  const {
    form,
    handlePublish,
    handleSaveDraft,
    handleDownloadJson,
    handleOpenPr,
    isSubmitting,
    isSavingDraft,
    isDirty,
  } = useAgentCmsForm({
    agentId: firstDefined(agentId, "") as string,
    dataSource,
    editorConfig: codeAgent?.editor,
    hasStoredOverride: isCodeAgentOverride && !!storedAgent,
    isCodeAgentOverride,
    mode: "edit",
    onSuccess: () => {
      /* empty */
    },
    saveSuccessMessage: isCodeSourceAgent ? "已保存到文件系统" : undefined,
  });

  const handlePublishVersion = useCallback(async () => {
    await resolveConditional(
      allTruthy(isViewingPreviousVersion, selectedVersionId),
      () => handlePublish(selectedVersionId as string),
      () => handlePublish(),
    );
  }, [handlePublish, isViewingPreviousVersion, selectedVersionId]);

  const handleOpenPrClick = useCallback(async () => {
    if (!mastraPlatformApiEndpoint || !mastraPlatformProjectId) {
      return;
    }
    await handleOpenPr({
      platformApiEndpoint: mastraPlatformApiEndpoint,
      projectId: mastraPlatformProjectId,
    });
  }, [handleOpenPr, mastraPlatformApiEndpoint, mastraPlatformProjectId]);

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      // If selecting the latest version, clear the selection (back to editable draft)
      if (versionId === latestVersion?.id) {
        setSelectedVersionId(null);
      } else {
        setSelectedVersionId(versionId);
      }
    },
    [latestVersion?.id],
  );

  if (error && is401UnauthorizedError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <SessionExpired />
      </div>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <div className="flex h-full items-center justify-center">
        <PermissionDenied resource="智能体" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!codeAgent) {
    return <div className="text-center py-4">未找到智能体</div>;
  }

  return (
    <AgentEditFormProvider
      form={form}
      mode="edit"
      agentId={agentId}
      isSubmitting={isSubmitting}
      isSavingDraft={isSavingDraft}
      handlePublish={handlePublish}
      handleSaveDraft={handleSaveDraft}
      isCodeAgentOverride={isCodeAgentOverride}
      isCodeSourceAgent={isCodeSourceAgent}
      readOnly={resolveConditional(
        isViewingPreviousVersion,
        () => isViewingPreviousVersion,
        () => !isCodeAgentEditable,
      )}
      editorConfig={codeAgent?.editor}
    >
      <AgentPlaygroundView
        agentId={agentId}
        agentName={codeAgent?.name}
        modelVersion={codeAgent?.modelVersion}
        agentVersionId={getViewedVersionId(isViewingPreviousVersion, selectedVersionId)}
        hasMemory={hasMemory}
        activeVersionId={activeVersionId}
        selectedVersionId={getOptionalString(selectedVersionId)}
        latestVersionId={latestVersion?.id}
        onVersionSelect={handleVersionSelect}
        isDirty={isDirty}
        isSavingDraft={isSavingDraft}
        isPublishing={isSubmitting}
        hasDraft={hasDraft}
        readOnly={resolveConditional(
          isViewingPreviousVersion,
          () => isViewingPreviousVersion,
          () => !isCodeAgentEditable,
        )}
        isCodeSourceAgent={isCodeSourceAgent}
        showCodeModeActions={showCodeModeActions}
        canOpenPr={canOpenPr}
        openPrTitle={openPrTitle}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublishVersion}
        onDownloadJson={handleDownloadJson}
        onOpenPr={handleOpenPrClick}
        isViewingPreviousVersion={isViewingPreviousVersion}
      />
    </AgentEditFormProvider>
  );
}

export default AgentPlayground;
