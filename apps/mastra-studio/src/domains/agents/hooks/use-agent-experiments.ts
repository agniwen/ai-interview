import type { DatasetExperiment } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { useDatasets } from "@/domains/datasets/hooks/use-datasets";

export type AgentExperiment = Omit<DatasetExperiment, "datasetId"> & {
  datasetId: string;
  datasetName: string;
};

/**
 * Hook to fetch all experiments relevant to a specific agent across all datasets.
 * Includes experiments targeting the agent directly and experiments targeting attached scorers.
 */
export const useAgentExperiments = (agentId: string, attachedScorerIds: string[] = []) => {
  const client = useMastraClient();
  const { data: datasetsData } = useDatasets();
  const datasets = datasetsData?.datasets ?? [];

  return useQuery({
    enabled: Boolean(agentId) && datasets.length > 0,
    queryFn: async (): Promise<AgentExperiment[]> => {
      if (datasets.length === 0) {
        return [];
      }

      const scorerIdSet = new Set(attachedScorerIds);

      const results = await Promise.all(
        datasets.map(async (dataset): Promise<AgentExperiment[]> => {
          try {
            const response = await client.listDatasetExperiments(dataset.id);
            return response.experiments
              .filter(
                (exp) =>
                  (exp.targetType === "agent" && exp.targetId === agentId) ||
                  (exp.targetType === "scorer" && scorerIdSet.has(exp.targetId)),
              )
              .map(
                (exp): AgentExperiment => ({
                  ...exp,
                  datasetId: dataset.id,
                  datasetName: dataset.name,
                }),
              );
          } catch {
            return [];
          }
        }),
      );

      const getStartedAtTime = (startedAt: AgentExperiment["startedAt"]) => {
        if (!startedAt) {
          return 0;
        }
        return startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
      };

      return results
        .flat()
        .toSorted((a, b) => getStartedAtTime(b.startedAt) - getStartedAtTime(a.startedAt));
    },
    queryKey: ["agent-experiments", agentId, attachedScorerIds, datasets.map((d) => d.id)],
    refetchInterval: (query) => {
      const { data } = query.state;
      if (!data) {
        return false;
      }
      const hasRunning = data.some((exp) => exp.status === "running" || exp.status === "pending");
      return hasRunning ? 3000 : false;
    },
  });
};
