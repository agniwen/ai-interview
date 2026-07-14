import type { UpdateStoredScorerParams } from "@mastra/client-js";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { MainContentLayout } from "@mastra/playground-ui/components/MainContent";
import { Notice } from "@mastra/playground-ui/components/Notice";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "@/components/features/mastra-studio/router/compat";
import { AgentEditLayout } from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-edit-page/agent-edit-layout";
import {
  useStoredScorer,
  useStoredScorerMutations,
} from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-stored-scorers";
import { ScorerEditMain } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-edit-page/scorer-edit-main";
import { ScorerEditSidebar } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-edit-page/scorer-edit-sidebar";
import { useScorerEditForm } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-edit-page/use-scorer-edit-form";
import type { ScorerFormValues } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-edit-page/utils/form-validation";
import { ScorerVersionCombobox } from "@/components/features/mastra-studio/upstream/domains/scores/components/scorer-version-combobox";
import {
  useScorerVersions,
  useScorerVersion,
} from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorer-versions";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";

type StoredScorerData = NonNullable<ReturnType<typeof useStoredScorer>["data"]>;

function buildUpdateParams(values: ScorerFormValues): UpdateStoredScorerParams {
  return {
    defaultSampling:
      values.defaultSampling?.type === "ratio" && typeof values.defaultSampling.rate === "number"
        ? values.defaultSampling
        : { type: "none" as const },
    description: values.description || undefined,
    instructions: values.instructions || undefined,
    model: values.model,
    name: values.name,
    scoreRange: values.scoreRange,
    type: values.type,
  };
}

interface CmsScorersEditFormProps {
  scorer: StoredScorerData;
  scorerId: string;
  selectedVersionId: string | null;
  latestVersionId?: string;
  activeVersionId?: string;
  onClearVersion: () => void;
}

function CmsScorersEditForm({
  scorer,
  scorerId,
  selectedVersionId,
  latestVersionId,
  activeVersionId,
  onClearVersion,
}: CmsScorersEditFormProps) {
  const client = useMastraClient();
  const queryClient = useQueryClient();
  const { navigate, paths } = useLinkComponent();
  const { updateStoredScorer } = useStoredScorerMutations(scorerId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const { data: versionData } = useScorerVersion({
    scorerId,
    versionId: selectedVersionId ?? "",
  });

  const isViewingVersion = !!selectedVersionId && !!versionData;
  const isViewingPreviousVersion = isViewingVersion && selectedVersionId !== latestVersionId;
  const dataSource = isViewingVersion ? versionData : scorer;

  const initialValues: ScorerFormValues = useMemo(
    () => ({
      defaultSampling: dataSource.defaultSampling,
      description: dataSource.description || "",
      instructions: dataSource.instructions || "",
      model: {
        name: (dataSource.model as { provider?: string; name?: string })?.name || "",
        provider: (dataSource.model as { provider?: string; name?: string })?.provider || "",
      },
      name: dataSource.name || "",
      scoreRange: {
        max: dataSource.scoreRange?.max ?? 1,
        min: dataSource.scoreRange?.min ?? 0,
      },
      type: "llm-judge" as const,
    }),
    [dataSource],
  );

  const { form } = useScorerEditForm({ initialValues });

  useEffect(() => {
    if (initialValues) {
      form.reset(initialValues);
    }
  }, [initialValues, form]);

  const handleSaveDraft = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSavingDraft(true);
    try {
      const params = buildUpdateParams(form.getValues());
      await updateStoredScorer.mutateAsync(params);
      toast.success("Draft saved");
    } catch (error) {
      toast.error(
        `Failed to save draft: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSavingDraft(false);
    }
  }, [form, updateStoredScorer]);

  const handlePublish = useCallback(async () => {
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const params = buildUpdateParams(form.getValues());
      await updateStoredScorer.mutateAsync(params);

      // Fetch latest version after save and activate it
      const versionsResponse = await client
        .getStoredScorer(scorerId)
        .listVersions({ orderBy: { direction: "DESC" }, perPage: 1 });
      const [latestVersion] = versionsResponse.versions;
      if (latestVersion) {
        await client.getStoredScorer(scorerId).activateVersion(latestVersion.id);
      }

      void queryClient.invalidateQueries({ queryKey: ["scorers"] });
      void queryClient.invalidateQueries({ queryKey: ["stored-scorers"] });
      toast.success("Scorer published");
      void navigate(paths.scorerLink(scorerId));
    } catch (error) {
      toast.error(
        `Failed to publish scorer: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [form, updateStoredScorer, client, scorerId, navigate, paths, queryClient]);

  const handlePublishVersion = useCallback(async () => {
    if (isViewingPreviousVersion && selectedVersionId) {
      setIsSubmitting(true);
      try {
        await client.getStoredScorer(scorerId).activateVersion(selectedVersionId);
        void queryClient.invalidateQueries({ queryKey: ["scorers"] });
        void queryClient.invalidateQueries({ queryKey: ["stored-scorers"] });
        void queryClient.invalidateQueries({ queryKey: ["scorer-versions", scorerId] });
        toast.success("Version published");
        void navigate(paths.scorerLink(scorerId));
      } catch (error) {
        toast.error(
          `Failed to publish version: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      } finally {
        setIsSubmitting(false);
      }
    } else {
      await handlePublish();
    }
  }, [
    handlePublish,
    isViewingPreviousVersion,
    selectedVersionId,
    client,
    scorerId,
    queryClient,
    navigate,
    paths,
  ]);

  return (
    <AgentEditLayout
      leftSlot={
        <ScorerEditSidebar
          form={form}
          onPublish={handlePublish}
          onSaveDraft={handleSaveDraft}
          isSubmitting={isSubmitting}
          isSavingDraft={isSavingDraft}
          formRef={formRef}
          mode="edit"
        />
      }
    >
      {isViewingPreviousVersion && (
        <Notice variant="info" title="This is a previous version" className="m-4 mb-0">
          <Notice.Message>You are seeing a specific version of the scorer.</Notice.Message>
          <div className="flex gap-2">
            <Button type="button" variant="default" size="sm" onClick={onClearVersion}>
              View latest version
            </Button>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handlePublishVersion}
              disabled={selectedVersionId === activeVersionId || isSubmitting}
            >
              {isSubmitting ? "Publishing..." : "Publish This Version"}
            </Button>
          </div>
        </Notice>
      )}
      <form ref={formRef} className="h-full">
        <ScorerEditMain form={form} />
      </form>
    </AgentEditLayout>
  );
}

function CmsScorersEditPage() {
  const { scorerId } = useParams<{ scorerId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedVersionId = searchParams.get("versionId");

  const { data: scorer, isLoading } = useStoredScorer(scorerId, { status: "draft" });
  const { data: versionsData } = useScorerVersions({
    params: { orderBy: { direction: "DESC" } },
    scorerId: scorerId ?? "",
  });

  const activeVersionId = scorer?.activeVersionId;
  const latestVersion = versionsData?.versions?.[0];
  const hasDraft = !!(latestVersion && activeVersionId && latestVersion.id !== activeVersionId);

  const handleVersionSelect = useCallback(
    (versionId: string) => {
      if (versionId) {
        setSearchParams({ versionId });
      } else {
        setSearchParams({});
      }
    },
    [setSearchParams],
  );

  const handleClearVersion = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  if (isLoading) {
    return (
      <MainContentLayout className="grid-rows-[1fr]">
        <AgentEditLayout
          leftSlot={
            <div className="flex items-center justify-center h-full">
              <Spinner className="size-8" />
            </div>
          }
        >
          <div className="flex items-center justify-center h-full">
            <Spinner className="size-8" />
          </div>
        </AgentEditLayout>
      </MainContentLayout>
    );
  }

  if (!scorer || !scorerId) {
    return (
      <MainContentLayout className="grid-rows-[1fr]">
        <AgentEditLayout
          leftSlot={
            <div className="flex items-center justify-center h-full text-neutral3">
              Scorer not found
            </div>
          }
        >
          <div className="flex items-center justify-center h-full text-neutral3">
            Scorer not found
          </div>
        </AgentEditLayout>
      </MainContentLayout>
    );
  }

  return (
    <MainContentLayout className="grid-rows-[1fr]">
      <RouteHeaderActions owner="cms-scorer-edit">
        <div className="flex items-center gap-2">
          {hasDraft && <Badge variant="info">Unpublished changes</Badge>}
          <ScorerVersionCombobox
            scorerId={scorerId}
            value={selectedVersionId ?? ""}
            onValueChange={handleVersionSelect}
            variant="ghost"
            activeVersionId={activeVersionId}
          />
        </div>
      </RouteHeaderActions>
      <CmsScorersEditForm
        scorer={scorer}
        scorerId={scorerId}
        selectedVersionId={selectedVersionId}
        latestVersionId={latestVersion?.id}
        activeVersionId={activeVersionId}
        onClearVersion={handleClearVersion}
      />
    </MainContentLayout>
  );
}

export { CmsScorersEditPage };

export default CmsScorersEditPage;
