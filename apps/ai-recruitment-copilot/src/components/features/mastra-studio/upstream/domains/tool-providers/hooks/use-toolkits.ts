import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useToolkits = (providerId: string | null) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!providerId,
    queryFn: () => client.getToolProvider(providerId!).listToolkits(),
    queryKey: ["tool-provider-toolkits", providerId],
  });
};
