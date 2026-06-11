"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SendRoundEmailResponse } from "@arc/db-schema/round-email-log";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export function useSendRoundEmail(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roundId: string) =>
      rpcFetch<SendRoundEmailResponse>(
        rpc.api.w[":slug"].studio.interviews["round-emails"][":roundId"].send.$post({
          param: { roundId, slug },
        }),
        "邮件发送失败",
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "round-emails", "summary"] }),
  });
}
