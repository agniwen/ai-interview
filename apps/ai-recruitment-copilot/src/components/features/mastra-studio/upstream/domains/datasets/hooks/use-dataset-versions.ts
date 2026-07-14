import type { DatasetVersionResponse } from "@mastra/client-js";
import type { PaginationInfo } from "@mastra/core/storage";
import { useMastraClient } from "@mastra/react";
import { useInfiniteQuery } from "@tanstack/react-query";

export interface DatasetVersion {
  id?: string;
  datasetId?: string;
  version: number;
  createdAt?: Date | string;
  isCurrent: boolean;
}

const PER_PAGE = 10;
interface DatasetVersionsPage {
  pagination: PaginationInfo;
  versions: DatasetVersionResponse[];
}

/**
 * Hook to fetch dataset versions from the API with infinite pagination.
 */
export const useDatasetVersions = (datasetId: string) => {
  const client = useMastraClient();

  return useInfiniteQuery<DatasetVersionsPage, Error, DatasetVersion[], readonly unknown[], number>(
    {
      enabled: Boolean(datasetId),
      getNextPageParam: (lastPage, _, lastPageParam) => {
        if (lastPage?.pagination?.hasMore) {
          return lastPageParam + 1;
        }
        return;
      },
      initialPageParam: 0,
      queryFn: async ({ pageParam }): Promise<DatasetVersionsPage> =>
        client.listDatasetVersions(datasetId, { page: pageParam, perPage: PER_PAGE }),
      queryKey: ["dataset-versions", datasetId],
      select: (data) =>
        data.pages
          .flatMap((page) => page?.versions ?? [])
          .map((v, index) => ({
            createdAt: v.createdAt,
            datasetId: v.datasetId,
            id: v.id,
            isCurrent: index === 0,
            version: v.version,
          })),
    },
  );
};
