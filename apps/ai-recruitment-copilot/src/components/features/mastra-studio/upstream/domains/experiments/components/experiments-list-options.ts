import type { DatasetRecord } from "@mastra/client-js";

export const EXPERIMENT_STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Completed", value: "completed" },
  { label: "Running", value: "running" },
  { label: "Failed", value: "failed" },
  { label: "Pending", value: "pending" },
] as const;

export function getExperimentDatasetOptions(datasets?: DatasetRecord[]) {
  return [
    { label: "All datasets", value: "all" },
    ...(datasets ?? []).map((ds) => ({ label: ds.name, value: ds.id })),
  ];
}
