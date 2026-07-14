import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

interface useTraceSpanScoresProps {
  traceId?: string;
  spanId?: string;
  page?: number;
}

export const useTraceSpanScores = ({
  traceId = "",
  spanId = "",
  page,
}: useTraceSpanScoresProps) => {
  const client = useMastraClient();
  return useQuery({
    enabled: !!traceId && !!spanId,
    gcTime: 0,
    queryFn: () => client.listScoresBySpan({ page: page || 0, perPage: 10, spanId, traceId }),
    queryKey: ["trace-span-scores", traceId, spanId, page],
    refetchInterval: 3000,
    staleTime: 0,
  });
};
