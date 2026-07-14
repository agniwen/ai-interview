import type { GetScorerResponse, ListScoresResponse } from "@mastra/client-js";
import { useInView } from "@mastra/playground-ui/hooks/use-in-view";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useMastraClient } from "@mastra/react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useMergedRequestContext } from "@/domains/request-context";

const SCORES_PER_PAGE = 25;

interface UseScoresByScorerIdProps {
  scorerId: string;
  entityId?: string;
  entityType?: string;
}

function getScoresNextPageParam(
  lastPage: ListScoresResponse | undefined,
  _allPages: unknown,
  lastPageParam: number,
) {
  if (lastPage?.pagination?.hasMore) {
    return lastPageParam + 1;
  }
  return;
}

function selectFlatScores(data: { pages: ListScoresResponse[] }) {
  const seen = new Set<string>();
  const scores = data.pages
    .flatMap((page) => page.scores ?? [])
    .filter((score) => {
      if (seen.has(score.id)) {
        return false;
      }
      seen.add(score.id);
      return true;
    });
  return scores;
}

export const useScoresByScorerId = ({
  scorerId,
  entityId,
  entityType,
}: UseScoresByScorerIdProps) => {
  const client = useMastraClient();
  const { inView: isEndOfListInView, setRef: setEndOfListElement } = useInView();

  const query = useInfiniteQuery({
    getNextPageParam: getScoresNextPageParam,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client.listScoresByScorerId({
        entityId,
        entityType,
        page: pageParam,
        perPage: SCORES_PER_PAGE,
        scorerId,
      }),
    queryKey: ["scores", scorerId, entityId, entityType],
    refetchInterval: 5000,
    select: selectFlatScores,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    if (isEndOfListInView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [isEndOfListInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { ...query, setEndOfListElement };
};

export const useScorer = (scorerId: string) => {
  const client = useMastraClient();
  const [scorer, setScorer] = useState<GetScorerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchScorer = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await client.getScorer(scorerId);
        setScorer(res);
      } catch (error) {
        setScorer(null);
        const errorObj = error instanceof Error ? error : new Error("Error fetching scorer");
        setError(errorObj);
        console.error("Error fetching scorer", error);
        toast.error("Error fetching scorer");
      } finally {
        setIsLoading(false);
      }
    };

    void fetchScorer();
  }, [scorerId, client]);

  return { error, isLoading, scorer };
};

export const useScorers = () => {
  const client = useMastraClient();
  const requestContext = useMergedRequestContext();

  return useQuery({
    gcTime: 0,
    queryFn: () => client.listScorers(requestContext),
    queryKey: ["scorers", requestContext],
    staleTime: 0,
  });
};
