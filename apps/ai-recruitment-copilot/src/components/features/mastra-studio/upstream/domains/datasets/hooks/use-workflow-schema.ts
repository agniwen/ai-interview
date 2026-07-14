import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to fetch workflow input/output schema by workflow ID.
 * Returns { inputSchema, outputSchema } where each is Record<string, unknown> | null.
 */
export function useWorkflowSchema(workflowId: string | null) {
  const client = useMastraClient();

  return useQuery({
    enabled: !!workflowId,
    queryFn: async () => {
      if (!workflowId) {
        throw new Error("No workflow selected");
      }
      return client.getWorkflow(workflowId).getSchema();
    },
    queryKey: ["workflow-schema", workflowId],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
