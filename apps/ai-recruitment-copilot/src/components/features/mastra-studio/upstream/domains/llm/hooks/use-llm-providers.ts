import type { ListAgentsModelProvidersResponse } from "@mastra/client-js";
import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useLLMProviders = () => {
  const client = useMastraClient();

  return useQuery<ListAgentsModelProvidersResponse>({
    queryFn: async () => await client.listAgentsModelProviders(),
    queryKey: ["llm-providers"],
    retry: false,
  });
};
