import type { DatasetExperiment, DatasetRecord, GetScorerResponse } from "@mastra/client-js";
import { MetricsKpiCard } from "@mastra/playground-ui/components/MetricsKpiCard";
import type { ReactNode } from "react";

interface EvaluationKpiCardsProps {
  scorers?: Record<string, GetScorerResponse>;
  datasets?: DatasetRecord[];
  experiments?: DatasetExperiment[];
  avgScore?: number | null;
  prevAvgScore?: number | null;
  totalNeedsReview?: number;
  isLoadingScorers: boolean;
  isLoadingDatasets: boolean;
  isLoadingExperiments: boolean;
  isLoadingScores: boolean;
  isLoadingReview?: boolean;
}

function computeExperimentComparison(experiments?: DatasetExperiment[]) {
  if (!experiments || experiments.length < 2) {
    return null;
  }

  const sorted = [...experiments].toSorted(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const mid = Math.floor(sorted.length / 2);
  const prevCount = mid;
  const currCount = sorted.length - mid;

  if (prevCount === 0) {
    return null;
  }

  const changePct = ((currCount - prevCount) / prevCount) * 100;
  return { changePct: Math.round(changePct * 10) / 10, prevValue: String(prevCount) };
}

interface EvaluationKpiValueProps {
  children?: ReactNode;
  isLoading?: boolean;
  noChangeMessage?: string;
  value?: number | null;
}

function EvaluationKpiValue({
  children,
  isLoading,
  noChangeMessage,
  value,
}: EvaluationKpiValueProps) {
  if (isLoading) {
    return <MetricsKpiCard.Loading />;
  }
  if (value === null || value === undefined) {
    return <MetricsKpiCard.NoData />;
  }
  return (
    <>
      <MetricsKpiCard.Value>{String(value)}</MetricsKpiCard.Value>
      {children ?? <MetricsKpiCard.NoChange message={noChangeMessage} />}
    </>
  );
}

export function EvaluationKpiCards({
  scorers,
  datasets,
  experiments,
  avgScore,
  prevAvgScore,
  totalNeedsReview,
  isLoadingScorers,
  isLoadingDatasets,
  isLoadingExperiments,
  isLoadingScores,
  isLoadingReview,
}: EvaluationKpiCardsProps) {
  const totalScorers = scorers ? Object.keys(scorers).length : undefined;
  const totalDatasets = datasets?.length;
  const totalExperiments = experiments?.length;

  const avgScoreChange =
    avgScore !== null &&
    avgScore !== undefined &&
    prevAvgScore !== null &&
    prevAvgScore !== undefined &&
    prevAvgScore !== 0
      ? {
          changePct: Math.round(((avgScore - prevAvgScore) / prevAvgScore) * 100 * 10) / 10,
          prevValue: String(prevAvgScore),
        }
      : null;

  const expComparison = computeExperimentComparison(experiments);

  return (
    <>
      <MetricsKpiCard>
        <MetricsKpiCard.Label>评分器总数</MetricsKpiCard.Label>
        <EvaluationKpiValue
          isLoading={isLoadingScorers}
          noChangeMessage="静态数量"
          value={totalScorers}
        />
      </MetricsKpiCard>

      <MetricsKpiCard>
        <MetricsKpiCard.Label>数据集总数</MetricsKpiCard.Label>
        <EvaluationKpiValue
          isLoading={isLoadingDatasets}
          noChangeMessage="静态数量"
          value={totalDatasets}
        />
      </MetricsKpiCard>

      <MetricsKpiCard>
        <MetricsKpiCard.Label>平均得分</MetricsKpiCard.Label>
        <EvaluationKpiValue isLoading={isLoadingScores} value={avgScore}>
          {avgScoreChange ? (
            <MetricsKpiCard.Change
              changePct={avgScoreChange.changePct}
              prevValue={avgScoreChange.prevValue}
            />
          ) : (
            <MetricsKpiCard.NoChange />
          )}
        </EvaluationKpiValue>
      </MetricsKpiCard>

      <MetricsKpiCard>
        <MetricsKpiCard.Label>实验总数</MetricsKpiCard.Label>
        <EvaluationKpiValue isLoading={isLoadingExperiments} value={totalExperiments}>
          {expComparison ? (
            <MetricsKpiCard.Change
              changePct={expComparison.changePct}
              prevValue={expComparison.prevValue}
            />
          ) : (
            <MetricsKpiCard.NoChange />
          )}
        </EvaluationKpiValue>
      </MetricsKpiCard>

      <MetricsKpiCard>
        <MetricsKpiCard.Label>待评审</MetricsKpiCard.Label>
        <EvaluationKpiValue
          isLoading={isLoadingReview}
          noChangeMessage={
            totalNeedsReview && totalNeedsReview > 0 ? "个数据项待评审" : "已全部处理"
          }
          value={totalNeedsReview}
        />
      </MetricsKpiCard>
    </>
  );
}
