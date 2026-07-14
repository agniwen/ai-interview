import { Button } from "@mastra/playground-ui/components/Button";
import { DropdownMenu } from "@mastra/playground-ui/components/DropdownMenu";
import { Spinner } from "@mastra/playground-ui/components/Spinner";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { useMastraClient } from "@mastra/react";
import { CheckCircle, ChevronDown, FilterIcon, Sparkles, Trash2, XIcon } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useDatasetReviewItems, useDatasetCompletedItems } from "../hooks/use-dataset-review-items";
import { AnalyzeItemsDialog, ProposedTagsDialog } from "./dataset-review-dialogs";
import type { ProposalAssignment } from "./dataset-review-dialogs";
import { DatasetReviewList } from "./dataset-review-list";
import type { ReviewItem } from "./review-item-card";
import { ReviewItemPanel } from "./review-item-panel";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { useDataset } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { BulkTagPicker } from "@/components/features/mastra-studio/upstream/domains/shared/components/bulk-tag-picker";

export interface DatasetReviewProps {
  datasetId: string;
  /** When set, scopes the review (and completed) lists to items produced by this experiment. */
  experimentId?: string;
  /**
   * Optional request from the parent to auto-feature this item. Whenever this prop changes
   * to a non-null value, the matching review row is selected. Internal interactions still
   * own the featured state afterwards; pass a fresh value on each request (e.g. clear it
   * to `null` when navigating away so a re-open of the same id retriggers selection).
   */
  featuredItemId?: string | null;
}

function getReviewError(error: unknown): string | undefined {
  if (typeof error === "string") {
    return error;
  }
  return error ? String(error) : undefined;
}

function ReviewLoadingBoundary({
  children,
  loading,
}: {
  children: React.ReactNode;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }
  return children;
}

export function DatasetReview({
  datasetId,
  experimentId,
  featuredItemId: featuredItemIdRequest,
}: DatasetReviewProps) {
  const client = useMastraClient();
  const { data: dataset } = useDataset(datasetId);
  const { data: reviewItemsRaw, isLoading: isLoadingReview } = useDatasetReviewItems(datasetId);
  const { data: completedItemsRaw, isLoading: isLoadingCompleted } =
    useDatasetCompletedItems(datasetId);
  const reviewItems = useMemo(
    () =>
      experimentId
        ? (reviewItemsRaw ?? []).filter((i) => i.experimentId === experimentId)
        : reviewItemsRaw,
    [reviewItemsRaw, experimentId],
  );
  const completedItems = useMemo(
    () =>
      experimentId
        ? (completedItemsRaw ?? []).filter((i) => i.experimentId === experimentId)
        : completedItemsRaw,
    [completedItemsRaw, experimentId],
  );
  const { updateExperimentResult } = useDatasetMutations();

  // Local state
  const [featuredItemId, setFeaturedItemId] = useState<string | null>(
    featuredItemIdRequest ?? null,
  );

  // Respond to external "feature this item" requests from the parent (e.g. clicking
  // a "Review" button on an experiment result). The parent passes the same id again
  // by clearing to null in between so a repeat request still re-fires this effect.
  useEffect(() => {
    if (featuredItemIdRequest !== undefined) {
      setFeaturedItemId(featuredItemIdRequest);
    }
  }, [featuredItemIdRequest]);

  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Analyze dialog
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [analyzePrompt, setAnalyzePrompt] = useState("");
  const [analyzeProvider, setAnalyzeProvider] = useState("");
  const [analyzeModel, setAnalyzeModel] = useState("");

  // Proposal dialog
  const [proposedAssignments, setProposedAssignments] = useState<ProposalAssignment[]>([]);
  const [showProposalDialog, setShowProposalDialog] = useState(false);

  // Items in local state — null means "not hydrated yet", [] means "user cleared all"
  const [localItems, setLocalItems] = useState<ReviewItem[] | null>(null);
  const items = useMemo(() => localItems ?? reviewItems ?? [], [localItems, reviewItems]);

  // Reset the local cache when the scope changes (different experiment or dataset)
  // so it re-hydrates from the new queue below, instead of keeping the previous
  // experiment's rows and running mutations against the wrong results.
  useEffect(() => {
    setLocalItems(null);
  }, [datasetId, experimentId]);

  // Sync server data to local on initial load (and after a scope reset above)
  useEffect(() => {
    if (reviewItems && localItems === null) {
      setLocalItems(reviewItems);
    }
  }, [reviewItems, localItems]);

  // Tag vocabulary from dataset + existing item tags
  const datasetTagVocabulary = useMemo(() => {
    const tags = new Set<string>();
    if (dataset?.tags) {
      for (const t of dataset.tags) {
        tags.add(t);
      }
    }
    for (const item of items) {
      for (const t of item.tags) {
        tags.add(t);
      }
    }
    return [...tags].toSorted();
  }, [dataset, items]);

  // Filtered items
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

  // Item actions
  const setItemTags = useCallback(
    (itemId: string, tags: string[]) => {
      setLocalItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? { ...i, tags } : i)));
      const item = items.find((i) => i.id === itemId);
      if (item?.experimentId && item?.datasetId) {
        updateExperimentResult.mutate({
          datasetId: item.datasetId,
          experimentId: item.experimentId,
          resultId: item.id,
          tags,
        });
      }
    },
    [items, updateExperimentResult],
  );

  const rateItem = useCallback(
    async (itemId: string, rating: "positive" | "negative" | undefined) => {
      const item = items.find((i) => i.id === itemId);
      if (item?.traceId && rating !== undefined) {
        try {
          await client.createFeedback({
            feedback: {
              experimentId: item.experimentId ?? undefined,
              feedbackSource: "studio",
              feedbackType: "rating",
              source: "studio",
              sourceId: item.id,
              traceId: item.traceId,
              value: rating === "positive" ? 1 : -1,
            },
          });
        } catch {
          // Feedback is best-effort and must not block local review state.
        }
      }
      setLocalItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? { ...i, rating } : i)));
    },
    [items, client],
  );

  const commentItem = useCallback(
    async (itemId: string, comment: string) => {
      const item = items.find((i) => i.id === itemId);
      if (item?.traceId) {
        try {
          await client.createFeedback({
            feedback: {
              comment,
              experimentId: item.experimentId ?? undefined,
              feedbackSource: "studio",
              feedbackType: "comment",
              source: "studio",
              sourceId: item.id,
              traceId: item.traceId,
              value: comment,
            },
          });
        } catch {
          // Feedback is best-effort and must not block local review state.
        }
      }
      setLocalItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? { ...i, comment } : i)));
    },
    [items, client],
  );

  const removeItem = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      setLocalItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      if (featuredItemId === itemId) {
        setFeaturedItemId(null);
      }
      if (item?.experimentId && item?.datasetId) {
        updateExperimentResult.mutate({
          datasetId: item.datasetId,
          experimentId: item.experimentId,
          resultId: item.id,
          status: null,
        });
      }
    },
    [items, updateExperimentResult, featuredItemId],
  );

  const completeItem = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      setLocalItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
      if (featuredItemId === itemId) {
        setFeaturedItemId(null);
      }
      if (item?.experimentId && item?.datasetId) {
        updateExperimentResult.mutate({
          datasetId: item.datasetId,
          experimentId: item.experimentId,
          resultId: item.id,
          status: "complete",
        });
      }
    },
    [items, updateExperimentResult, featuredItemId],
  );

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
  const toggleSelect = useCallback((itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
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
      for (const itemId of selectedItemIds) {
        const item = items.find((i) => i.id === itemId);
        if (item && !item.tags.includes(tag)) {
          setItemTags(itemId, [...item.tags, tag]);
        }
      }
    },
    [items, selectedItemIds, setItemTags],
  );

  const handleBulkRemoveTag = useCallback(
    (tag: string) => {
      for (const itemId of selectedItemIds) {
        const item = items.find((i) => i.id === itemId);
        if (item && item.tags.includes(tag)) {
          setItemTags(
            itemId,
            item.tags.filter((t) => t !== tag),
          );
        }
      }
    },
    [items, selectedItemIds, setItemTags],
  );

  const handleBulkComplete = useCallback(() => {
    for (const itemId of selectedItemIds) {
      completeItem(itemId);
    }
    setSelectedItemIds(new Set());
  }, [selectedItemIds, completeItem]);

  const handleBulkRemove = useCallback(() => {
    for (const itemId of selectedItemIds) {
      removeItem(itemId);
    }
    setSelectedItemIds(new Set());
  }, [selectedItemIds, removeItem]);

  // Analyze
  const openAnalyzeDialog = useCallback(() => {
    setAnalyzePrompt("");
    setShowAnalyzeDialog(true);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!analyzeProvider || !analyzeModel) {
      return;
    }

    setIsAnalyzing(true);
    setShowAnalyzeDialog(false);

    try {
      const targetItems = items.filter((i) => selectedItemIds.has(i.id));

      if (targetItems.length === 0) {
        setIsAnalyzing(false);
        return;
      }

      const result = await client.clusterFailures({
        availableTags: datasetTagVocabulary.length > 0 ? datasetTagVocabulary : undefined,
        items: targetItems.map((item) => ({
          error: getReviewError(item.error),
          existingTags: item.tags.length > 0 ? item.tags : undefined,
          id: item.id,
          input: item.input,
          output: item.output ?? undefined,
          scores: item.scores,
        })),
        modelId: `${analyzeProvider}/${analyzeModel}`,
        prompt: analyzePrompt || undefined,
      });

      if (result.proposedTags && result.proposedTags.length > 0) {
        setProposedAssignments(result.proposedTags.map((p) => ({ ...p, accepted: true })));
        setShowProposalDialog(true);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [
    analyzeProvider,
    analyzeModel,
    items,
    selectedItemIds,
    client,
    datasetTagVocabulary,
    analyzePrompt,
  ]);

  const handleAcceptProposals = useCallback(() => {
    for (const proposal of proposedAssignments) {
      if (!proposal.accepted) {
        continue;
      }
      const item = items.find((i) => i.id === proposal.itemId);
      if (item) {
        const merged = [...new Set([...item.tags, ...proposal.tags])];
        setItemTags(item.id, merged);
      }
    }
    setShowProposalDialog(false);
  }, [proposedAssignments, items, setItemTags]);

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

  // Navigation — undefined at the edges so the prev/next buttons disable.
  const featuredIndex = featuredItemId
    ? displayItems.findIndex((i) => i.id === featuredItemId)
    : -1;
  const toPreviousItem =
    featuredIndex > 0 ? () => setFeaturedItemId(displayItems[featuredIndex - 1].id) : undefined;
  const toNextItem =
    featuredIndex >= 0 && featuredIndex < displayItems.length - 1
      ? () => setFeaturedItemId(displayItems[featuredIndex + 1].id)
      : undefined;

  const gridColumns = "auto minmax(15rem,1fr) 10rem 8rem 6rem 6rem";

  const renderFeaturedItem = () => {
    if (!featuredItem) {
      return null;
    }
    return (
      <ReviewItemPanel
        item={featuredItem}
        isCompleted={showCompleted}
        tagVocabulary={datasetTagVocabulary}
        onRate={(rating) => void rateItem(featuredItem.id, rating)}
        onSetTags={(tags) => setItemTags(featuredItem.id, tags)}
        onComment={(comment) => void commentItem(featuredItem.id, comment)}
        onRemove={() => removeItem(featuredItem.id)}
        onComplete={showCompleted ? undefined : () => completeItem(featuredItem.id)}
        onPrevious={toPreviousItem}
        onNext={toNextItem}
        onClose={() => setFeaturedItemId(null)}
      />
    );
  };

  return (
    <ReviewLoadingBoundary loading={isLoadingReview}>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AnalyzeItemsDialog
          analyzing={isAnalyzing}
          model={analyzeModel}
          onAnalyze={() => void handleAnalyze()}
          onModelChange={setAnalyzeModel}
          onOpenChange={setShowAnalyzeDialog}
          onPromptChange={setAnalyzePrompt}
          onProviderChange={setAnalyzeProvider}
          open={showAnalyzeDialog}
          prompt={analyzePrompt}
          provider={analyzeProvider}
          selectedCount={selectedItemIds.size}
        />
        <ProposedTagsDialog
          assignments={proposedAssignments}
          items={items}
          onAccept={handleAcceptProposals}
          onAssignmentsChange={setProposedAssignments}
          onOpenChange={setShowProposalDialog}
          open={showProposalDialog}
        />

        {/* Main layout: toolbar + List + Detail Panel */}
        <div
          className={cn(
            "grid w-full h-full grid-cols-1 gap-4 overflow-y-auto",
            featuredItem && "grid-cols-[1fr_1fr]",
          )}
        >
          <div className="grid gap-8 content-start w-full overflow-y-auto">
            <div className="flex items-center justify-between w-full flex-wrap gap-4 gap-x-6">
              {/* Filters (left) */}
              <div className="flex items-center gap-3">
                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="outline" size="md">
                      <FilterIcon />
                      Filter
                      {activeFilterCount > 0 && (
                        <span
                          className={cn(
                            "ml-0.5 inline-flex items-center justify-center rounded-full bg-accent1/50 text-neutral5 text-ui-sm w-5 h-5",
                          )}
                        >
                          {activeFilterCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="start" className={cn("min-w-48")}>
                    {/* Status */}
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger>
                        Status
                        {showCompleted && (
                          <span className={cn("ml-auto text-ui-sm text-accent1")}>1</span>
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
                          Review Queue
                        </DropdownMenu.CheckboxItem>
                        <DropdownMenu.CheckboxItem
                          checked={showCompleted}
                          onCheckedChange={() => {
                            setShowCompleted(true);
                            setFeaturedItemId(null);
                          }}
                          onSelect={(e) => e.preventDefault()}
                        >
                          Completed
                        </DropdownMenu.CheckboxItem>
                      </DropdownMenu.SubContent>
                    </DropdownMenu.Sub>

                    {/* Tags */}
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger>
                        Tags
                        {activeTagFilter && (
                          <span className={cn("ml-auto text-ui-sm text-accent1")}>1</span>
                        )}
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.SubContent>
                        <DropdownMenu.CheckboxItem
                          checked={!activeTagFilter}
                          onCheckedChange={() => setActiveTagFilter(null)}
                          onSelect={(e) => e.preventDefault()}
                        >
                          All
                        </DropdownMenu.CheckboxItem>
                        {untaggedCount > 0 && (
                          <DropdownMenu.CheckboxItem
                            checked={activeTagFilter === "__untagged__"}
                            onCheckedChange={() =>
                              setActiveTagFilter(
                                activeTagFilter === "__untagged__" ? null : "__untagged__",
                              )
                            }
                            onSelect={(e) => e.preventDefault()}
                          >
                            Untagged
                          </DropdownMenu.CheckboxItem>
                        )}
                        {tagCounts.length > 0 && <DropdownMenu.Separator />}
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

                    {/* Clear all */}
                    {activeFilterCount > 0 && (
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
                          Clear all filters
                        </DropdownMenu.Item>
                      </>
                    )}
                  </DropdownMenu.Content>
                </DropdownMenu>

                {activeFilterCount > 0 && (
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
                    Reset
                  </Button>
                )}
              </div>

              {/* Actions (right) */}
              {!showCompleted && selectedItemIds.size > 0 && (
                <div className="flex items-center gap-2">
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
                        Actions
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item onSelect={handleBulkComplete}>
                        <Icon size="sm">
                          <CheckCircle />
                        </Icon>
                        Complete
                      </DropdownMenu.Item>
                      <DropdownMenu.Item onSelect={handleBulkRemove}>
                        <Icon size="sm">
                          <Trash2 />
                        </Icon>
                        Remove
                      </DropdownMenu.Item>
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item onSelect={openAnalyzeDialog}>
                        <Icon size="sm">
                          <Sparkles />
                        </Icon>
                        Analyze
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </div>
              )}
            </div>

            <DatasetReviewList
              displayItems={displayItems}
              featuredItemId={featuredItemId}
              gridColumns={gridColumns}
              isAllSelected={isAllSelected}
              isLoading={isLoadingDisplay}
              isSomeSelected={isSomeSelected}
              onRowClick={handleRowClick}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              selectedItemIds={selectedItemIds}
              showCompleted={showCompleted}
            />
          </div>

          {renderFeaturedItem()}
        </div>
      </div>
    </ReviewLoadingBoundary>
  );
}
