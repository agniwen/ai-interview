import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useMCPServerToolsById = (serverId: string | null) => {
  const client = useMastraClient();

  return useQuery({
    enabled: Boolean(serverId),
    queryFn: async () => {
      const response = await client.getMcpServerTools(serverId!);
      return Object.fromEntries(response.tools.map((tool) => [tool.id, tool]));
    },
    queryKey: ["mcpserver-tools", serverId],
    refetchOnWindowFocus: false,
    retry: false,
  });
};
