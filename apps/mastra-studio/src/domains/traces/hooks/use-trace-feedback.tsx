import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

interface UseTraceFeedbackProps {
  traceId?: string;
  page?: number;
}

export const useTraceFeedback = ({ traceId = "", page }: UseTraceFeedbackProps) => {
  const client = useMastraClient();
  const pageNumber = page ?? 0;
  return useQuery({
    enabled: !!traceId,
    gcTime: 0,
    queryFn: () =>
      client.listFeedback({
        filters: { traceId },
        pagination: { page: pageNumber, perPage: 10 },
      }),
    queryKey: ["trace-feedback", traceId, pageNumber],
    refetchInterval: 3000,
    staleTime: 0,
  });
};
