import type { DatasetExperiment, DatasetRecord } from "@mastra/client-js";
import { HorizontalBars } from "@mastra/playground-ui/components/HorizontalBars";
import { MetricsCard } from "@mastra/playground-ui/components/MetricsCard";
import { useMemo } from "react";

const STATUS_COLORS = {
  completed: "#22c55e",
  failed: "#f87171",
  pending: "#fb923c",
  running: "#facc15",
};

const SEGMENTS = [
  { color: STATUS_COLORS.completed, label: "Completed" },
  { color: STATUS_COLORS.running, label: "Running" },
  { color: STATUS_COLORS.pending, label: "Pending" },
  { color: STATUS_COLORS.failed, label: "Failed" },
];

interface ExperimentStatusCardProps {
  experiments?: DatasetExperiment[];
  datasets?: DatasetRecord[];
  isLoading: boolean;
  isError: boolean;
}

interface StatusCounts {
  completed: number;
  failed: number;
  pending: number;
  running: number;
}

function getStatusCounts(map: Map<string, StatusCounts>, key: string): StatusCounts {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }
  const counts = { completed: 0, failed: 0, pending: 0, running: 0 };
  map.set(key, counts);
  return counts;
}

function ExperimentStatusContent({
  data,
  isError,
  isLoading,
  maxVal,
}: {
  data: { name: string; values: number[] }[];
  isError: boolean;
  isLoading: boolean;
  maxVal: number;
}) {
  if (isLoading) {
    return <MetricsCard.Loading />;
  }
  if (isError) {
    return <MetricsCard.Error message="Failed to load experiments data" />;
  }
  if (data.length === 0) {
    return (
      <MetricsCard.Content>
        <MetricsCard.NoData message="No experiments have been run yet" />
      </MetricsCard.Content>
    );
  }
  return (
    <MetricsCard.Content>
      <HorizontalBars data={data} segments={SEGMENTS} maxVal={maxVal} fmt={String} />
    </MetricsCard.Content>
  );
}

export function ExperimentStatusCard({
  experiments,
  datasets,
  isLoading,
  isError,
}: ExperimentStatusCardProps) {
  const { data, maxVal } = useMemo(() => {
    if (!experiments || experiments.length === 0) {
      return { data: [], maxVal: 0 };
    }

    const datasetMap = new Map<string, string>();
    if (datasets) {
      for (const ds of datasets) {
        datasetMap.set(ds.id, ds.name);
      }
    }

    // Group experiments by dataset
    const byDataset = new Map<string, StatusCounts>();
    for (const exp of experiments) {
      const key = exp.datasetId ?? "unknown";
      const counts = getStatusCounts(byDataset, key);
      const status = exp.status as keyof typeof counts;
      if (status in counts) {
        counts[status] += 1;
      }
    }

    let max = 0;
    const barData = [...byDataset.entries()].map(([datasetId, counts]) => {
      const total = counts.completed + counts.running + counts.pending + counts.failed;
      if (total > max) {
        max = total;
      }
      return {
        name: datasetMap.get(datasetId) ?? datasetId.slice(0, 12),
        values: [counts.completed, counts.running, counts.pending, counts.failed],
      };
    });

    return { data: barData, maxVal: max };
  }, [experiments, datasets]);

  const hasData = data.length > 0;

  return (
    <MetricsCard>
      <MetricsCard.TopBar>
        <MetricsCard.TitleAndDescription
          title="Experiments by Dataset"
          description="Experiment status breakdown per dataset."
        />
        {hasData && (
          <MetricsCard.Summary value={String(experiments?.length ?? 0)} label="Total experiments" />
        )}
      </MetricsCard.TopBar>
      <ExperimentStatusContent
        data={data}
        isError={isError}
        isLoading={isLoading}
        maxVal={maxVal}
      />
    </MetricsCard>
  );
}
