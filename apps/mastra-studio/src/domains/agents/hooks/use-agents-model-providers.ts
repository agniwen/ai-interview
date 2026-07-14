import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useAgentsModelProviders = () => {
  const client = useMastraClient();

  return useQuery({
    queryFn: () => client.listAgentsModelProviders(),
    queryKey: ["agents-model-providers"],
    retry: false,
  });
};
