import type { DatasetRecord, MastraClient } from "@mastra/client-js";

type ListDatasetsResponse = Awaited<ReturnType<MastraClient["listDatasets"]>>;

export function buildDataset(overrides: Partial<DatasetRecord> = {}): DatasetRecord {
  return {
    createdAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    id: "dataset-1",
    name: "Dataset 1",
    updatedAt: new Date("2024-01-01T00:00:00.000Z").toISOString(),
    version: 0,
    ...overrides,
  };
}

export function buildListDatasetsResponse(
  datasets: DatasetRecord[] = [buildDataset()],
): ListDatasetsResponse {
  return {
    datasets,
    pagination: { hasMore: false, page: 0, perPage: 100, total: datasets.length },
  };
}
