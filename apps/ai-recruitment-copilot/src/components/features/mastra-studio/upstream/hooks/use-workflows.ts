import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useWorkflow = (workflowId?: string) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();
  return useQuery({
    enabled: Boolean(workflowId),
    queryFn: () => (workflowId ? client.getWorkflow(workflowId).details(requestContext) : null),
    queryKey: ["workflow", workflowId],
    refetchOnWindowFocus: false,
    retry: false,
    throwOnError: false,
  });
};
