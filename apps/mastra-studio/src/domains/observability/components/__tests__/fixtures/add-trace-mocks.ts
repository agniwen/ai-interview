import type { DatasetItem, DatasetRecord } from "@mastra/client-js";
import type { Trajectory } from "@mastra/core/evals";

interface Pagination {
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

const pagination: Pagination = { hasMore: false, page: 0, perPage: 100, total: 1 };

export const datasetsList: { datasets: DatasetRecord[]; pagination: Pagination } = {
  datasets: [
    {
      createdAt: "2026-01-01T00:00:00.000Z",
      description: null,
      id: "dataset-1",
      metadata: null,
      name: "Dataset 1",
      updatedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
    },
  ],
  pagination,
};

export const datasetItem: DatasetItem = {
  createdAt: "2026-01-01T00:00:00.000Z",
  datasetId: "dataset-1",
  datasetVersion: 1,
  id: "item-1",
  input: { city: "Seattle" },
  toolMocks: [{ args: { a: 1 }, output: { ok: true }, toolName: "existing" }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const datasetItemsList: { items: DatasetItem[]; pagination: Pagination } = {
  items: [datasetItem],
  pagination: { hasMore: false, page: 0, perPage: 10, total: 1 },
};

export const trajectoryWithToolCalls: Trajectory = {
  steps: [
    {
      name: "tool: 'getWeather'",
      stepType: "tool_call",
      toolArgs: { city: "Seattle" },
      toolResult: { temp: 52 },
    },
  ],
};

export const trajectoryWithoutToolCalls: Trajectory = {
  steps: [{ name: "gen", stepType: "model_generation" }],
};
