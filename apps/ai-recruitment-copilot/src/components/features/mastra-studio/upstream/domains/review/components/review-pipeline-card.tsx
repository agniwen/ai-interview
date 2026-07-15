import type { DatasetExperiment, DatasetRecord, ExperimentReviewCounts } from "@mastra/client-js";
import { HorizontalBars } from "@mastra/playground-ui/components/HorizontalBars";
import { MetricsCard } from "@mastra/playground-ui/components/MetricsCard";
import { useMemo } from "react";

const REVIEW_COLORS = {
  complete: "#22c55e",
  needsReview: "#facc15",
};

// "complete" is the DB status value; we label it "Reviewed" in the UI for clarity
const SEGMENTS = [
  { color: REVIEW_COLORS.needsReview, label: "待评审" },
  { color: REVIEW_COLORS.complete, label: "已评审" },
];

interface ReviewPipelineCardProps {
  reviewSummary?: { counts: ExperimentReviewCounts[] };
  experiments?: DatasetExperiment[];
  datasets?: DatasetRecord[];
  isLoading: boolean;
  isError: boolean;
}

export function ReviewPipelineCard({
  reviewSummary,
  experiments,
  datasets,
  isLoading,
  isError,
}: ReviewPipelineCardProps) {
  const { data, maxVal, totalInPipeline } = useMemo(() => {
    if (!reviewSummary?.counts || !experiments) {
      return { data: [], maxVal: 0, totalInPipeline: 0 };
    }

    const expMap = new Map<string, DatasetExperiment>();
    for (const exp of experiments) {
      expMap.set(exp.id, exp);
    }

    const dsMap = new Map<string, string>();
    if (datasets) {
      for (const ds of datasets) {
        dsMap.set(ds.id, ds.name);
      }
    }

    let max = 0;
    let pipeline = 0;
    const barData: { name: string; values: number[] }[] = [];

    for (const c of reviewSummary.counts) {
      const inPipeline = c.needsReview + c.complete;
      if (inPipeline === 0) {
        continue;
      }

      pipeline += inPipeline;
      if (inPipeline > max) {
        max = inPipeline;
      }

      const exp = expMap.get(c.experimentId);
      const dsName = exp?.datasetId ? dsMap.get(exp.datasetId) : undefined;
      const label = dsName
        ? `${dsName} · ${c.experimentId.slice(0, 8)}`
        : c.experimentId.slice(0, 8);

      barData.push({
        name: label,
        values: [c.needsReview, c.complete],
      });
    }

    return { data: barData, maxVal: max, totalInPipeline: pipeline };
  }, [reviewSummary, experiments, datasets]);

  const hasData = data.length > 0;

  let cardContent: React.ReactNode;
  if (isLoading) {
    cardContent = <MetricsCard.Loading />;
  } else if (isError) {
    cardContent = <MetricsCard.Error message="加载评审数据失败" />;
  } else {
    cardContent = (
      <MetricsCard.Content>
        {hasData ? (
          <HorizontalBars data={data} segments={SEGMENTS} maxVal={maxVal} fmt={String} />
        ) : (
          <MetricsCard.NoData message="尚无数据项送交评审" />
        )}
      </MetricsCard.Content>
    );
  }

  return (
    <MetricsCard>
      <MetricsCard.TopBar>
        <MetricsCard.TitleAndDescription title="评审流程" description="各实验中的待评审数据项。" />
        {hasData && <MetricsCard.Summary value={String(totalInPipeline)} label="流程中的数据项" />}
      </MetricsCard.TopBar>
      {cardContent}
    </MetricsCard>
  );
}
