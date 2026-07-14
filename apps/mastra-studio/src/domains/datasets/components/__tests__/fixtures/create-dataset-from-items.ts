import type { DatasetItem, DatasetRecord } from "@mastra/client-js";

export const sourceItemWithMocks: DatasetItem = {
  createdAt: "2026-06-16T00:00:00.000Z",
  datasetId: "ds-source",
  datasetVersion: 1,
  expectedTrajectory: { steps: [{ name: "getWeather" }] },
  groundTruth: { answer: "rainy" },
  id: "item-1",
  input: { q: "What is the weather in Seattle?" },
  metadata: { tag: "smoke" },
  requestContext: { tenant: "acme" },
  toolMocks: [
    {
      args: { city: "Seattle" },
      output: { conditions: "rainy", temperature: 60 },
      toolName: "getWeather",
    },
    {
      args: { prompt: "look up the balance" },
      matchArgs: "ignore",
      output: { text: "balance is $100" },
      toolName: "agent-balanceAgent",
    },
  ],
  updatedAt: "2026-06-16T00:00:00.000Z",
};

export const createdDataset: DatasetRecord = {
  createdAt: "2026-06-16T00:00:00.000Z",
  description: null,
  id: "ds-new",
  name: "Copied Dataset",
  updatedAt: "2026-06-16T00:00:00.000Z",
  version: 1,
};

export const createdItem: DatasetItem = {
  ...sourceItemWithMocks,
  datasetId: "ds-new",
  id: "item-new-1",
};
