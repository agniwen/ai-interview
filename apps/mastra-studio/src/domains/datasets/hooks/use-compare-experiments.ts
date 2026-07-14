import type { CompareExperimentsParams, CompareExperimentsResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

type CompareExperimentsOptions = Omit<
  CompareExperimentsParams,
  "datasetId" | "experimentIdA" | "experimentIdB"
>;

/**
 * Hook to compare two dataset experiments for regression detection
 * @param datasetId - ID of the dataset
 * @param experimentIdA - ID of the first experiment (baseline)
 * @param experimentIdB - ID of the second experiment (comparison)
 * @param options - Optional thresholds for regression detection
 */
export const useCompareExperiments = (
  datasetId: string,
  experimentIdA: string,
  experimentIdB: string,
  options?: CompareExperimentsOptions,
) => {
  const client = useMastraClient();
  return useQuery<CompareExperimentsResponse>({
    enabled: Boolean(datasetId) && Boolean(experimentIdA) && Boolean(experimentIdB),
    queryFn: () =>
      client.compareExperiments({ datasetId, experimentIdA, experimentIdB, ...options }),
    queryKey: ["compare-experiments", datasetId, experimentIdA, experimentIdB, options],
  });
};
