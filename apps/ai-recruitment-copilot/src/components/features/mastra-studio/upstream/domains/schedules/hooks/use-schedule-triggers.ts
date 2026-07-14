import type { ListScheduleTriggersResponse, ScheduleTriggerResponse } from "@mastra/client-js";
import { useInView } from "@mastra/playground-ui/hooks/use-in-view";
import { useMastraClient } from "@mastra/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { useEffect } from "react";

const PER_PAGE = 25;
type ScheduleTriggersPage = ListScheduleTriggersResponse;

export const useScheduleTriggers = (scheduleId: string | undefined) => {
  const client = useMastraClient();
  const { inView: isEndOfListInView, setRef: setEndOfListElement } = useInView();

  const query = useInfiniteQuery<
    ScheduleTriggersPage,
    Error,
    InfiniteData<ScheduleTriggersPage, number | undefined>,
    readonly unknown[],
    number | undefined
  >({
    enabled: !!scheduleId,
    getNextPageParam: (lastPage) => {
      if (!lastPage?.triggers?.length || lastPage.triggers.length < PER_PAGE) {
        return;
      }
      // triggers come back ordered by actualFireAt desc; cursor for next page
      // is the oldest timestamp on the current page (exclusive upper bound).
      return lastPage.triggers.at(-1)!.actualFireAt;
    },
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<ScheduleTriggersPage> => {
      if (!scheduleId) {
        return { triggers: [] as ScheduleTriggerResponse[] };
      }
      return client.listScheduleTriggers(scheduleId, {
        limit: PER_PAGE,
        toActualFireAt: pageParam,
      });
    },
    queryKey: ["schedule-triggers", scheduleId],
    refetchInterval: (query) => {
      const triggers = query.state.data?.pages.flatMap((p) => p.triggers) ?? [];
      const hasActive = triggers.some((t) => {
        if (!t.run) {
          return t.outcome === "published";
        }
        return (
          t.run.status === "pending" || t.run.status === "running" || t.run.status === "waiting"
        );
      });
      return hasActive ? 5000 : false;
    },
  });

  const triggers = query.data?.pages.flatMap((page) => page?.triggers ?? []) ?? [];

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (isEndOfListInView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [isEndOfListInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { ...query, data: triggers, setEndOfListElement };
};
