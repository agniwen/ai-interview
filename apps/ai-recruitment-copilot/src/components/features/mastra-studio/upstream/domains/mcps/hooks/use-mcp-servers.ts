import type { McpServerListResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";
import { usePlaygroundStore } from "@/components/features/mastra-studio/upstream/store/playground-store";

export const useMCPServers = (options?: { enabled?: boolean }) => {
  const client = useMastraClient();
  const { requestContext } = usePlaygroundStore();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const response = await client.getMcpServers(requestContext);
      const mcpServers: McpServerListResponse["servers"] = response.servers;
      return mcpServers;
    },
    queryKey: ["mcp-servers"],
  });
};
