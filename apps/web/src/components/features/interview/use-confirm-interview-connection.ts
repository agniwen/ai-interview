import { useEffect } from "react";
import { ConnectionState } from "livekit-client";
import { toast } from "sonner";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export function useConfirmInterviewConnection(
  connectionState: ConnectionState,
  interviewId: string,
  roundId: string,
) {
  useEffect(() => {
    if (connectionState !== ConnectionState.Connected) {
      return;
    }
    const controller = new AbortController();
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const confirmConnection = async () => {
      attempts += 1;
      try {
        await rpcFetch(
          rpc.api.interview[":id"][":roundId"].connected.$post(
            { param: { id: interviewId, roundId } },
            { init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]) } },
          ),
          "重连状态同步失败。",
        );
        return;
      } catch {
        // The room is already connected; retry only the bounded status sync.
      }
      if (controller.signal.aborted) {
        return;
      }
      if (attempts < 3) {
        retry = setTimeout(() => {
          void confirmConnection();
        }, 1000 * attempts);
      } else {
        toast.error("连接已建立，但重连状态同步失败，请检查网络。");
      }
    };
    void confirmConnection();
    return () => {
      controller.abort();
      clearTimeout(retry);
    };
  }, [connectionState, interviewId, roundId]);
}
