import type { DatasetItem } from "@mastra/client-js";
import type { PaginationInfo } from "@mastra/core/storage";
import { useInView } from "@mastra/playground-ui/hooks/use-in-view";
import { useMastraClient } from "@mastra/react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Hook to fetch a single dataset item by ID
 */
export const useDatasetItem = (datasetId: string, itemId: string) => {
  const client = useMastraClient();
  return useQuery({
    enabled: Boolean(datasetId) && Boolean(itemId),
    queryFn: () => client.getDatasetItem(datasetId, itemId),
    queryKey: ["dataset-item", datasetId, itemId],
    retry: false, // Don't retry 404s for deleted items
  });
};

const PER_PAGE = 10;
interface DatasetItemsPage {
  items: DatasetItem[];
  pagination: PaginationInfo;
}

/**
 * Hook to list items in a dataset with infinite scroll pagination and optional search
 * @param version - Optional version timestamp to view historical snapshot
 */
export const useDatasetItems = (datasetId: string, search?: string, version?: number | null) => {
  const client = useMastraClient();
  const { inView: isEndOfListInView, setRef: setEndOfListElement } = useInView();

  const query = useInfiniteQuery<
    DatasetItemsPage,
    Error,
    InfiniteData<DatasetItemsPage, number>,
    readonly unknown[],
    number
  >({
    enabled: Boolean(datasetId),
    getNextPageParam: (lastPage, _, lastPageParam) => {
      if (!lastPage?.items?.length) {
        return;
      }
      const totalFetched = (lastPageParam + 1) * PER_PAGE;
      const total = lastPage?.pagination?.total ?? 0;
      if (totalFetched >= total) {
        return;
      }
      return lastPageParam + 1;
    },
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<DatasetItemsPage> => {
      const res = await client.listDatasetItems(datasetId, {
        page: pageParam,
        perPage: PER_PAGE,
        search: search || undefined,
        version: version || undefined,
      });
      return res;
    },
    queryKey: ["dataset-items", datasetId, search, version],
    retry: false,
  });

  const items = query.data?.pages.flatMap((page) => page?.items ?? []) ?? [];
  const total = query.data?.pages[0]?.pagination?.total;

  useEffect(() => {
    if (isEndOfListInView && query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [isEndOfListInView, query.hasNextPage, query.isFetchingNextPage]);

  return { ...query, data: items, setEndOfListElement, total };
};
