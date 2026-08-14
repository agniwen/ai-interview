import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import type { ReviewItem } from "../context/review-queue-context";
import { useAgentExperiments } from "./use-agent-experiments";

/**
 * Loads persisted review items from experiment results with status='needs-review'.
 * Iterates over all experiments for the agent, fetches their results, and filters.
 */
export const useReviewItems = (agentId: string) => {
  const client = useMastraClient();
  const { data: experiments } = useAgentExperiments(agentId);

  return useQuery({
    enabled: Boolean(agentId) && (experiments?.length ?? 0) > 0,
    queryFn: async () => {
      if (!experiments || experiments.length === 0) {
        return [] as ReviewItem[];
      }

      const allResults = await Promise.all(
        experiments.map(async (exp) => {
          try {
            const { results } = await client.listDatasetExperimentResults(exp.datasetId, exp.id);
            return results
              .filter((r) => r.status === "needs-review")
              .map((r) => ({
                comment: "",
                datasetId: exp.datasetId,
                error: r.error,
                experimentId: r.experimentId,
                id: r.id,
                input: r.input,
                itemId: r.itemId,
                output: r.output,
                scores: r.scores
                  ? Object.fromEntries(r.scores.map((s) => [s.scorerId, s.score ?? 0]))
                  : {},
                tags: r.tags ?? [],
                traceId: r.traceId ?? undefined,
              }));
          } catch {
            return [];
          }
        }),
      );

      return allResults.flat() as ReviewItem[];
    },
    queryKey: ["review-items", agentId, experiments?.map((e) => e.id)],
    refetchOnWindowFocus: false,
  });
};
