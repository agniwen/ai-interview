import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export const useExperimentTrace = (traceId: string | null | undefined) => {
  const client = useMastraClient();

  return useQuery({
    enabled: !!traceId,
    queryFn: () => {
      if (!traceId) {
        throw new Error("追踪 ID 为必填项");
      }
      return client.getTraceLight(traceId);
    },
    queryKey: ["experiment-trace-light", traceId],
  });
};
