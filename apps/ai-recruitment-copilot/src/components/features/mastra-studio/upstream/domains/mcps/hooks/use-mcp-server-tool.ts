import type { RequestContext } from "@mastra/core/request-context";
import { useMastraClient } from "@mastra/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useMCPServerTool = (
  serverId: string,
  toolId: string,
  options?: { enabled?: boolean },
) => {
  const { requestContext } = usePlaygroundStore();
  const client = useMastraClient();

  return useQuery({
    enabled: options?.enabled !== false && !!serverId && !!toolId,
    queryFn: () => {
      const instance = client.getMcpServerTool(serverId, toolId);
      return instance.details(requestContext);
    },
    queryKey: ["mcp-server-tool", serverId, toolId],
  });
};

export const useExecuteMCPTool = (serverId: string, toolId: string) => {
  const { requestContext } = usePlaygroundStore();
  const client = useMastraClient();

  return useMutation({
    mutationFn: (data: unknown) => {
      const instance = client.getMcpServerTool(serverId, toolId);
      return instance.execute({ data, requestContext: requestContext as RequestContext });
    },
  });
};
