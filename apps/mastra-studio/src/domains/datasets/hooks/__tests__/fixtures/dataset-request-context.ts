import type { DatasetItem } from "@mastra/client-js";

export const datasetItemWithRequestContext: DatasetItem = {
  createdAt: "2026-01-01T00:00:00.000Z",
  datasetId: "dataset-1",
  datasetVersion: 1,
  id: "item-1",
  input: { question: "hi" },
  requestContext: { clinicId: "clinic-123" },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const triggerExperimentResponse = {
  completedAt: null,
  experimentId: "experiment-1",
  failedCount: 0,
  results: [],
  startedAt: "2026-01-01T00:00:00.000Z",
  status: "pending" as const,
  succeededCount: 0,
  totalItems: 1,
};
