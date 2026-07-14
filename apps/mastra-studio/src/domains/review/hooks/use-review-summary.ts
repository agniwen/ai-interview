import { useMastraClient } from "@mastra/react";
import { useQuery } from "@tanstack/react-query";

export function useReviewSummary() {
  const client = useMastraClient();

  return useQuery({
    queryFn: () => client.getExperimentReviewSummary(),
    queryKey: ["experiment-review-summary"],
  });
}
