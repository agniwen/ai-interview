import type { DatasetRecord } from "@mastra/client-js";
import { Badge } from "@mastra/playground-ui/components/Badge";
import { Button } from "@mastra/playground-ui/components/Button";
import { Column, Columns } from "@mastra/playground-ui/components/Columns";
import { DataList, DataListSkeleton } from "@mastra/playground-ui/components/DataList";
import { EmptyState } from "@mastra/playground-ui/components/EmptyState";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@mastra/playground-ui/components/InputGroup";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { StatusBadge } from "@mastra/playground-ui/components/StatusBadge";
import { Tabs, TabContent, TabList, Tab } from "@mastra/playground-ui/components/Tabs";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { toast } from "@mastra/playground-ui/utils/toast";
import { Database, GaugeIcon, FlaskConical, Plus, Paperclip, SearchIcon } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useWatch } from "react-hook-form";
import { useAgentEditFormContext } from "../../context/agent-edit-form-context";
import { firstDefined, withDefault } from "../../utils/presence";
import { useReviewQueue } from "../../context/review-queue-context";
import { useAgentExperiments } from "../../hooks/use-agent-experiments";
import type { AgentExperiment } from "../../hooks/use-agent-experiments";
import { useStoredAgentMutations } from "../../hooks/use-stored-agents";
import { mapScorersToApi, mapInstructionBlocksToApi } from "../../utils/agent-form-mappers";
import type { AgentFormValues } from "../agent-edit-page/utils/form-validation";
import { useGenerationTasks } from "@/components/features/mastra-studio/upstream/domains/datasets/context/generation-context";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDatasets } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { resolveConditional } from "../../utils/conditional";
import {
  ExperimentBadge,
  STATUS_VARIANT,
  formatDate,
  getExperimentStartedAtTime,
  getScorerSampling,
  parseIdList,
} from "./agent-playground-evaluate-helpers";
import type {
  AgentEvalTab,
  AgentPlaygroundEvaluateProps,
  DetailView,
} from "./agent-playground-evaluate-helpers";
import { EvaluateDialogs } from "./agent-playground-evaluate-dialogs";
import { EvaluateDetailPanel } from "./agent-playground-evaluate-detail-panel";

export function AgentPlaygroundEvaluate({
  agentId,
  onSwitchToReview,
  pendingScorerItems,
  onPendingScorerItemsConsumed,
}: AgentPlaygroundEvaluateProps) {
  const [activeTab, setActiveTab] = useState<AgentEvalTab>("experiments");
  const [detailView, setDetailView] = useState<DetailView>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAttachDialog, setShowAttachDialog] = useState(false);
  const [attachDatasetSearch, setAttachDatasetSearch] = useState("");
  const [showAttachScorerDialog, setShowAttachScorerDialog] = useState(false);
  const [attachScorerSearch, setAttachScorerSearch] = useState("");
  const [generateDatasetId, setGenerateDatasetId] = useState<string | null>(null);
  const [reviewDatasetId, setReviewDatasetId] = useState<string | null>(null);

  const [experimentsSearch, setExperimentsSearch] = useState("");
  const [datasetsSearch, setDatasetsSearch] = useState("");
  const [scorersSearch, setScorersSearch] = useState("");

  const { form, isCodeAgentOverride } = useAgentEditFormContext();
  const { addItems } = useReviewQueue();

  const agentScorers = withDefault(useWatch({ control: form.control, name: "scorers" }), {});
  const agentInstructions = useWatch({ control: form.control, name: "instructions" });
  const agentDescription = useWatch({ control: form.control, name: "description" });
  const agentTools = useWatch({ control: form.control, name: "tools" });

  const { data: datasetsData, isLoading: isLoadingDatasets } = useDatasets();
  const allDatasets = withDefault(datasetsData?.datasets, []);
  const { data: scorers, isLoading: isLoadingScorers } = useScorers();
  const { data: experiments, isLoading: isLoadingExperiments } = useAgentExperiments(agentId);
  const { tasks: generationTasks } = useGenerationTasks();
  const { updateDataset, updateExperimentResult } = useDatasetMutations();
  const { createStoredAgent, updateStoredAgent } = useStoredAgentMutations(agentId);

  const agentContext = useMemo(
    () => ({
      description: firstDefined(agentDescription, ""),
      instructions: firstDefined(agentInstructions, ""),
      tools: Object.keys(withDefault<Record<string, unknown>>(agentTools, {})),
    }),
    [agentDescription, agentInstructions, agentTools],
  );

  useEffect(() => {
    for (const [dsId, task] of Object.entries(generationTasks)) {
      if (task.status === "review-ready" && task.items?.length) {
        setReviewDatasetId(dsId);
        break;
      }
    }
  }, [generationTasks]);

  useEffect(() => {
    if (pendingScorerItems?.length) {
      setActiveTab("scorers");
      setDetailView({
        prefillTestItems: pendingScorerItems.map((item) => ({
          expectedDirection: "low" as const,
          input: item.input,
          output: item.output,
        })),
        type: "new-scorer",
      });
      onPendingScorerItemsConsumed?.();
    }
  }, [pendingScorerItems, onPendingScorerItemsConsumed]);

  const datasets = allDatasets.filter((ds) => {
    const ids = parseIdList(ds.targetIds);
    return ids.includes(agentId);
  });

  const unattachedDatasets = allDatasets.filter((ds) => {
    const ids = parseIdList(ds.targetIds);
    return !ids.includes(agentId);
  });

  const datasetExperimentMap: Record<string, AgentExperiment> = {};
  for (const experiment of experiments || []) {
    const current = datasetExperimentMap[experiment.datasetId];
    if (
      !current ||
      getExperimentStartedAtTime(experiment.startedAt) >
        getExperimentStartedAtTime(current.startedAt)
    ) {
      datasetExperimentMap[experiment.datasetId] = experiment;
    }
  }

  const datasetMap = useMemo(() => {
    const map = new Map<string, DatasetRecord>();
    for (const dataset of datasets) {
      map.set(dataset.id, dataset);
    }
    return map;
  }, [datasets]);

  const scorerEntries = Object.entries(scorers || {});
  const attachedScorers = scorerEntries.filter(([id]) => !!agentScorers[id]);
  const unattachedScorers = scorerEntries.filter(([id]) => !agentScorers[id]);

  const persistScorers = useCallback(
    async (newScorers: NonNullable<AgentFormValues["scorers"]>) => {
      form.setValue("scorers", newScorers, { shouldDirty: false });
      const scorersPayload = { scorers: mapScorersToApi(newScorers) };
      try {
        await updateStoredAgent.mutateAsync(scorersPayload);
      } catch (error) {
        // Update failed — likely a 404 for a code-defined agent with no stored override.
        // Create the stored override with minimum required fields + scorers.
        if (isCodeAgentOverride) {
          try {
            const values = form.getValues();
            await createStoredAgent.mutateAsync({
              id: agentId,
              instructions: mapInstructionBlocksToApi(values.instructionBlocks),
              model: values.model,
              name: values.name,
              ...scorersPayload,
            });
          } catch (createError) {
            console.error("Failed to persist scorer change:", createError);
            toast.error("Failed to save scorer changes");
          }
        } else {
          console.error("Failed to persist scorer change:", error);
          toast.error("Failed to save scorer changes");
        }
      }
    },
    [form, agentId, isCodeAgentOverride, createStoredAgent, updateStoredAgent],
  );

  const attachScorer = useCallback(
    async (scorerId: string, scorerData: unknown) => {
      const current = form.getValues("scorers") || {};
      const newScorers = {
        ...current,
        [scorerId]: {
          sampling: getScorerSampling(scorerData),
        },
      };
      await persistScorers(newScorers);
    },
    [form, persistScorers],
  );

  const detachScorer = useCallback(
    async (scorerId: string) => {
      const current = form.getValues("scorers") || {};
      const { [scorerId]: _, ...rest } = current;
      await persistScorers(rest);
    },
    [form, persistScorers],
  );

  const handleSendToReview = useCallback(
    async (
      selectedItems: {
        id: string;
        input: unknown;
        output: unknown;
        error: unknown;
        itemId: string;
        datasetId: string;
        scores?: Record<string, number>;
        experimentId?: string;
        traceId?: string;
      }[],
    ) => {
      for (const item of selectedItems) {
        if (item.experimentId && item.datasetId) {
          try {
            await updateExperimentResult.mutateAsync({
              datasetId: item.datasetId,
              experimentId: item.experimentId,
              resultId: item.id,
              status: "needs-review",
            });
          } catch {
            // Continue even if one fails
          }
        }
      }

      addItems(
        selectedItems.map((item) => ({
          datasetId: item.datasetId,
          error: item.error,
          experimentId: item.experimentId,
          id: item.id,
          input: item.input,
          itemId: item.itemId,
          output: item.output,
          scores: item.scores,
          traceId: item.traceId,
        })),
      );
      onSwitchToReview?.();
    },
    [addItems, onSwitchToReview, updateExperimentResult],
  );

  const handleCreateScorerFromFailures = useCallback(
    (items: { input: unknown; output: unknown }[]) => {
      setActiveTab("scorers");
      setDetailView({
        prefillTestItems: items.map((item) => ({
          expectedDirection: "low" as const,
          input: item.input,
          output: item.output,
        })),
        type: "new-scorer",
      });
    },
    [],
  );

  const filteredExperiments = useMemo(() => {
    const exps = [...(experiments || [])].toSorted((a, b) => {
      const da = getExperimentStartedAtTime(a.startedAt);
      const db = getExperimentStartedAtTime(b.startedAt);
      return db - da;
    });
    if (!experimentsSearch) {
      return exps;
    }
    const term = experimentsSearch.toLowerCase();
    return exps.filter((exp) => {
      const dsName = datasetMap.get(exp.datasetId)?.name ?? "";
      return (
        exp.id.toLowerCase().includes(term) ||
        dsName.toLowerCase().includes(term) ||
        (exp.targetId ?? "").toLowerCase().includes(term)
      );
    });
  }, [experiments, experimentsSearch, datasetMap]);

  const filteredDatasets = useMemo(() => {
    if (!datasetsSearch) {
      return datasets;
    }
    const term = datasetsSearch.toLowerCase();
    return datasets.filter(
      (ds) =>
        ds.name.toLowerCase().includes(term) || (ds.description ?? "").toLowerCase().includes(term),
    );
  }, [datasets, datasetsSearch]);

  const filteredScorers = useMemo(() => {
    if (!scorersSearch) {
      return attachedScorers;
    }
    const term = scorersSearch.toLowerCase();
    return attachedScorers.filter(([id, scorer]) => {
      const name = scorer.scorer?.name || id;
      return name.toLowerCase().includes(term);
    });
  }, [attachedScorers, scorersSearch]);

  const handleTabChange = useCallback((tab: AgentEvalTab) => {
    setActiveTab(tab);
    setDetailView(null);
  }, []);

  function renderExperimentsTab() {
    if (isLoadingExperiments) {
      return <DataListSkeleton columns="auto minmax(15rem,1fr) auto auto auto auto auto" />;
    }

    if (!experiments?.length) {
      return (
        <div className="flex h-full items-center justify-center py-20">
          <EmptyState
            iconSlot={<FlaskConical className="size-10 text-neutral3" />}
            titleSlot="No Experiments Yet"
            descriptionSlot="Run experiments against your datasets to see results here."
          />
        </div>
      );
    }

    return (
      <DataList columns="auto minmax(15rem,1fr) auto auto auto auto auto" className="min-w-0">
        <DataList.Top>
          <DataList.TopCell>Experiment</DataList.TopCell>
          <DataList.TopCell>Dataset</DataList.TopCell>
          <DataList.TopCell>Status</DataList.TopCell>
          <DataList.TopCell className="text-center">Items</DataList.TopCell>
          <DataList.TopCell className="text-center">Succeeded</DataList.TopCell>
          <DataList.TopCell className="text-center">Failed</DataList.TopCell>
          <DataList.TopCell>Date</DataList.TopCell>
        </DataList.Top>

        {filteredExperiments.map((exp) => {
          const dsName = datasetMap.get(exp.datasetId)?.name ?? exp.datasetId.slice(0, 8);
          const status = exp.status ?? "pending";
          const succeeded = exp.succeededCount ?? 0;
          const failed = exp.failedCount ?? 0;
          const total = exp.totalItems ?? 0;
          const successPct = total > 0 ? Math.round((succeeded / total) * 100) : 0;
          const isFeatured = detailView?.type === "experiment" && detailView.id === exp.id;

          return (
            <DataList.RowButton
              key={exp.id}
              featured={isFeatured}
              onClick={() =>
                setDetailView({ datasetId: exp.datasetId, id: exp.id, type: "experiment" })
              }
            >
              <DataList.IdCell id={exp.id} />
              <DataList.Cell height="compact" className="min-w-0">
                <span className="block truncate">{dsName}</span>
              </DataList.Cell>
              <DataList.Cell height="compact">
                <StatusBadge variant={STATUS_VARIANT[status] ?? "neutral"} withDot>
                  {status}
                </StatusBadge>
              </DataList.Cell>
              <DataList.Cell height="compact" className="text-center">
                {total}
              </DataList.Cell>
              <DataList.Cell height="compact" className="text-center">
                <span className={succeeded > 0 ? "text-accent1" : ""}>
                  {succeeded} ({successPct}%)
                </span>
              </DataList.Cell>
              <DataList.Cell height="compact" className="text-center">
                <span className={failed > 0 ? "text-accent2" : ""}>{failed}</span>
              </DataList.Cell>
              <DataList.Cell height="compact">{formatDate(exp.startedAt)}</DataList.Cell>
            </DataList.RowButton>
          );
        })}
      </DataList>
    );
  }

  function renderDatasetsTab() {
    if (isLoadingDatasets) {
      return <DataListSkeleton columns="minmax(10rem,1fr) auto auto auto auto" />;
    }

    if (!datasets.length) {
      return (
        <div className="flex h-full items-center justify-center py-20">
          <EmptyState
            iconSlot={<Database className="size-10 text-neutral3" />}
            titleSlot="No Datasets"
            descriptionSlot="Create or attach a dataset to begin testing your agent."
          />
        </div>
      );
    }

    return (
      <DataList columns="minmax(10rem,1fr) auto auto auto auto" className="min-w-0">
        <DataList.Top>
          <DataList.TopCell>Name</DataList.TopCell>
          <DataList.TopCell>Tags</DataList.TopCell>
          <DataList.TopCell>Latest Experiment</DataList.TopCell>
          <DataList.TopCell>Status</DataList.TopCell>
          <DataList.TopCell>Updated</DataList.TopCell>
        </DataList.Top>

        {filteredDatasets.map((ds) => {
          const exp = datasetExperimentMap[ds.id];
          const genTask = generationTasks[ds.id];
          const isGenerating = genTask?.status === "generating";
          const isFeatured = detailView?.type === "dataset" && detailView.id === ds.id;

          return (
            <DataList.RowButton
              key={ds.id}
              featured={isFeatured}
              onClick={() => setDetailView({ id: ds.id, type: "dataset" })}
            >
              <DataList.Cell height="compact" className="min-w-0 text-neutral4">
                <span className="block truncate">{ds.name}</span>
              </DataList.Cell>
              <DataList.Cell height="compact">
                {ds.tags?.length ? (
                  <div className="flex gap-1">
                    {ds.tags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="default">
                        {tag}
                      </Badge>
                    ))}
                    {ds.tags.length > 2 && <Badge variant="default">+{ds.tags.length - 2}</Badge>}
                  </div>
                ) : (
                  <span className="text-neutral2">—</span>
                )}
              </DataList.Cell>
              <DataList.Cell height="compact">
                {exp ? (
                  <ExperimentBadge experiment={exp} />
                ) : (
                  <span className="text-neutral2">No experiments</span>
                )}
              </DataList.Cell>
              <DataList.Cell height="compact">
                {resolveConditional(
                  isGenerating,
                  () => (
                    <div className="flex items-center gap-1">
                      <Spinner className="size-3" />
                      <Txt variant="ui-xs" className="text-warning1">
                        Generating...
                      </Txt>
                    </div>
                  ),
                  () =>
                    genTask?.error ? (
                      <Txt variant="ui-xs" className="text-negative1">
                        Failed
                      </Txt>
                    ) : (
                      <span className="text-neutral2">—</span>
                    ),
                )}
              </DataList.Cell>
              <DataList.Cell height="compact">{formatDate(ds.updatedAt)}</DataList.Cell>
            </DataList.RowButton>
          );
        })}
      </DataList>
    );
  }

  function renderScorersTab() {
    if (isLoadingScorers) {
      return <DataListSkeleton columns="minmax(10rem,1fr) auto auto auto" />;
    }

    if (!attachedScorers.length) {
      return (
        <div className="flex h-full items-center justify-center py-20">
          <EmptyState
            iconSlot={<GaugeIcon className="size-10 text-neutral3" />}
            titleSlot="No Scorers Attached"
            descriptionSlot="Attach or create a scorer to evaluate your agent's performance."
          />
        </div>
      );
    }

    return (
      <DataList columns="minmax(10rem,1fr) auto auto auto" className="min-w-0">
        <DataList.Top>
          <DataList.TopCell>Name</DataList.TopCell>
          <DataList.TopCell>Source</DataList.TopCell>
          <DataList.TopCell>Description</DataList.TopCell>
          <DataList.TopCell>Datasets</DataList.TopCell>
        </DataList.Top>

        {filteredScorers.map(([id, scorer]) => {
          const name = scorer.scorer?.name || id;
          const description = scorer.scorer?.description || "";
          const source = scorer.source ?? "stored";
          const linkedCount = allDatasets.filter((ds) => {
            const scorerIds = ds.scorerIds ?? [];
            return scorerIds.includes(id);
          }).length;
          const isFeatured = detailView?.type === "scorer" && detailView.id === id;

          return (
            <DataList.RowButton
              key={id}
              featured={isFeatured}
              onClick={() => setDetailView({ id, type: "scorer" })}
            >
              <DataList.Cell height="compact" className="min-w-0 text-neutral4">
                <span className="block truncate">{name}</span>
              </DataList.Cell>
              <DataList.Cell height="compact">
                <Badge variant={source === "code" ? "default" : "success"}>{source}</Badge>
              </DataList.Cell>
              <DataList.Cell height="compact" className="min-w-0">
                <span className="block truncate max-w-[200px]">
                  {description || <span className="text-neutral2">—</span>}
                </span>
              </DataList.Cell>
              <DataList.Cell height="compact">
                {linkedCount > 0 ? `${linkedCount} dataset${linkedCount > 1 ? "s" : ""}` : "—"}
              </DataList.Cell>
            </DataList.RowButton>
          );
        })}
      </DataList>
    );
  }

  const hasDetailPanel = !!detailView;
  const detailPanel = (
    <EvaluateDetailPanel
      agentScorers={agentScorers}
      agentId={agentId}
      allDatasets={allDatasets}
      attachScorer={attachScorer}
      datasetMap={datasetMap}
      detailView={detailView}
      detachScorer={detachScorer}
      experiments={experiments}
      handleCreateScorerFromFailures={handleCreateScorerFromFailures}
      handleSendToReview={handleSendToReview}
      scorers={scorers}
      setActiveTab={setActiveTab}
      setDetailView={setDetailView}
      setGenerateDatasetId={setGenerateDatasetId}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <Tabs<AgentEvalTab>
        defaultTab="experiments"
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex flex-col h-full overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border1">
          <TabList className="border-b-0">
            <Tab value="experiments">Experiments</Tab>
            <Tab value="datasets">Datasets</Tab>
            <Tab value="scorers">Scorers</Tab>
          </TabList>

          {/* Tab-specific actions */}
          <div className="flex items-center gap-2">
            {resolveConditional(
              activeTab === "datasets",
              () => (
                <>
                  {unattachedDatasets.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAttachDialog(true)}>
                      <Paperclip className="size-3.5 mr-1" />
                      Attach
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateDialog(true)}>
                    <Plus className="size-3.5 mr-1" />
                    Create
                  </Button>
                </>
              ),
              () => null,
            )}
            {resolveConditional(
              activeTab === "scorers",
              () => (
                <>
                  {unattachedScorers.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAttachScorerDialog(true)}
                    >
                      <Paperclip className="size-3.5 mr-1" />
                      Attach
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailView({ type: "new-scorer" })}
                  >
                    <Plus className="size-3.5 mr-1" />
                    New
                  </Button>
                </>
              ),
              () => null,
            )}
          </div>
        </div>

        {/* Search bar below tabs */}
        <div className="py-2 border-b border-border1">
          {resolveConditional(
            activeTab === "experiments",
            () => (
              <InputGroup variant="outline">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label="Search experiments"
                  placeholder="Search experiments..."
                  onChange={(event) => setExperimentsSearch(event.target.value)}
                />
              </InputGroup>
            ),
            () => null,
          )}
          {resolveConditional(
            activeTab === "datasets",
            () => (
              <InputGroup variant="outline">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label="Search datasets"
                  placeholder="Search datasets..."
                  onChange={(event) => setDatasetsSearch(event.target.value)}
                />
              </InputGroup>
            ),
            () => null,
          )}
          {resolveConditional(
            activeTab === "scorers",
            () => (
              <InputGroup variant="outline">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label="Search scorers"
                  placeholder="Search scorers..."
                  onChange={(event) => setScorersSearch(event.target.value)}
                />
              </InputGroup>
            ),
            () => null,
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <TabContent value="experiments" className="h-full overflow-hidden">
            <Columns
              className={
                resolveConditional(
                  hasDetailPanel,
                  () => detailView?.type === "experiment",
                  () => null,
                )
                  ? "grid-cols-[1fr_1fr]"
                  : ""
              }
            >
              <Column>
                <Column.Content>{renderExperimentsTab()}</Column.Content>
              </Column>
              {resolveConditional(
                detailView?.type === "experiment",
                () => detailPanel,
                () => null,
              )}
            </Columns>
          </TabContent>

          <TabContent value="datasets" className="h-full overflow-hidden">
            <Columns
              className={
                resolveConditional(
                  hasDetailPanel,
                  () => detailView?.type === "dataset",
                  () => null,
                )
                  ? "grid-cols-[1fr_1fr]"
                  : ""
              }
            >
              <Column>
                <Column.Content>{renderDatasetsTab()}</Column.Content>
              </Column>
              {resolveConditional(
                detailView?.type === "dataset",
                () => detailPanel,
                () => null,
              )}
            </Columns>
          </TabContent>

          <TabContent value="scorers" className="h-full overflow-hidden">
            <Columns
              className={
                resolveConditional(
                  (hasDetailPanel && detailView?.type === "scorer") ||
                    detailView?.type === "new-scorer",
                  (conditionValue) => conditionValue,
                  () => detailView?.type === "edit-scorer",
                )
                  ? "grid-cols-[1fr_1fr]"
                  : ""
              }
            >
              <Column>
                <Column.Content>{renderScorersTab()}</Column.Content>
              </Column>
              {resolveConditional(
                detailView?.type === "scorer" || detailView?.type === "new-scorer",
                (conditionValue) => conditionValue,
                () => detailView?.type === "edit-scorer" && detailPanel,
              )}
            </Columns>
          </TabContent>
        </div>
      </Tabs>

      <EvaluateDialogs
        agentContext={{
          description: withDefault(agentContext.description, ""),
          instructions: withDefault(agentContext.instructions, ""),
          tools: agentContext.tools,
        }}
        agentId={agentId}
        attachDatasetSearch={attachDatasetSearch}
        attachScorer={attachScorer}
        attachScorerSearch={attachScorerSearch}
        generateDatasetId={generateDatasetId}
        generationTasks={generationTasks}
        reviewDatasetId={reviewDatasetId}
        setAttachDatasetSearch={setAttachDatasetSearch}
        setAttachScorerSearch={setAttachScorerSearch}
        setGenerateDatasetId={setGenerateDatasetId}
        setReviewDatasetId={setReviewDatasetId}
        setShowAttachDialog={setShowAttachDialog}
        setShowAttachScorerDialog={setShowAttachScorerDialog}
        setShowCreateDialog={setShowCreateDialog}
        showAttachDialog={showAttachDialog}
        showAttachScorerDialog={showAttachScorerDialog}
        showCreateDialog={showCreateDialog}
        unattachedDatasets={unattachedDatasets}
        unattachedScorers={unattachedScorers}
        updateDataset={updateDataset}
      />
    </div>
  );
}
