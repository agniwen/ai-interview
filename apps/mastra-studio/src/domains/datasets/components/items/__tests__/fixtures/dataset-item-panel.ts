import type { DatasetItem } from "@mastra/client-js";

export const baseItem: DatasetItem = {
  createdAt: "2026-01-01T00:00:00.000Z",
  datasetId: "ds-1",
  datasetVersion: 1,
  id: "item-1",
  input: { q: "weather in Seattle?" },
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const itemWithMocks: DatasetItem = {
  ...baseItem,
  toolMocks: [{ args: { city: "Seattle" }, output: { temp: 52 }, toolName: "getWeather" }],
};
