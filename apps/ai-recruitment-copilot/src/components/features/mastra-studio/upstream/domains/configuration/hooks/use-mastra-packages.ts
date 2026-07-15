import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useMastraPackages = (options?: { enabled?: boolean }) => {
  const client = useMastraClient();

  return useQuery({
    enabled: options?.enabled !== false,
    queryFn: () => client.getSystemPackages(),
    queryKey: ["mastra-packages"],
  });
};
