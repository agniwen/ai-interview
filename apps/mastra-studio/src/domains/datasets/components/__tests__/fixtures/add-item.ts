import type { DatasetItem } from "@mastra/client-js";

export const createdDatasetItem: DatasetItem = {
  createdAt: "2026-06-16T10:00:00.000Z",
  datasetId: "dataset-1",
  datasetVersion: 1,
  id: "item-1",
  input: { city: "Seattle" },
  toolMocks: [{ args: { city: "Seattle" }, output: { temp: 52 }, toolName: "getWeather" }],
  updatedAt: "2026-06-16T10:00:00.000Z",
};

export const createdDatasetItemWithoutMocks: DatasetItem = {
  ...createdDatasetItem,
  toolMocks: undefined,
};
