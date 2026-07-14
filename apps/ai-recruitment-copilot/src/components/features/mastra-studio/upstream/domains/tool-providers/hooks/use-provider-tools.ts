import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useProviderTools = (
  providerId: string | null,
  params?: { toolkit?: string; search?: string },
) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!providerId,
    queryFn: () => client.getToolProvider(providerId!).listTools(params),
    queryKey: ["tool-provider-tools", providerId, params?.toolkit, params?.search],
  });
};
