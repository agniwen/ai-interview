import type { ScoreRowData } from "@mastra/core/evals";
import { EntityType } from "@mastra/core/observability";
import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { SpanDataPanelView } from "@mastra/playground-ui/domains/traces/components/span-data-panel-view";
import { TraceDataPanelView } from "@mastra/playground-ui/domains/traces/components/trace-data-panel-view";
import { TraceKeysAndValues } from "@mastra/playground-ui/domains/traces/components/trace-keys-and-values";
import { TracesErrorContent } from "@mastra/playground-ui/domains/traces/components/traces-error-content";
import { useSpanDetail } from "@mastra/playground-ui/domains/traces/hooks/use-span-detail";
import { useTraceLightSpans } from "@mastra/playground-ui/domains/traces/hooks/use-trace-light-spans";
import { useTraceSpanNavigation } from "@mastra/playground-ui/domains/traces/hooks/use-trace-span-navigation";
import type { SpanTab } from "@mastra/playground-ui/domains/traces/types";
import { cn } from "@mastra/playground-ui/utils/cn";
import { CircleGaugeIcon, SaveIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  useNavigate,
  useParams,
  useSearchParams,
} from "@/components/features/mastra-studio/router/compat";
import { TraceAsItemDialog } from "@/components/features/mastra-studio/upstream/domains/observability/components/trace-as-item-dialog";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { useTraceSpanScores } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-trace-span-scores";
import { ScoreDataPanel } from "@/components/features/mastra-studio/upstream/domains/traces/components/score-data-panel";
import { SpanFeedbackList } from "@/components/features/mastra-studio/upstream/domains/traces/components/span-feedback-list";
import { SpanScoresList } from "@/components/features/mastra-studio/upstream/domains/traces/components/span-scores-list";
import { SpanScoring } from "@/components/features/mastra-studio/upstream/domains/traces/components/span-scoring";
import { useTraceFeedback } from "@/components/features/mastra-studio/upstream/domains/traces/hooks/use-trace-feedback";
import { RouteHeaderActions } from "@/components/features/mastra-studio/upstream/lib/route-header";

function getInitialSpanTab(tab: string | null): SpanTab {
  if (tab === "scoring" || tab === "feedback") {
    return tab;
  }
  return "details";
}

function getSpanEntityType(span: {
  attributes?: Record<string, unknown> | null;
  entityType?: EntityType | null;
}): "Agent" | "Workflow" | undefined {
  if (span.attributes?.agentId || span.entityType === EntityType.AGENT) {
    return "Agent";
  }
  if (span.attributes?.workflowId || span.entityType === EntityType.WORKFLOW_RUN) {
    return "Workflow";
  }
}

type TraceRootSpan = ComponentProps<typeof TraceKeysAndValues>["rootSpan"];

function TraceHeaderActions({
  onEvaluate,
  onSave,
  rootSpan,
}: {
  onEvaluate: () => void;
  onSave: () => void;
  rootSpan?: TraceRootSpan;
}) {
  if (!rootSpan) {
    return null;
  }
  return (
    <RouteHeaderActions owner="trace-detail">
      <ButtonsGroup>
        <Button tooltip="Evaluate Trace" aria-label="Evaluate Trace" onClick={onEvaluate}>
          <CircleGaugeIcon />
          Evaluate
        </Button>
        <Button tooltip="Save as Dataset Item" aria-label="Save as Dataset Item" onClick={onSave}>
          <SaveIcon />
          Save
        </Button>
      </ButtonsGroup>
    </RouteHeaderActions>
  );
}

function TraceTopArea({ rootSpan }: { rootSpan?: TraceRootSpan }) {
  if (!rootSpan) {
    return null;
  }
  return (
    <PageLayout.TopArea>
      <PageLayout.Row>
        <PageLayout.Column>
          <TraceKeysAndValues rootSpan={rootSpan} numOfCol={3} />
        </PageLayout.Column>
      </PageLayout.Row>
    </PageLayout.TopArea>
  );
}

function isRootSpan(span: { parentSpanId?: string | null }): boolean {
  return span.parentSpanId === null || span.parentSpanId === undefined;
}

function getTraceGridClass(featuredSpanId: string | null): string {
  return featuredSpanId ? "grid-cols-[2fr_3fr]" : "grid-cols-[1fr]";
}

function getSpanGridClass(featuredScore: ScoreRowData | undefined): string {
  return featuredScore ? "grid-rows-[1fr_1fr]" : "grid-rows-[1fr]";
}

function getOptionalSearchParam(searchParams: URLSearchParams, key: string): string | undefined {
  return searchParams.get(key) || undefined;
}

export default function TracePage() {
  const { traceId } = useParams() as { traceId: string };
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const spanIdParam = getOptionalSearchParam(searchParams, "spanId");
  const tabParam = searchParams.get("tab");
  const initialSpanTab = getInitialSpanTab(tabParam);
  const scoreIdParam = getOptionalSearchParam(searchParams, "scoreId");

  const [featuredSpanId, setFeaturedSpanId] = useState<string | null>(spanIdParam ?? null);
  const [featuredScore, setFeaturedScore] = useState<ScoreRowData | undefined>();
  const [spanTab, setSpanTab] = useState<SpanTab>(initialSpanTab);
  const [spanScoresPage, setSpanScoresPage] = useState(0);
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);

  const {
    data: traceLight,
    isLoading: isTraceLoading,
    error: traceError,
  } = useTraceLightSpans(traceId);
  const lightSpans = useMemo(() => traceLight?.spans ?? [], [traceLight?.spans]);
  const rootSpan = useMemo(() => lightSpans.find(isRootSpan), [lightSpans]);

  const { data: spanDetailData, isLoading: isLoadingSpanDetail } = useSpanDetail(
    traceId,
    featuredSpanId ?? "",
  );

  // Reset pagination whenever the active span changes — otherwise a page index from a previous
  // span could be reused against a span that has fewer (or no) scores.
  useEffect(() => setSpanScoresPage(0), [traceId, featuredSpanId]);

  const { data: scorers, isLoading: isLoadingScorers } = useScorers();
  const { data: spanScoresData, isLoading: isLoadingSpanScoresData } = useTraceSpanScores({
    page: spanScoresPage,
    spanId: featuredSpanId ?? undefined,
    traceId,
  });

  const [feedbackPage, setFeedbackPage] = useState(0);
  useEffect(() => setFeedbackPage(0), [traceId, featuredSpanId]);
  const { data: feedbackData, isLoading: isLoadingFeedback } = useTraceFeedback({
    page: feedbackPage,
    traceId,
  });

  useEffect(() => {
    if (scoreIdParam && spanScoresData?.scores && !featuredScore) {
      const match = spanScoresData.scores.find((s) => s.id === scoreIdParam);
      if (match) {
        setFeaturedScore(match);
      }
    }
  }, [scoreIdParam, spanScoresData?.scores, featuredScore]);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const handleSpanSelect = useCallback(
    (id: string | null | undefined = null) => {
      const nextId = id ?? null;
      const isSameSpan = nextId === featuredSpanId;
      setFeaturedSpanId(nextId);
      if (!isSameSpan) {
        setFeaturedScore(undefined);
        setSpanTab("details");
        updateSearchParams({ scoreId: null, spanId: nextId, tab: null });
      }
    },
    [featuredSpanId, updateSearchParams],
  );

  const handleSpanClose = useCallback(() => {
    setFeaturedSpanId(null);
    setFeaturedScore(undefined);
    setSpanTab("details");
    updateSearchParams({ scoreId: null, spanId: null, tab: null });
  }, [updateSearchParams]);

  const goToSpan = useCallback(
    (id: string) => {
      setFeaturedSpanId(id);
      setFeaturedScore(undefined);
      setSpanTab("details");
      updateSearchParams({ scoreId: null, spanId: id, tab: null });
    },
    [updateSearchParams],
  );

  const { handlePreviousSpan, handleNextSpan } = useTraceSpanNavigation(
    lightSpans,
    featuredSpanId,
    goToSpan,
  );

  const handleSpanTabChange = useCallback(
    (tab: string) => {
      const next = tab as SpanTab;
      setSpanTab(next);
      setFeaturedScore(undefined);
      updateSearchParams({ scoreId: null, tab: next === "details" ? null : next });
    },
    [updateSearchParams],
  );

  const handleScoreSelect = useCallback(
    (score: ScoreRowData) => {
      setFeaturedScore(score);
      updateSearchParams({ scoreId: score.id });
    },
    [updateSearchParams],
  );

  const handleScoreClose = useCallback(() => {
    setFeaturedScore(undefined);
    updateSearchParams({ scoreId: null });
  }, [updateSearchParams]);

  const handleTraceClose = useCallback(() => {
    void navigate("/observability");
  }, [navigate]);

  const handleEvaluateTrace = useCallback(() => {
    setSpanTab("scoring");
    if (rootSpan && featuredSpanId !== rootSpan.spanId) {
      setFeaturedSpanId(rootSpan.spanId);
      setFeaturedScore(undefined);
      updateSearchParams({ scoreId: null, spanId: rootSpan.spanId, tab: "scoring" });
    } else {
      updateSearchParams({ tab: "scoring" });
    }
  }, [rootSpan, featuredSpanId, updateSearchParams]);

  if (traceError) {
    return (
      <PageLayout height="full">
        <TraceHeaderActions
          rootSpan={rootSpan}
          onEvaluate={handleEvaluateTrace}
          onSave={() => setDatasetDialogOpen(true)}
        />
        <TraceTopArea rootSpan={rootSpan} />
        <PageLayout.MainArea isCentered>
          <TracesErrorContent
            error={traceError}
            resource="traces"
            errorTitle="Failed to load trace"
          />
        </PageLayout.MainArea>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <TraceHeaderActions
        rootSpan={rootSpan}
        onEvaluate={handleEvaluateTrace}
        onSave={() => setDatasetDialogOpen(true)}
      />
      <TraceTopArea rootSpan={rootSpan} />

      <TraceAsItemDialog
        rootSpanId={rootSpan?.spanId}
        traceId={traceId}
        isOpen={datasetDialogOpen}
        onClose={() => setDatasetDialogOpen(false)}
      />

      <div
        className={cn(
          "grid h-full min-h-0 gap-4 overflow-hidden items-start mt-4",
          getTraceGridClass(featuredSpanId),
        )}
      >
        <TraceDataPanelView
          traceId={traceId}
          spans={lightSpans}
          isLoading={isTraceLoading}
          onClose={handleTraceClose}
          onSpanSelect={handleSpanSelect}
          onEvaluateTrace={handleEvaluateTrace}
          initialSpanId={featuredSpanId}
          placement="trace-page"
          timelineChartWidth={featuredSpanId ? "default" : "wide"}
        />
        {featuredSpanId && !isTraceLoading && (
          <div
            className={cn(
              "grid gap-4 max-h-full min-h-0 overflow-auto",
              getSpanGridClass(featuredScore),
            )}
          >
            <SpanDataPanelView
              traceId={traceId}
              spanId={featuredSpanId}
              span={spanDetailData?.span}
              isLoading={isLoadingSpanDetail}
              onClose={handleSpanClose}
              onPrevious={handlePreviousSpan}
              onNext={handleNextSpan}
              activeTab={spanTab}
              onTabChange={handleSpanTabChange}
              feedbackTabBadge={feedbackData?.pagination?.total ?? undefined}
              feedbackTabSlot={() => (
                <SpanFeedbackList
                  feedbackData={feedbackData}
                  onPageChange={setFeedbackPage}
                  isLoadingFeedbackData={isLoadingFeedback}
                />
              )}
              scoringTabBadge={spanScoresData?.pagination?.total ?? undefined}
              scoringTabSlot={({ span, traceId: tid, spanId: sid }) => (
                <div className="grid gap-6">
                  <SpanScoring
                    traceId={tid}
                    isTopLevelSpan={!span.parentSpanId}
                    spanId={sid}
                    entityType={getSpanEntityType(span)}
                    scorers={scorers}
                    isLoadingScorers={isLoadingScorers}
                  />
                  <SpanScoresList
                    scoresData={spanScoresData}
                    onPageChange={setSpanScoresPage}
                    isLoadingScoresData={isLoadingSpanScoresData}
                    onScoreSelect={handleScoreSelect}
                  />
                </div>
              )}
            />
            {featuredScore && <ScoreDataPanel score={featuredScore} onClose={handleScoreClose} />}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
