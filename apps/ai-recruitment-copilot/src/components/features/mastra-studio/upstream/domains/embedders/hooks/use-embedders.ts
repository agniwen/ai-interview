import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export interface Embedder {
  id: string;
  provider: string;
  name: string;
  description: string;
  dimensions: number;
  maxInputTokens: number;
}

export function useEmbedders() {
  const client = useMastraClient();

  return useQuery({
    queryFn: async () => {
      const data = await client.listEmbedders();
      return data;
    },
    queryKey: ["embedders"],
    // Cache for 30 seconds.
    staleTime: 30_000,
  });
}
