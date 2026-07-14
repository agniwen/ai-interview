import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to list all datasets with optional pagination
 */
export const useDatasets = (pagination?: { page?: number; perPage?: number }) => {
  const client = useMastraClient();
  return useQuery({
    placeholderData: (previousData) => previousData,
    queryFn: () => client.listDatasets(pagination),
    queryKey: ["datasets", pagination],
  });
};

/**
 * Hook to fetch a single dataset by ID
 */
export const useDataset = (datasetId: string) => {
  const client = useMastraClient();
  return useQuery({
    enabled: Boolean(datasetId),
    queryFn: () => client.getDataset(datasetId),
    queryKey: ["dataset", datasetId],
  });
};
