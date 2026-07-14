import { Button } from "@mastra/playground-ui/components/Button";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { Combobox } from "@mastra/playground-ui/components/Combobox";
import { CopyButton } from "@mastra/playground-ui/components/CopyButton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
} from "@mastra/playground-ui/components/Dialog";
import { ScrollArea } from "@mastra/playground-ui/components/ScrollArea";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useQueryClient } from "@tanstack/react-query";
import { Play, Sparkles, Clock, ChevronRight, ChevronDown, X } from "lucide-react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { formatVersionLabel } from "./format-version-label";
import { ExpandedItemEditor } from "./dataset-item-editor";
import { isDefined } from "../../utils/presence";
import { useAgentVersions } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agent-versions";
import { useDatasetExperiments } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-experiments";
import { useDatasetItems } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-items";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDatasetVersions } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-versions";
import { useMergedRequestContext } from "@/components/features/mastra-studio/upstream/domains/request-context/context/schema-request-context";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { resolveConditional } from "../../utils/conditional";

interface DatasetDetailViewProps {
  agentId: string;
  datasetId: string;
  datasetName: string;
  datasetDescription?: string;
  datasetTags?: string[];
  datasetTargetType?: string | null;
  datasetTargetIds?: string[] | null;
  activeScorers?: string[];
  datasetScorerIds?: string[] | null;
  onGenerate: () => void;
  onViewExperiment: (experimentId: string) => void;
}

function formatTimestamp(date: string | Date) {
  const d = new Date(date);
  return `${d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  })}, ${d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

function truncateValue(value: unknown, maxLength = 120): string {
  if (value === undefined || value === null) {
    return "-";
  }
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (!str || str.length <= maxLength) {
    return str || "-";
  }
  return `${str.slice(0, maxLength)}…`;
}

function getExpectedTrajectoryLabel(expectedTrajectory: unknown): string {
  const traj = expectedTrajectory as Record<string, unknown> | undefined;
  const steps = Array.isArray(traj?.steps) ? traj.steps.length : 0;
  return steps > 0 ? `${steps} expected steps` : "trajectory";
}

// Deterministic tag color from string
const TAG_COLORS = ["blue", "green", "purple", "orange", "cyan", "pink", "red", "yellow"] as const;
function getTagColor(tag: string): (typeof TAG_COLORS)[number] {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) {
    hash = (hash * 31 + (tag.codePointAt(i) ?? 0)) % 2_147_483_647;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length] ?? TAG_COLORS[0];
}

function ExperimentStatusDot({ status }: { status: string }) {
  const color = resolveConditional(
    status === "completed",
    () => "bg-positive1",
    () =>
      resolveConditional(
        status === "running",
        () => "bg-warning1",
        () => (status === "failed" ? "bg-negative1" : "bg-neutral3"),
      ),
  );
  return <div className={cn("w-2 h-2 rounded-full shrink-0", color)} />;
}

export function DatasetDetailView({
  agentId,
  datasetId,
  datasetName,
  datasetDescription,
  datasetTags = [],
  datasetTargetType,
  datasetTargetIds,
  activeScorers = [],
  datasetScorerIds = [],
  onGenerate,
  onViewExperiment,
}: DatasetDetailViewProps) {
  const [isRunning, setIsRunning] = useState(false);
  const isStartingRef = useRef(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [itemsCollapsed, setItemsCollapsed] = useState(false);
  const [runsCollapsed, setRunsCollapsed] = useState(false);
  const [scorersCollapsed, setScorersCollapsed] = useState(false);
  const [showAttachScorerDialog, setShowAttachScorerDialog] = useState(false);
  const [attachScorerSearch, setAttachScorerSearch] = useState("");
  const [selectedDatasetVersion, setSelectedDatasetVersion] = useState<string>("");
  const [selectedAgentVersion, setSelectedAgentVersion] = useState<string>("");

  // Scorers for dataset attachment
  const { data: allScorers } = useScorers();
  const { updateDataset } = useDatasetMutations();

  const attachedScorerIds = useMemo(() => new Set(datasetScorerIds), [datasetScorerIds]);

  const attachedScorerEntries = useMemo(() => {
    if (!allScorers) {
      return [];
    }
    return Object.entries(allScorers).filter(([id]) => attachedScorerIds.has(id));
  }, [allScorers, attachedScorerIds]);

  const unattachedScorerEntries = useMemo(() => {
    if (!allScorers) {
      return [];
    }
    return Object.entries(allScorers).filter(([id]) => !attachedScorerIds.has(id));
  }, [allScorers, attachedScorerIds]);

  const handleAttachScorer = useCallback(
    async (scorerId: string) => {
      const newScorerIds = [...(datasetScorerIds ?? []), scorerId];
      try {
        await updateDataset.mutateAsync({ datasetId, scorerIds: newScorerIds });
      } catch (error) {
        toast.error("Failed to attach scorer");
        throw error;
      }
    },
    [datasetId, datasetScorerIds, updateDataset],
  );

  const handleDetachScorer = useCallback(
    async (scorerId: string) => {
      const newScorerIds = (datasetScorerIds ?? []).filter((id) => id !== scorerId);
      try {
        await updateDataset.mutateAsync({ datasetId, scorerIds: newScorerIds });
      } catch {
        toast.error("Failed to detach scorer");
      }
    },
    [datasetId, datasetScorerIds, updateDataset],
  );

  const { data: items = [], setEndOfListElement, isFetchingNextPage } = useDatasetItems(datasetId);
  const { data: experimentsData, refetch: refetchExperiments } = useDatasetExperiments(datasetId);
  const datasetExperiments = experimentsData?.experiments ?? [];

  const datasetVersionsQuery = useDatasetVersions(datasetId);
  const datasetVersions = datasetVersionsQuery.data ?? [];

  const isAgentTarget = !datasetTargetType || datasetTargetType === "agent";
  const agentVersionsQuery = useAgentVersions({ agentId, enabled: isAgentTarget });
  const agentVersions = agentVersionsQuery.data?.versions ?? [];

  useEffect(() => {
    setSelectedDatasetVersion("");
  }, [datasetId]);

  useEffect(() => {
    setSelectedAgentVersion("");
  }, [agentId]);

  const mergedRequestContext = useMergedRequestContext();
  const queryClient = useQueryClient();
  const { triggerExperiment } = useDatasetMutations();

  const handleRunExperiment = useCallback(async () => {
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;
    setIsRunning(true);
    try {
      const hasRequestContext = Object.keys(mergedRequestContext).length > 0;
      // Use the dataset's own target if it's not an agent dataset
      const expTargetType =
        datasetTargetType === "scorer" || datasetTargetType === "workflow"
          ? datasetTargetType
          : "agent";
      // targetIds may come as a JSON string from some storage backends
      const parsedTargetIds = resolveConditional(
        Array.isArray(datasetTargetIds),
        () => datasetTargetIds,
        () =>
          typeof datasetTargetIds === "string"
            ? (() => {
                try {
                  return JSON.parse(datasetTargetIds);
                } catch {
                  return [];
                }
              })()
            : [],
      );
      const expTargetId =
        expTargetType !== "agent" && parsedTargetIds[0] ? parsedTargetIds[0] : agentId;
      await triggerExperiment.mutateAsync({
        datasetId,
        targetId: expTargetId,
        targetType: expTargetType,
        ...(activeScorers.length > 0 ? { scorerIds: activeScorers } : {}),
        ...(hasRequestContext ? { requestContext: mergedRequestContext } : {}),
        ...(selectedDatasetVersion ? { version: Number(selectedDatasetVersion) } : {}),
        ...(selectedAgentVersion ? { agentVersion: selectedAgentVersion } : {}),
      });
      void queryClient.invalidateQueries({ queryKey: ["agent-experiments", agentId] });
      void refetchExperiments();
      // Poll a few times to pick up status changes
      const poll = setInterval(() => refetchExperiments(), 3000);
      setTimeout(() => clearInterval(poll), 30_000);
      toast.success("Experiment started");
    } catch (error) {
      toast.error(
        `Failed to start experiment: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      isStartingRef.current = false;
      setIsRunning(false);
    }
  }, [
    datasetId,
    activeScorers,
    agentId,
    datasetTargetType,
    datasetTargetIds,
    triggerExperiment,
    mergedRequestContext,
    queryClient,
    refetchExperiments,
    selectedDatasetVersion,
    selectedAgentVersion,
  ]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <Txt variant="ui-sm" className="text-neutral5 font-medium block truncate">
              {datasetName}
            </Txt>
            {resolveConditional(
              datasetDescription,
              (conditionValue) => (
                <Txt variant="ui-xs" className="text-neutral3 block mt-0.5 truncate">
                  {conditionValue}
                </Txt>
              ),
              () => null,
            )}
            {resolveConditional(
              datasetTags.length > 0,
              () => (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {datasetTags.map((tag) => (
                    <Chip key={tag} color={getTagColor(tag)} size="small">
                      {tag}
                    </Chip>
                  ))}
                </div>
              ),
              () => null,
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onGenerate}>
              <Icon size="sm">
                <Sparkles />
              </Icon>
              Generate
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunExperiment}
              disabled={resolveConditional(
                items.length === 0,
                (conditionValue) => conditionValue,
                () => isRunning,
              )}
            >
              {isRunning ? (
                <>
                  <Spinner className="h-3 w-3" /> Running...
                </>
              ) : (
                <>
                  <Icon size="sm">
                    <Play />
                  </Icon>{" "}
                  Run Experiment
                </>
              )}
            </Button>
          </div>
        </div>
        {/* Version selectors */}
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <Txt variant="ui-xs" className="text-neutral3 mb-1 block">
              Dataset version
            </Txt>
            <Combobox
              options={[
                { label: "Latest", value: "" },
                ...datasetVersions.map((v) => ({
                  description: v.isCurrent ? "Current" : undefined,
                  label: `v${v.version}`,
                  value: String(v.version),
                })),
              ]}
              value={selectedDatasetVersion}
              onValueChange={setSelectedDatasetVersion}
              placeholder="Latest"
              size="sm"
            />
          </div>
          {resolveConditional(
            isAgentTarget,
            () => (
              <div className="flex-1 min-w-0">
                <Txt variant="ui-xs" className="text-neutral3 mb-1 block">
                  Agent version
                </Txt>
                <div className="flex items-center gap-1">
                  <Combobox
                    options={[
                      { label: "Current", value: "" },
                      ...agentVersions.map((v) => ({
                        description: v.changeMessage ?? undefined,
                        label: `v${v.versionNumber}`,
                        value: v.id,
                      })),
                    ]}
                    value={selectedAgentVersion}
                    onValueChange={setSelectedAgentVersion}
                    placeholder="Current"
                    size="sm"
                  />
                  {(selectedAgentVersion || agentVersions[0]?.id) && (
                    <CopyButton
                      content={selectedAgentVersion || agentVersions[0]?.id}
                      tooltip="Copy version ID"
                      size="sm"
                    />
                  )}
                </div>
              </div>
            ),
            () => null,
          )}
        </div>
      </div>

      {/* Scorers + Items + Past runs */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ScrollArea className="flex-1 min-h-0">
          {/* Scorers section (collapsible) */}
          <div className="border-b border-border1">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setScorersCollapsed((prev) => !prev)}
                className="flex-1 px-4 py-2 flex items-center gap-1 hover:bg-surface3 transition-colors"
              >
                <Icon size="sm" className="text-neutral3">
                  {scorersCollapsed ? <ChevronRight /> : <ChevronDown />}
                </Icon>
                <Txt
                  variant="ui-xs"
                  className="text-neutral3 font-semibold uppercase tracking-wider"
                >
                  Scorers ({attachedScorerEntries.length})
                </Txt>
              </button>
              {resolveConditional(
                unattachedScorerEntries.length > 0,
                () => (
                  <div className="pr-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAttachScorerDialog(true)}
                    >
                      Attach
                    </Button>
                  </div>
                ),
                () => null,
              )}
            </div>
            {resolveConditional(
              !scorersCollapsed,
              () => attachedScorerEntries.length === 0,
              () => null,
            ) ? (
              <div className="px-4 py-4 text-center">
                <Txt variant="ui-xs" className="text-neutral3">
                  No scorers attached to this dataset.
                </Txt>
                {resolveConditional(
                  unattachedScorerEntries.length > 0,
                  () => (
                    <div className="mt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowAttachScorerDialog(true)}
                      >
                        Attach a scorer
                      </Button>
                    </div>
                  ),
                  () => null,
                )}
              </div>
            ) : (
              <div className="divide-y divide-border1">
                {attachedScorerEntries.map(([id, scorer]) => {
                  const name = (scorer as { scorer?: { name?: string } }).scorer?.name || id;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between px-4 py-1.5 hover:bg-surface3 transition-colors group"
                    >
                      <Txt variant="ui-xs" className="text-neutral5 truncate">
                        {name}
                      </Txt>
                      <button
                        type="button"
                        onClick={() => handleDetachScorer(id)}
                        aria-label={`Detach "${name}" from this dataset`}
                        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-neutral3 hover:text-red-500 p-0.5"
                        title="Detach scorer"
                      >
                        <Icon size="sm">
                          <X />
                        </Icon>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Items section (collapsible) */}
          <div className="border-b border-border1">
            <button
              type="button"
              onClick={() => setItemsCollapsed((prev) => !prev)}
              className="w-full px-4 py-2 flex items-center gap-1 hover:bg-surface3 transition-colors"
            >
              <Icon size="sm" className="text-neutral3">
                {itemsCollapsed ? <ChevronRight /> : <ChevronDown />}
              </Icon>
              <Txt variant="ui-xs" className="text-neutral3 font-semibold uppercase tracking-wider">
                Items ({items.length})
              </Txt>
            </button>
            {resolveConditional(
              !itemsCollapsed,
              () => items.length === 0,
              () => null,
            ) ? (
              <div className="px-4 py-6 text-center">
                <Txt variant="ui-xs" className="text-neutral3">
                  No items yet. Use Generate to create test data.
                </Txt>
              </div>
            ) : (
              <div className="divide-y divide-border1">
                {items.map((item) => {
                  const isExpanded = expandedItemId === item.id;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                        className="w-full text-left px-4 py-2 hover:bg-surface3 transition-colors flex items-start gap-2"
                      >
                        <Icon size="sm" className="text-neutral3 mt-0.5 shrink-0">
                          {isExpanded ? <ChevronDown /> : <ChevronRight />}
                        </Icon>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <Txt variant="ui-xs" className="text-neutral5 block truncate flex-1">
                            {truncateValue(item.input)}
                          </Txt>
                          {isDefined(item.expectedTrajectory) && (
                            <Chip size="small" color="purple">
                              {getExpectedTrajectoryLabel(item.expectedTrajectory)}
                            </Chip>
                          )}
                        </div>
                      </button>
                      {isExpanded && <ExpandedItemEditor datasetId={datasetId} item={item} />}
                    </div>
                  );
                })}
                <div ref={setEndOfListElement} />
                {resolveConditional(
                  isFetchingNextPage,
                  () => (
                    <div className="flex items-center justify-center py-2">
                      <Spinner className="h-3 w-3" />
                    </div>
                  ),
                  () => null,
                )}
              </div>
            )}
          </div>

          {/* Past runs section (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setRunsCollapsed((prev) => !prev)}
              className="w-full px-4 py-2 flex items-center gap-1 hover:bg-surface3 transition-colors"
            >
              <Icon size="sm" className="text-neutral3">
                {runsCollapsed ? <ChevronRight /> : <ChevronDown />}
              </Icon>
              <Icon size="sm" className="text-neutral3">
                <Clock />
              </Icon>
              <Txt variant="ui-xs" className="text-neutral3 font-semibold uppercase tracking-wider">
                Past Runs ({datasetExperiments.length})
              </Txt>
            </button>
            {resolveConditional(
              !runsCollapsed,
              () => datasetExperiments.length === 0,
              () => null,
            ) ? (
              <div className="px-4 py-4 text-center">
                <Txt variant="ui-xs" className="text-neutral3">
                  No experiment runs yet
                </Txt>
              </div>
            ) : (
              <div className="divide-y divide-border1">
                {datasetExperiments.map((exp) => (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => onViewExperiment(exp.id)}
                    className="w-full text-left px-4 py-2 hover:bg-surface3 transition-colors flex items-center gap-2"
                  >
                    <ExperimentStatusDot status={exp.status} />
                    <div className="flex-1 min-w-0">
                      <Txt variant="ui-xs" className="text-neutral5 block">
                        {exp.startedAt ? formatTimestamp(exp.startedAt) : "Unknown"}
                      </Txt>
                      <Txt variant="ui-xs" className="text-neutral3">
                        {exp.succeededCount}/{exp.totalItems} passed
                        {isDefined(exp.datasetVersion) &&
                          ` · ${formatVersionLabel("Dataset", exp.datasetVersion)}`}
                        {exp.agentVersion &&
                          (() => {
                            const av = agentVersions.find((v) => v.id === exp.agentVersion);
                            return ` · ${formatVersionLabel("Agent", av ? av.versionNumber : exp.agentVersion)}`;
                          })()}
                      </Txt>
                    </div>
                    <Icon size="sm" className="text-neutral3">
                      <ChevronRight />
                    </Icon>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Attach Scorer Dialog */}
      <Dialog
        open={showAttachScorerDialog}
        onOpenChange={(open) => {
          setShowAttachScorerDialog(open);
          if (!open) {
            setAttachScorerSearch("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Attach Scorer to Dataset</DialogTitle>
          </DialogHeader>
          <DialogBody className="max-h-[50vh] overflow-y-auto">
            {unattachedScorerEntries.length === 0 ? (
              <Txt variant="ui-sm" className="text-neutral3 py-4 text-center">
                No scorers available to attach.
              </Txt>
            ) : (
              <div className="space-y-2">
                <input
                  aria-label="Search scorers"
                  type="text"
                  placeholder="Search scorers..."
                  value={attachScorerSearch}
                  onChange={(e) => setAttachScorerSearch(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded border border-border1 bg-surface2 text-text1 placeholder:text-neutral3 focus:outline-none focus:ring-1 focus:ring-accent1"
                />
                {unattachedScorerEntries
                  .filter(([id, scorer]) => {
                    if (!attachScorerSearch) {
                      return true;
                    }
                    const name = (scorer as { scorer?: { name?: string } }).scorer?.name || id;
                    return name.toLowerCase().includes(attachScorerSearch.toLowerCase());
                  })
                  .map(([id, scorer]) => {
                    const name = (scorer as { scorer?: { name?: string } }).scorer?.name || id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="w-full text-left px-3 py-2 rounded hover:bg-surface4 transition-colors"
                        onClick={async () => {
                          try {
                            await handleAttachScorer(id);
                            toast.success(`Attached "${name}" to this dataset`);
                            setShowAttachScorerDialog(false);
                          } catch {
                            // error toast already shown by handleAttachScorer
                          }
                        }}
                      >
                        <Txt variant="ui-sm" className="font-medium">
                          {name}
                        </Txt>
                      </button>
                    );
                  })}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
