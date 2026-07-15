import { Button } from "@mastra/playground-ui/components/Button";
import { Column, Columns } from "@mastra/playground-ui/components/Columns";
import { DataList } from "@mastra/playground-ui/components/DataList";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import type { UpdateDatasetParams } from "@mastra/client-js";
import {
  CheckCircle,
  ChevronDown,
  FilterIcon,
  GaugeIcon,
  Sparkles,
  Trash2,
  XIcon,
} from "lucide-react";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { usePlaygroundModel } from "../../context/playground-model-context";
import { useReviewQueue } from "../../context/review-queue-context";

import { useCompletedItems } from "../../hooks/use-completed-items";
import { useReviewItems } from "../../hooks/use-review-items";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDatasets } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { BulkTagPicker } from "@/components/features/mastra-studio/upstream/domains/review/components";
import { ReviewItemPanel } from "@/components/features/mastra-studio/upstream/domains/review/components/review-item-panel";
import { resolveConditional } from "../../utils/conditional";
import { isTruthy } from "../../utils/truthiness";
import { getDatasetTags, stringifyValue } from "./agent-playground-review-helpers";
import { ReviewDialogs } from "./agent-playground-review-dialogs";
import { ReviewItemRows } from "./agent-playground-review-item-rows";

interface AgentPlaygroundReviewProps {
  agentId: string;
  onCreateScorer?: (items: { input: unknown; output: unknown }[]) => void;
}

export function AgentPlaygroundReview({ agentId, onCreateScorer }: AgentPlaygroundReviewProps) {
  const {
    items,
    setItemTags,
    rateItem,
    commentItem,
    removeItem,
    completeItem,
    loadPersistedItems,
  } = useReviewQueue();
  const { data: persistedItems } = useReviewItems(agentId);
  const {
    data: completedItems,
    refetch: refetchCompleted,
    isLoading: isLoadingCompleted,
  } = useCompletedItems(agentId);
  const client = useMastraClient();
  const { provider, model } = usePlaygroundModel();
  const { data: allDatasets } = useDatasets();
  const { updateDataset } = useDatasetMutations();

  // Load persisted review items on mount / when data changes
  useEffect(() => {
    if (persistedItems) {
      loadPersistedItems(persistedItems);
    }
  }, [persistedItems, loadPersistedItems]);

  const [featuredItemId, setFeaturedItemId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  // Analyze config dialog
  const analyzeContentRef = useRef<HTMLDivElement>(null);
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [analyzeMode, setAnalyzeMode] = useState<"untagged" | "selected">("untagged");
  const [analyzePrompt, setAnalyzePrompt] = useState("");
  const [analyzeProvider, setAnalyzeProvider] = useState(provider);
  const [analyzeModel, setAnalyzeModel] = useState(model);

  // Proposed tag assignments from Analyze
  const [proposedAssignments, setProposedAssignments] = useState<
    { itemId: string; tags: string[]; reason: string; accepted: boolean }[]
  >([]);
  const [showProposalDialog, setShowProposalDialog] = useState(false);
  const [analysisModelId, setAnalysisModelId] = useState<string | null>(null);

  // Collect tag vocabulary from datasets that items belong to
  const datasets = allDatasets?.datasets;
  const datasetTagVocabulary = useMemo(() => {
    if (!datasets) {
      return [] as string[];
    }
    const datasetIds = new Set(items.map((i) => i.datasetId).filter(Boolean));
    const vocab = new Set<string>();
    for (const ds of datasets) {
      if (datasetIds.has(ds.id)) {
        for (const t of getDatasetTags(ds)) {
          vocab.add(t);
        }
      }
    }
    // Also include any tags already applied to items
    for (const item of items) {
      for (const t of item.tags) {
        vocab.add(t);
      }
    }
    return [...vocab].toSorted();
  }, [datasets, items]);

  // Sync new tags back to dataset vocabulary
  const syncTagToDataset = useCallback(
    (tag: string) => {
      if (!datasets) {
        return;
      }
      const datasetIds = new Set(items.map((i) => i.datasetId).filter(Boolean));
      for (const ds of datasets) {
        if (datasetIds.has(ds.id)) {
          const existingTags = getDatasetTags(ds);
          if (!existingTags.includes(tag)) {
            updateDataset.mutate({
              datasetId: ds.id,
              tags: [...existingTags, tag],
            } satisfies UpdateDatasetParams);
          }
        }
      }
    },
    [datasets, items, updateDataset],
  );

  const openAnalyzeDialog = useCallback(
    (mode: "untagged" | "selected") => {
      setAnalyzeMode(mode);
      setAnalyzePrompt("");
      setAnalyzeProvider(provider);
      setAnalyzeModel(model);
      setShowAnalyzeDialog(true);
    },
    [provider, model],
  );

  const handleAnalyze = useCallback(async () => {
    if (!analyzeProvider || !analyzeModel) {
      return;
    }
    const targetItems =
      analyzeMode === "untagged"
        ? items.filter((i) => i.tags.length === 0)
        : items.filter((i) => selectedItemIds.has(i.id));

    if (targetItems.length === 0) {
      return;
    }

    setShowAnalyzeDialog(false);
    setIsAnalyzing(true);
    try {
      const modelId = `${analyzeProvider}/${analyzeModel}`;
      const result = await client.clusterFailures({
        availableTags: datasetTagVocabulary.length > 0 ? datasetTagVocabulary : undefined,
        items: targetItems.map((item) => ({
          error: stringifyValue(item.error),
          existingTags: item.tags.length > 0 ? item.tags : undefined,
          id: item.id,
          input: item.input,
          output: item.output,
          scores: item.scores,
        })),
        modelId,
        prompt: analyzePrompt.trim() || undefined,
      });

      const proposals = (result.proposedTags ?? [])
        .filter((proposal) => proposal.tags.length > 0)
        .map((proposal) => ({
          accepted: true,
          itemId: proposal.itemId,
          reason: proposal.reason || "",
          tags: proposal.tags,
        }));

      if (proposals.length > 0) {
        setAnalysisModelId(modelId);
        setProposedAssignments(proposals);
        setShowProposalDialog(true);
      } else {
        toast.success("分析完成，未建议新标签。");
      }
    } catch (error) {
      console.error("Failed to analyze failures:", error);
      toast.error("分析失败，请重试。");
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    items,
    analyzeProvider,
    analyzeModel,
    client,
    selectedItemIds,
    datasetTagVocabulary,
    analyzeMode,
    analyzePrompt,
  ]);

  const handleAcceptProposals = useCallback(() => {
    const accepted = proposedAssignments.filter((p) => p.accepted);
    for (const proposal of accepted) {
      const item = items.find((i) => i.id === proposal.itemId);
      if (item) {
        const merged = [...new Set([...item.tags, ...proposal.tags])];
        setItemTags(proposal.itemId, merged);
      }
    }
    const allNewTags = new Set(accepted.flatMap((p) => p.tags));
    for (const tag of allNewTags) {
      syncTagToDataset(tag);
    }
    const tagCount = allNewTags.size;
    const itemCount = accepted.length;
    toast.success(`已将 ${tagCount} 个标签应用到 ${itemCount} 个条目`);
    setShowProposalDialog(false);
    setProposedAssignments([]);
  }, [proposedAssignments, items, setItemTags, syncTagToDataset]);

  // Filter items by tag
  const filteredItems = useMemo(() => {
    if (!activeTagFilter) {
      return items;
    }
    if (activeTagFilter === "__untagged__") {
      return items.filter((i) => i.tags.length === 0);
    }
    return items.filter((i) => i.tags.includes(activeTagFilter));
  }, [items, activeTagFilter]);

  // Tag counts
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
  }, [items]);

  const untaggedCount = useMemo(() => items.filter((i) => i.tags.length === 0).length, [items]);

  // Active filter count for the Filter button badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (activeTagFilter) {
      count += 1;
    }
    if (showCompleted) {
      count += 1;
    }
    return count;
  }, [activeTagFilter, showCompleted]);

  // Display items with tag filtering applied to both views
  const displayItems = useMemo(() => {
    const base = showCompleted ? (completedItems ?? []) : filteredItems;
    if (!showCompleted || !activeTagFilter) {
      return base;
    }
    if (activeTagFilter === "__untagged__") {
      return base.filter((i) => i.tags.length === 0);
    }
    return base.filter((i) => i.tags.includes(activeTagFilter));
  }, [showCompleted, completedItems, filteredItems, activeTagFilter]);
  const isLoadingDisplay = showCompleted ? isLoadingCompleted : false;
  const visibleIds = useMemo(() => new Set(displayItems.map((i) => i.id)), [displayItems]);
  const selectedVisibleCount = useMemo(
    () => [...selectedItemIds].filter((id) => visibleIds.has(id)).length,
    [selectedItemIds, visibleIds],
  );
  const isAllSelected = displayItems.length > 0 && selectedVisibleCount === displayItems.length;
  const isSomeSelected = selectedVisibleCount > 0 && !isAllSelected;

  // Bulk selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(displayItems.map((i) => i.id)));
    }
  }, [isAllSelected, displayItems]);

  const handleBulkTag = useCallback(
    (tag: string) => {
      for (const id of selectedItemIds) {
        const item = items.find((i) => i.id === id);
        if (item && !item.tags.includes(tag)) {
          setItemTags(id, [...item.tags, tag]);
        }
      }
      syncTagToDataset(tag);
    },
    [selectedItemIds, items, setItemTags, syncTagToDataset],
  );

  const handleBulkRemoveTag = useCallback(
    (tag: string) => {
      for (const id of selectedItemIds) {
        const item = items.find((i) => i.id === id);
        if (item && item.tags.includes(tag)) {
          setItemTags(
            id,
            item.tags.filter((t) => t !== tag),
          );
        }
      }
    },
    [selectedItemIds, items, setItemTags],
  );

  const handleBulkComplete = useCallback(async () => {
    for (const id of selectedItemIds) {
      await completeItem(id);
    }
    setSelectedItemIds(new Set());
    void refetchCompleted();
  }, [selectedItemIds, completeItem, refetchCompleted]);

  const handleBulkRemove = useCallback(() => {
    for (const id of selectedItemIds) {
      removeItem(id);
    }
    setSelectedItemIds(new Set());
  }, [selectedItemIds, removeItem]);

  // Row click handler
  const handleRowClick = useCallback((itemId: string) => {
    setFeaturedItemId((prev) => (prev === itemId ? null : itemId));
  }, []);

  // Featured item
  const featuredItem = useMemo(() => {
    if (!featuredItemId) {
      return null;
    }
    return displayItems.find((i) => i.id === featuredItemId) ?? null;
  }, [featuredItemId, displayItems]);

  // Navigation
  const toNextItem = useCallback(() => {
    if (!featuredItemId || displayItems.length === 0) {
      return;
    }
    const idx = displayItems.findIndex((i) => i.id === featuredItemId);
    if (idx < displayItems.length - 1) {
      setFeaturedItemId(displayItems[idx + 1].id);
    }
  }, [featuredItemId, displayItems]);

  const toPreviousItem = useCallback(() => {
    if (!featuredItemId || displayItems.length === 0) {
      return;
    }
    const idx = displayItems.findIndex((i) => i.id === featuredItemId);
    if (idx > 0) {
      setFeaturedItemId(displayItems[idx - 1].id);
    }
  }, [featuredItemId, displayItems]);

  // Dynamic grid columns
  const gridColumns = "auto minmax(15rem,1fr) 10rem 8rem 6rem 6rem";

  return (
    <>
      <ReviewDialogs
        analysisModelId={analysisModelId}
        analyzeContentRef={analyzeContentRef}
        analyzeMode={analyzeMode}
        analyzeModel={analyzeModel}
        analyzePrompt={analyzePrompt}
        analyzeProvider={analyzeProvider}
        handleAcceptProposals={handleAcceptProposals}
        handleAnalyze={handleAnalyze}
        isAnalyzing={isAnalyzing}
        items={items}
        proposedAssignments={proposedAssignments}
        selectedItemCount={selectedItemIds.size}
        setAnalyzeModel={setAnalyzeModel}
        setAnalyzePrompt={setAnalyzePrompt}
        setAnalyzeProvider={setAnalyzeProvider}
        setProposedAssignments={setProposedAssignments}
        setShowAnalyzeDialog={setShowAnalyzeDialog}
        setShowProposalDialog={setShowProposalDialog}
        showAnalyzeDialog={showAnalyzeDialog}
        showProposalDialog={showProposalDialog}
        untaggedCount={untaggedCount}
      />

      {/* Main layout: toolbar + List + Detail Panel */}
      <Columns className={cn("p-4", featuredItem ? "grid-cols-[1fr_1fr]" : "")}>
        <Column>
          <Column.Toolbar>
            {/* Filters (left) */}
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <Button variant="outline" size="md">
                    <FilterIcon />
                    筛选
                    {resolveConditional(
                      activeFilterCount > 0,
                      () => (
                        <span
                          className={cn(
                            "ml-0.5 inline-flex items-center justify-center rounded-full bg-accent1/50 text-neutral5 text-ui-sm w-5 h-5",
                          )}
                        >
                          {activeFilterCount}
                        </span>
                      ),
                      () => null,
                    )}
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="start" className={cn("min-w-48")}>
                  {/* Status */}
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>
                      状态
                      {resolveConditional(
                        showCompleted,
                        () => (
                          <span className={cn("ml-auto text-ui-sm text-accent1")}>1</span>
                        ),
                        () => null,
                      )}
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      <DropdownMenu.CheckboxItem
                        checked={!showCompleted}
                        onCheckedChange={() => {
                          setShowCompleted(false);
                          setFeaturedItemId(null);
                        }}
                        onSelect={(e) => e.preventDefault()}
                      >
                        评审队列
                      </DropdownMenu.CheckboxItem>
                      <DropdownMenu.CheckboxItem
                        checked={showCompleted}
                        onCheckedChange={() => {
                          setShowCompleted(true);
                          setFeaturedItemId(null);
                        }}
                        onSelect={(e) => e.preventDefault()}
                      >
                        已完成
                      </DropdownMenu.CheckboxItem>
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>

                  {/* Tags */}
                  <DropdownMenu.Sub>
                    <DropdownMenu.SubTrigger>
                      标签
                      {resolveConditional(
                        activeTagFilter,
                        () => (
                          <span className={cn("ml-auto text-ui-sm text-accent1")}>1</span>
                        ),
                        () => null,
                      )}
                    </DropdownMenu.SubTrigger>
                    <DropdownMenu.SubContent>
                      <DropdownMenu.CheckboxItem
                        checked={!activeTagFilter}
                        onCheckedChange={() => setActiveTagFilter(null)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        所有标签
                      </DropdownMenu.CheckboxItem>
                      {resolveConditional(
                        untaggedCount > 0,
                        () => (
                          <DropdownMenu.CheckboxItem
                            checked={activeTagFilter === "__untagged__"}
                            onCheckedChange={() =>
                              setActiveTagFilter(
                                activeTagFilter === "__untagged__" ? null : "__untagged__",
                              )
                            }
                            onSelect={(e) => e.preventDefault()}
                          >
                            无标签
                          </DropdownMenu.CheckboxItem>
                        ),
                        () => null,
                      )}
                      {tagCounts.map(([tag]) => (
                        <DropdownMenu.CheckboxItem
                          key={tag}
                          checked={activeTagFilter === tag}
                          onCheckedChange={() =>
                            setActiveTagFilter(activeTagFilter === tag ? null : tag)
                          }
                          onSelect={(e) => e.preventDefault()}
                        >
                          {tag}
                        </DropdownMenu.CheckboxItem>
                      ))}
                    </DropdownMenu.SubContent>
                  </DropdownMenu.Sub>

                  {resolveConditional(
                    activeFilterCount > 0,
                    () => (
                      <>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          onSelect={() => {
                            setActiveTagFilter(null);
                            setShowCompleted(false);
                            setFeaturedItemId(null);
                          }}
                        >
                          <XIcon />
                          清除所有筛选项
                        </DropdownMenu.Item>
                      </>
                    ),
                    () => null,
                  )}
                </DropdownMenu.Content>
              </DropdownMenu>

              {resolveConditional(
                activeFilterCount > 0,
                () => (
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setActiveTagFilter(null);
                      setShowCompleted(false);
                      setFeaturedItemId(null);
                    }}
                  >
                    <XIcon />
                    重置
                  </Button>
                ),
                () => null,
              )}
            </div>

            {/* Actions (right) */}
            <div className="flex items-center gap-2">
              {resolveConditional(
                !showCompleted && selectedItemIds.size > 0,
                () => (
                  <>
                    <BulkTagPicker
                      selectedCount={selectedItemIds.size}
                      vocabulary={datasetTagVocabulary}
                      onApplyTag={handleBulkTag}
                      onRemoveTag={handleBulkRemoveTag}
                      onNewTag={(tag) => handleBulkTag(tag)}
                    />

                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <Button disabled={isAnalyzing}>
                          {isAnalyzing ? (
                            <Spinner className="w-4 h-4" />
                          ) : (
                            <Icon size="sm">
                              <ChevronDown />
                            </Icon>
                          )}
                          操作
                        </Button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content align="end">
                        <DropdownMenu.Item onSelect={handleBulkComplete}>
                          <Icon size="sm">
                            <CheckCircle />
                          </Icon>
                          完成
                        </DropdownMenu.Item>
                        <DropdownMenu.Item onSelect={handleBulkRemove}>
                          <Icon size="sm">
                            <Trash2 />
                          </Icon>
                          移除
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator />
                        <DropdownMenu.Item
                          disabled={selectedItemIds.size === 0}
                          onSelect={() => openAnalyzeDialog("selected")}
                        >
                          <Icon size="sm">
                            <Sparkles />
                          </Icon>
                          分析所选条目
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          disabled={untaggedCount === 0}
                          onSelect={() => openAnalyzeDialog("untagged")}
                        >
                          <Icon size="sm">
                            <Sparkles />
                          </Icon>
                          分析无标签条目
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  </>
                ),
                () => null,
              )}

              {resolveConditional(
                onCreateScorer,
                (createScorer) =>
                  resolveConditional(
                    filteredItems.length > 0 && !showCompleted,
                    () => (
                      <Button
                        variant="outline"
                        size="md"
                        onClick={() => {
                          createScorer(
                            filteredItems.map((item) => ({
                              input: item.input,
                              output: item.output,
                            })),
                          );
                        }}
                      >
                        <Icon size="sm">
                          <GaugeIcon />
                        </Icon>
                        创建评分器
                      </Button>
                    ),
                    () => null,
                  ),
                () => null,
              )}
            </div>
          </Column.Toolbar>

          {resolveConditional(
            isLoadingDisplay,
            () => (
              <div className="flex-1 flex items-center justify-center">
                <Spinner className="h-4 w-4" />
              </div>
            ),
            () =>
              displayItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center px-8">
                    <Txt variant="ui-sm" className="text-neutral3 block">
                      {showCompleted ? "尚无已完成的评审" : "没有待评审条目"}
                    </Txt>
                    <Txt variant="ui-xs" className="text-neutral3 mt-2 block">
                      {showCompleted
                        ? "标记为已完成的条目会显示在此处，供后续审查。"
                        : "在实验结果中发现失败项后，可将其发送到此处进行标注、聚类，并根据失败模式创建评分器。"}
                    </Txt>
                  </div>
                </div>
              ) : (
                <DataList columns={gridColumns} className="min-w-0">
                  <DataList.Top hasLeadingCell>
                    {isTruthy(!showCompleted) ? (
                      <DataList.TopSelectCell
                        checked={resolveConditional(
                          isAllSelected,
                          () => true,
                          () => (isSomeSelected ? "indeterminate" : false),
                        )}
                        onToggle={() => toggleSelectAll()}
                        aria-label="全选"
                      />
                    ) : (
                      <DataList.TopCell>&nbsp;</DataList.TopCell>
                    )}
                    <DataList.TopCells colStart={2}>
                      <DataList.TopCell>输入</DataList.TopCell>
                      <DataList.TopCell>评论</DataList.TopCell>
                      <DataList.TopCell>标签</DataList.TopCell>
                      <DataList.TopCell>评级</DataList.TopCell>
                      <DataList.TopCell>得分</DataList.TopCell>
                    </DataList.TopCells>
                  </DataList.Top>
                  <ReviewItemRows
                    featuredItemId={featuredItemId}
                    handleRowClick={handleRowClick}
                    items={displayItems}
                    selectedItemIds={selectedItemIds}
                    showCompleted={showCompleted}
                    toggleSelect={toggleSelect}
                  />
                </DataList>
              ),
          )}
        </Column>

        {/* Detail panel */}
        {resolveConditional(
          featuredItem,
          (conditionValue) => (
            <ReviewItemPanel
              item={conditionValue}
              isCompleted={showCompleted}
              tagVocabulary={datasetTagVocabulary}
              onRate={(rating) => rateItem(conditionValue.id, rating)}
              onSetTags={(tags) => {
                setItemTags(conditionValue.id, tags);
                for (const t of tags) {
                  if (!datasetTagVocabulary.includes(t)) {
                    syncTagToDataset(t);
                  }
                }
              }}
              onComment={(comment) => commentItem(conditionValue.id, comment)}
              onRemove={() => removeItem(conditionValue.id)}
              onComplete={async () => {
                await completeItem(conditionValue.id);
                void refetchCompleted();
              }}
              onPrevious={toPreviousItem}
              onNext={toNextItem}
              onClose={() => setFeaturedItemId(null)}
            />
          ),
          () => null,
        )}
      </Columns>
    </>
  );
}
