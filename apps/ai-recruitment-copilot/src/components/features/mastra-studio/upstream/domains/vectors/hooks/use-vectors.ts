import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export interface Vector {
  name: string;
  id: string;
  description?: string;
}

export function useVectors() {
  const client = useMastraClient();

  return useQuery({
    queryFn: async () => {
      const data = await client.listVectors();
      return data;
    },
    queryKey: ["vectors"],
    // Cache for 30 seconds.
    staleTime: 30_000,
  });
}
