import type { PaginatedStudioInterviewRecordsResult } from "@app/shared/studio-interview-rounds";
import { useQueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 2000;
const POLL_ATTEMPTS = 30;

export function useEvaluationDocumentGenerationPoll(queryKey: readonly unknown[]) {
  const queryClient = useQueryClient();
  const [queuedRoundIds, setQueuedRoundIds] = useState(() => new Set<string>());
  const timers = useRef(new Set<number>());
  const mounted = useRef(true);

  useEffect(() => {
    const activeTimers = timers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timer of activeTimers) {
        window.clearTimeout(timer);
      }
      activeTimers.clear();
    };
  }, []);

  const start = useCallback(
    (roundId: string) => {
      const toastId = toast.loading("候选人评价表正在后台生成…");
      setQueuedRoundIds((current) => new Set(current).add(roundId));
      const finish = (message: string, generated: boolean) => {
        if (!mounted.current) {
          return;
        }
        setQueuedRoundIds((current) => {
          const next = new Set(current);
          next.delete(roundId);
          return next;
        });
        if (generated) {
          toast.success(message, { id: toastId });
        } else {
          toast.warning(message, { id: toastId });
        }
      };
      const poll = (attempt: number) => {
        const timer = window.setTimeout(() => {
          timers.current.delete(timer);
          void (async () => {
            await queryClient.refetchQueries({ exact: true, queryKey });
            if (!mounted.current) {
              return;
            }
            // 面试记录按批无限加载，评价表可能落在任意已加载的批次里。
            // The list loads in batches, so the round may sit in any loaded page.
            const latest =
              queryClient.getQueryData<InfiniteData<PaginatedStudioInterviewRecordsResult>>(
                queryKey,
              );
            if (
              latest?.pages.some((page) =>
                page.records.some(
                  (record) =>
                    record.kind === "ai" && record.id === roundId && record.feishuDocumentUrl,
                ),
              )
            ) {
              finish("候选人评价表已生成", true);
              return;
            }
            if (attempt + 1 >= POLL_ATTEMPTS) {
              finish("评价表仍在生成，可稍后刷新列表查看", false);
              return;
            }
            poll(attempt + 1);
          })();
        }, POLL_INTERVAL_MS);
        timers.current.add(timer);
      };
      poll(0);
    },
    [queryClient, queryKey],
  );

  return { queuedRoundIds, start };
}
