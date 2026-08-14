import { ErrorState } from "@mastra/playground-ui/components/ErrorState";
import { MetricsFlexGrid } from "@mastra/playground-ui/components/MetricsFlexGrid";
import { NoDataPageLayout, PageLayout } from "@mastra/playground-ui/components/PageLayout";
import { PermissionDenied } from "@mastra/playground-ui/components/PermissionDenied";
import { SessionExpired } from "@mastra/playground-ui/components/SessionExpired";
import { is401UnauthorizedError, is403ForbiddenError } from "@mastra/playground-ui/utils/errors";
import { useMemo } from "react";
import { DatasetHealthCard } from "@/components/features/mastra-studio/upstream/domains/datasets";
import { useDatasets } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-datasets";
import { useExperiments } from "@/components/features/mastra-studio/upstream/domains/datasets/hooks/use-experiments";
import { EvaluationKpiCards } from "@/components/features/mastra-studio/upstream/domains/evaluation/components/evaluation-kpi-cards";
import { ExperimentStatusCard } from "@/components/features/mastra-studio/upstream/domains/experiments";
import {
  ReviewPipelineCard,
  useReviewSummary,
} from "@/components/features/mastra-studio/upstream/domains/review";
import { computeReviewTotals } from "@/components/features/mastra-studio/upstream/domains/review/review-maps";
import { useScoreMetrics } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-score-metrics";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { ScoresOverTimeCard } from "@/components/features/mastra-studio/upstream/domains/scores/components/scores-over-time-card";

function getFirstError(errors: (Error | null)[]): Error | null {
  return errors.find((error) => error !== null) ?? null;
}

export default function Evaluation() {
  const { data: scorers, isLoading: isLoadingScorers, error: errorScorers } = useScorers();
  const { data: datasetsData, isLoading: isLoadingDatasets, error: errorDatasets } = useDatasets();
  const {
    data: experimentsData,
    isLoading: isLoadingExperiments,
    error: errorExperiments,
  } = useExperiments();
  const {
    data: scoreMetrics,
    isLoading: isLoadingScores,
    isError: isErrorScores,
    error: errorScores,
  } = useScoreMetrics();
  const {
    data: reviewSummary,
    isLoading: isLoadingReview,
    isError: errorReview,
    error: errorReviewSummary,
  } = useReviewSummary();

  const datasets = datasetsData?.datasets;
  const experiments = experimentsData?.experiments;

  const reviewTotals = useMemo(() => computeReviewTotals(reviewSummary), [reviewSummary]);

  const error = getFirstError([
    errorScorers,
    errorDatasets,
    errorExperiments,
    errorScores,
    errorReviewSummary,
  ]);

  if (error && is401UnauthorizedError(error)) {
    return (
      <NoDataPageLayout>
        <SessionExpired />
      </NoDataPageLayout>
    );
  }

  if (error && is403ForbiddenError(error)) {
    return (
      <NoDataPageLayout>
        <PermissionDenied resource="评估" />
      </NoDataPageLayout>
    );
  }

  if (error) {
    return (
      <NoDataPageLayout>
        <ErrorState title="加载评估数据失败" message={error.message} />
      </NoDataPageLayout>
    );
  }

  return (
    <PageLayout width="wide" height="full">
      <div className="flex flex-col gap-6">
        <MetricsFlexGrid>
          <EvaluationKpiCards
            scorers={scorers}
            datasets={datasets}
            experiments={experiments}
            avgScore={scoreMetrics?.avgScore ?? null}
            prevAvgScore={scoreMetrics?.prevAvgScore ?? null}
            totalNeedsReview={reviewTotals.needsReview}
            isLoadingScorers={isLoadingScorers}
            isLoadingDatasets={isLoadingDatasets}
            isLoadingExperiments={isLoadingExperiments}
            isLoadingScores={isLoadingScores}
            isLoadingReview={isLoadingReview}
          />
        </MetricsFlexGrid>
        <ScoresOverTimeCard
          summaryData={scoreMetrics?.summaryData ?? []}
          overTimeData={scoreMetrics?.overTimeData ?? []}
          scorerNames={scoreMetrics?.scorerNames ?? []}
          avgScore={scoreMetrics?.avgScore ?? null}
          isLoading={isLoadingScores}
          isError={isErrorScores}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DatasetHealthCard
            experiments={experiments}
            isLoading={isLoadingExperiments}
            isError={!!errorExperiments}
          />
          <ExperimentStatusCard
            experiments={experiments}
            datasets={datasets}
            isLoading={isLoadingExperiments}
            isError={!!errorExperiments}
          />
        </div>
        <ReviewPipelineCard
          reviewSummary={reviewSummary}
          experiments={experiments}
          datasets={datasets}
          isLoading={isLoadingReview}
          isError={!!errorReview}
        />
      </div>
    </PageLayout>
  );
}
