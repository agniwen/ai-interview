"use client";

import type { DatasetExperimentResult } from "@mastra/client-js";
import type { ExperimentStatus } from "@mastra/core/storage";
import { Button } from "@mastra/playground-ui/components/Button";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { Tabs, Tab, TabList, TabContent } from "@mastra/playground-ui/components/Tabs";
import { Txt } from "@mastra/playground-ui/components/Txt";
import { SpanDataPanelView } from "@mastra/playground-ui/domains/traces/components/span-data-panel-view";
import { TraceDataPanelView } from "@mastra/playground-ui/domains/traces/components/trace-data-panel-view";
import { useSpanDetail } from "@mastra/playground-ui/domains/traces/hooks/use-span-detail";
import { useTraceSpanNavigation } from "@mastra/playground-ui/domains/traces/hooks/use-trace-span-navigation";
import { Icon } from "@mastra/playground-ui/icons/Icon";
import { cn } from "@mastra/playground-ui/utils/cn";
import { toast } from "@mastra/playground-ui/utils/toast";
import { ClipboardCheck } from "lucide-react";
import { useState, useMemo, useCallback } from "react";

import { useExperimentTrace } from "../hooks/use-experiment-trace";
import { ExperimentResultPanel } from "./experiment-result-panel";
import { ExperimentResultsList } from "./experiment-results-list";
import { ExperimentScorePanel } from "./experiment-score-panel";
import { ExperimentScorerSummary } from "./experiment-scorer-summary";
import { useScoresByExperimentId } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-experiments";
import { useDatasetMutations } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-dataset-mutations";
import { DatasetReview } from "@/components/features/mastra-studio/upstream/domains/review/components/dataset-review";
import { useDatasetReviewItems } from "@/components/features/mastra-studio/upstream/domains/review/hooks/use-dataset-review-items";
import { Link } from "@/components/features/mastra-studio/upstream/lib/link";

export interface ExperimentPageTabsProps {
  experimentId: string;
  datasetId: string;
  experimentStatus?: ExperimentStatus;
  results: DatasetExperimentResult[];
  isLoading: boolean;
  setEndOfListElement?: (element: HTMLDivElement | null) => void;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
}

function getResultPanelRow(resultCollapsed: boolean, hasAnotherPanel: boolean): string {
  if (resultCollapsed) {
    return "auto";
  }
  return hasAnotherPanel ? "2fr" : "1fr";
}

function getRightColumnGridRows({
  featuredScore,
  featuredSpanId,
  featuredTraceId,
  resultCollapsed,
  scoreCollapsed,
  traceCollapsed,
}: {
  featuredScore: boolean;
  featuredSpanId: boolean;
  featuredTraceId: boolean;
  resultCollapsed: boolean;
  scoreCollapsed: boolean;
  traceCollapsed: boolean;
}): string {
  const rows = [getResultPanelRow(resultCollapsed, featuredScore || featuredTraceId)];
  if (featuredScore) {
    rows.push(scoreCollapsed ? "auto" : "3fr");
  }
  if (featuredTraceId) {
    rows.push(traceCollapsed ? "auto" : "3fr");
  }
  if (featuredTraceId && featuredSpanId) {
    rows.push("3fr");
  }
  return rows.join(" ");
}

function getResultNavigation(
  results: DatasetExperimentResult[],
  featuredResult: DatasetExperimentResult | null,
  selectResult: (resultId: string | null) => void,
) {
  if (!featuredResult) {
    return { next: undefined, previous: undefined };
  }
  const currentIndex = results.findIndex((result) => result.id === featuredResult.id);
  const next =
    currentIndex !== -1 && currentIndex < results.length - 1
      ? () => selectResult(results[currentIndex + 1].id)
      : undefined;
  const previous = currentIndex > 0 ? () => selectResult(results[currentIndex - 1].id) : undefined;
  return { next, previous };
}

function ExperimentResultsSelection({
  clearSelection,
  flagForReview,
  isFlagging,
  isLoading,
  resultsCount,
  selectLoadedFailed,
  selectedIds,
}: {
  clearSelection: () => void;
  flagForReview: (resultIds: string[]) => Promise<void>;
  isFlagging: boolean;
  isLoading: boolean;
  resultsCount: number;
  selectLoadedFailed: () => void;
  selectedIds: Set<string>;
}) {
  if (selectedIds.size > 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-surface3">
        <Txt variant="ui-xs" className="text-neutral5 font-medium">
          {selectedIds.size} selected
        </Txt>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          disabled={isFlagging}
          onClick={() => flagForReview([...selectedIds])}
        >
          <Icon size="sm">
            <ClipboardCheck />
          </Icon>
          Flag for Review
        </Button>
        <Button variant="ghost" size="sm" onClick={clearSelection}>
          Clear
        </Button>
      </div>
    );
  }

  if (resultsCount > 0 && !isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2">
        <Button variant="ghost" size="sm" onClick={selectLoadedFailed}>
          Select loaded failures
        </Button>
      </div>
    );
  }

  return null;
}

/**
 * Master-detail layout for experiment results.
 * Shows results list on left, result detail panel on right when a result is selected.
 */
export function ExperimentPageTabs({
  experimentId,
  datasetId,
  experimentStatus,
  results,
  isLoading,
  setEndOfListElement,
  isFetchingNextPage,
  hasNextPage,
}: ExperimentPageTabsProps) {
  const [featuredResultId, setSelectedResultId] = useState<string | null>(null);
  const [featuredTraceId, setFeaturedTraceId] = useState<string | null>(null);
  const [featuredSpanId, setFeaturedSpanId] = useState<string | undefined>();
  const [featuredScoreId, setFeaturedScoreId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFlagging, setIsFlagging] = useState(false);
  const [resultCollapsed, setResultCollapsed] = useState(false);
  const [traceCollapsed, setTraceCollapsed] = useState(false);
  const [scoreCollapsed, setScoreCollapsed] = useState(false);

  const { updateExperimentResult } = useDatasetMutations();

  const toggleSelect = useCallback((resultId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) {
        next.delete(resultId);
      } else {
        next.add(resultId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const selectLoadedFailed = useCallback(() => {
    const failedIds = results.filter((r) => Boolean(r.error)).map((r) => r.id);
    setSelectedIds(new Set(failedIds));
  }, [results]);

  const flagForReview = useCallback(
    async (resultIds: string[]) => {
      if (isFlagging || resultIds.length === 0) {
        return;
      }
      setIsFlagging(true);
      let flagged = 0;
      const flaggedIds = new Set<string>();
      try {
        for (const resultId of resultIds) {
          try {
            await updateExperimentResult.mutateAsync({
              datasetId,
              experimentId,
              resultId,
              status: "needs-review",
            });
            flagged += 1;
            flaggedIds.add(resultId);
          } catch {
            // continue on individual failures
          }
        }
      } finally {
        setIsFlagging(false);
      }
      if (flaggedIds.size > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of flaggedIds) {
            next.delete(id);
          }
          return next;
        });
      }
      if (flagged > 0) {
        toast(`${flagged} result${flagged > 1 ? "s" : ""} flagged for review`);
      }
    },
    [datasetId, experimentId, isFlagging, updateExperimentResult],
  );

  const featuredResult = results.find((r) => r.id === featuredResultId) ?? null;

  type TabValue = "summary" | "results" | "reviews";
  const [activeTab, setActiveTab] = useState<TabValue>("summary");
  // Item id to auto-feature on the Reviews tab when the user clicks "Review" on a result.
  // Cleared when leaving the Reviews tab so re-opening the same id retriggers the effect.
  const [reviewFeaturedItemId, setReviewFeaturedItemId] = useState<string | null>(null);

  const handleTabChange = (next: TabValue) => {
    setActiveTab(next);
    if (next !== "reviews") {
      setReviewFeaturedItemId(null);
    }
  };

  const { data: reviewItemsForExperiment } = useDatasetReviewItems(datasetId);
  const reviewCount = (reviewItemsForExperiment ?? []).filter(
    (item) => item.experimentId === experimentId,
  ).length;

  const { data: scoresByExperimentId } = useScoresByExperimentId(experimentId, experimentStatus);

  const scorerIds = useMemo(() => {
    if (!scoresByExperimentId) {
      return [];
    }
    const ids = new Set<string>();
    for (const scores of Object.values(scoresByExperimentId)) {
      for (const score of scores) {
        ids.add(score.scorerId);
      }
    }
    return [...ids].toSorted();
  }, [scoresByExperimentId]);

  const selectResult = (resultId: string | null) => {
    setSelectedResultId(resultId);
    setFeaturedTraceId(null);
    setFeaturedSpanId(undefined);
    setFeaturedScoreId(null);
  };

  const handleResultClick = (resultId: string) => {
    selectResult(resultId === featuredResultId ? null : resultId);
  };

  const handleClose = () => {
    selectResult(null);
  };

  const resultNavigation = getResultNavigation(results, featuredResult, selectResult);

  const featuredResultScores = featuredResult
    ? scoresByExperimentId?.[featuredResult.itemId]
    : undefined;
  const featuredScore = featuredResultScores?.find((s) => s.id === featuredScoreId) ?? null;

  const handleScoreClick = (scoreId: string) => {
    setFeaturedScoreId(scoreId === featuredScoreId ? null : scoreId);
    setFeaturedTraceId(null);
    setFeaturedSpanId(undefined);
  };

  const toNextScore = (): (() => void) | undefined => {
    if (!featuredScoreId || !featuredResultScores) {
      return undefined;
    }
    const currentIndex = featuredResultScores.findIndex((s) => s.id === featuredScoreId);
    if (currentIndex !== -1 && currentIndex < featuredResultScores.length - 1) {
      return () => setFeaturedScoreId(featuredResultScores[currentIndex + 1].id);
    }
    return undefined;
  };

  const toPreviousScore = (): (() => void) | undefined => {
    if (!featuredScoreId || !featuredResultScores) {
      return undefined;
    }
    const currentIndex = featuredResultScores.findIndex((s) => s.id === featuredScoreId);
    if (currentIndex > 0) {
      return () => setFeaturedScoreId(featuredResultScores[currentIndex - 1].id);
    }
    return undefined;
  };

  // Lightweight trace spans for the inline TraceDataPanelView below the result panel.
  // Shares the React Query cache with the trace page's own fetch.
  const { data: traceData, isLoading: isTraceLoading } = useExperimentTrace(featuredTraceId);
  const traceSpans = traceData?.spans;

  // Full span record for the inline SpanDataPanelView (rendered below the trace panel).
  const { data: spanDetailData, isLoading: isSpanLoading } = useSpanDetail(
    featuredTraceId,
    featuredSpanId,
  );
  const featuredSpan = spanDetailData?.span;

  // Span nav walks the timeline in visual (depth-first) order — same hook the
  // traces page uses, so the behavior matches exactly.
  const { handlePreviousSpan: toPreviousSpan, handleNextSpan: toNextSpan } = useTraceSpanNavigation(
    traceSpans,
    featuredSpanId ?? null,
    setFeaturedSpanId,
  );

  // Row template for the right-side panel column. Collapsed rows shrink to `auto`
  // so the panel only takes its header height (mirrors the trace page's behavior).
  // Stack order: Result → Score (if any) → Trace (if any) → Span (if any).
  const rightColumnGridRows = getRightColumnGridRows({
    featuredScore: Boolean(featuredScore),
    featuredSpanId: Boolean(featuredSpanId),
    featuredTraceId: Boolean(featuredTraceId),
    resultCollapsed,
    scoreCollapsed,
    traceCollapsed,
  });

  const resultsListColumns = useMemo(
    () => [
      { label: "Item ID", name: "itemId", size: "7rem" },
      { label: "Status", name: "status", size: "5rem" },
      { label: "Input", name: "input", size: "minmax(15rem,1fr)" },
      ...scorerIds.map((id) => ({ label: id, name: id, size: "12rem" })),
    ],
    [scorerIds],
  );

  return (
    <Tabs
      defaultTab="summary"
      value={activeTab}
      onValueChange={handleTabChange}
      className="grid grid-rows-[auto_1fr] h-full overflow-hidden"
    >
      <TabList>
        <Tab value="summary">Summary</Tab>
        <Tab value="results">Results</Tab>
        <Tab value="reviews">
          Reviews
          {reviewCount > 0 && <Chip color="orange">{reviewCount}</Chip>}
        </Tab>
      </TabList>

      <TabContent value="summary" className="overflow-y-auto mt-5">
        <ExperimentScorerSummary
          scoresByItemId={scoresByExperimentId}
          experimentStatus={experimentStatus}
        />
      </TabContent>

      <TabContent value="reviews" className="overflow-auto mt-2 pb-0">
        <DatasetReview
          datasetId={datasetId}
          experimentId={experimentId}
          featuredItemId={reviewFeaturedItemId}
        />
      </TabContent>

      <TabContent value="results" className="grid grid-rows-[auto_1fr] overflow-hidden mt-2">
        <div className="mb-4">
          <ExperimentResultsSelection
            clearSelection={clearSelection}
            flagForReview={flagForReview}
            isFlagging={isFlagging}
            isLoading={isLoading}
            resultsCount={results.length}
            selectLoadedFailed={selectLoadedFailed}
            selectedIds={selectedIds}
          />
        </div>
        <div
          className={cn(
            "grid w-full h-full grid-cols-1 gap-4 overflow-y-auto",
            featuredResult && "grid-cols-[1fr_1fr]",
          )}
        >
          {/* List column - always visible */}
          <div className="flex overflow-y-auto w-full">
            <div className="grid gap-8 content-start w-full overflow-y-auto">
              <ExperimentResultsList
                results={results}
                isLoading={isLoading}
                featuredResultId={featuredResultId}
                onResultClick={handleResultClick}
                columns={resultsListColumns}
                scoresByItemId={scoresByExperimentId}
                scorerIds={scorerIds}
                setEndOfListElement={setEndOfListElement}
                isFetchingNextPage={isFetchingNextPage}
                hasNextPage={hasNextPage}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            </div>
          </div>

          {featuredResult && (
            <div
              className="grid gap-4 max-h-full min-h-0 overflow-auto content-start"
              style={{ gridTemplateRows: rightColumnGridRows }}
            >
              <ExperimentResultPanel
                result={featuredResult}
                scores={featuredResultScores}
                onPrevious={resultNavigation.previous}
                onNext={resultNavigation.next}
                onClose={handleClose}
                onScoreClick={handleScoreClick}
                featuredScoreId={featuredScoreId}
                onShowTrace={() => {
                  if (!featuredResult.traceId) {
                    return;
                  }
                  setFeaturedTraceId(featuredResult.traceId);
                  setFeaturedSpanId(undefined);
                  setFeaturedScoreId(null);
                  // One-shot: collapse Result so the freshly opened trace has room.
                  // User can re-expand it manually.
                  setResultCollapsed(true);
                  setTraceCollapsed(false);
                }}
                onOpenInReview={() => {
                  setReviewFeaturedItemId(featuredResult.id);
                  setActiveTab("reviews");
                }}
                onFlagForReview={(resultId) => flagForReview([resultId])}
                collapsed={resultCollapsed}
                onCollapsedChange={setResultCollapsed}
              />

              {featuredScore && (
                <ExperimentScorePanel
                  score={featuredScore}
                  onNext={toNextScore()}
                  onPrevious={toPreviousScore()}
                  onClose={() => setFeaturedScoreId(null)}
                  onShowTrace={() => {
                    if (!featuredScore.traceId) {
                      return;
                    }
                    setFeaturedTraceId(featuredScore.traceId);
                    setFeaturedSpanId(undefined);
                    // One-shot: collapse Result and Score so the freshly opened
                    // trace has room. User can re-expand any of them manually.
                    setResultCollapsed(true);
                    setScoreCollapsed(true);
                    setTraceCollapsed(false);
                  }}
                  collapsed={scoreCollapsed}
                  onCollapsedChange={setScoreCollapsed}
                />
              )}

              {featuredTraceId && (
                <>
                  <TraceDataPanelView
                    traceId={featuredTraceId}
                    spans={traceSpans}
                    isLoading={isTraceLoading}
                    onClose={() => {
                      setFeaturedTraceId(null);
                      setFeaturedSpanId(undefined);
                      // Mirror of the open: opening the trace auto-collapsed Result
                      // (and Score, for the Score→Trace flow). Closing restores them.
                      setResultCollapsed(false);
                      setScoreCollapsed(false);
                    }}
                    onSpanSelect={setFeaturedSpanId}
                    initialSpanId={featuredSpanId ?? null}
                    placement="traces-list"
                    showUnavailableFeaturesMsg={false}
                    collapsed={traceCollapsed}
                    onCollapsedChange={setTraceCollapsed}
                    LinkComponent={Link}
                    traceHref={`/traces/${featuredTraceId}`}
                  />

                  {featuredSpanId && (
                    <SpanDataPanelView
                      traceId={featuredTraceId}
                      spanId={featuredSpanId}
                      span={featuredSpan}
                      isLoading={isSpanLoading}
                      onPrevious={toPreviousSpan}
                      onNext={toNextSpan}
                      onClose={() => setFeaturedSpanId(undefined)}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </TabContent>
    </Tabs>
  );
}
