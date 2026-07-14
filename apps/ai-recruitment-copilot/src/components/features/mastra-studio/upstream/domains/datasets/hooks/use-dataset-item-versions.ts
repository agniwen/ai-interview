import type { DatasetItemToolMock } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export interface DatasetItemVersion {
  id: string;
  datasetId: string;
  datasetVersion: number;
  input: unknown;
  groundTruth?: unknown;
  expectedTrajectory?: unknown;
  toolMocks?: DatasetItemToolMock[];
  requestContext?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  validTo: number | null;
  isDeleted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  isLatest: boolean;
}

/**
 * Hook to fetch full item history (SCD-2 rows).
 */
export const useDatasetItemVersions = (datasetId: string, itemId: string) => {
  const client = useMastraClient();

  return useQuery({
    enabled: Boolean(datasetId) && Boolean(itemId),
    queryFn: async () => {
      const res = await client.getItemHistory(datasetId, itemId);

      return (res?.history ?? []).map(
        (version, index): DatasetItemVersion => ({
          createdAt: version.createdAt,
          datasetId: version.datasetId,
          datasetVersion: version.datasetVersion,
          expectedTrajectory: version.expectedTrajectory,
          groundTruth: version.groundTruth,
          id: version.id,
          input: version.input,
          isDeleted: version.isDeleted,
          isLatest: index === 0,
          metadata: version.metadata,
          toolMocks: version.toolMocks,
          updatedAt: version.updatedAt,
          validTo: version.validTo,
        }),
      );
    },
    queryKey: ["dataset-item-versions", datasetId, itemId],
  });
};

/**
 * Hook to fetch a specific version of a dataset item.
 */
export const useDatasetItemVersion = (
  datasetId: string,
  itemId: string,
  datasetVersion: number,
  latestVersion?: number,
) => {
  const client = useMastraClient();

  return useQuery({
    enabled: Boolean(datasetId) && Boolean(itemId) && datasetVersion > 0,
    queryFn: async (): Promise<DatasetItemVersion> => {
      const v = await client.getDatasetItemVersion(datasetId, itemId, datasetVersion);

      return {
        createdAt: v.createdAt,
        datasetId: v.datasetId,
        datasetVersion: v.datasetVersion,
        expectedTrajectory: v.expectedTrajectory,
        groundTruth: v.groundTruth,
        id: v.id,
        input: v.input,
        isDeleted: v.isDeleted ?? false,
        isLatest: latestVersion != null ? datasetVersion === latestVersion : false,
        metadata: v.metadata,
        toolMocks: v.toolMocks,
        updatedAt: v.updatedAt,
        validTo: v.validTo ?? null,
      };
    },
    queryKey: ["dataset-item-version", datasetId, itemId, datasetVersion],
  });
};
