import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useWorkflows = (options?: { enabled?: boolean }) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const workflows = await client.listWorkflows(requestContext);
      // Filter out processor workflows - they're shown on the Processors tab instead
      return Object.fromEntries(
        Object.entries(workflows).filter(([_, workflow]) => !workflow.isProcessorWorkflow),
      );
    },
    queryKey: ["workflows", requestContext],
  });
};
