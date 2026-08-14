import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useTools = (options?: { enabled?: boolean }) => {
  const { requestContext } = usePlaygroundStore();
  const client = useMastraClient();
  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: () => client.listTools(requestContext),
    queryKey: ["tools", requestContext],
  });
};

export const useTool = (toolId: string, options?: { enabled?: boolean }) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: () => client.getTool(toolId).details(requestContext),
    queryKey: ["tool", toolId, requestContext],
  });
};
