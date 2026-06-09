"use client";

import { useQuery } from "@tanstack/react-query";
import type { RoundEmailSummaryMap } from "@arc/db-schema/round-email-log";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

export function roundEmailSummaryQueryKey(slug: string, roundIds: string[]) {
  return ["studio", "round-emails", "summary", slug, [...roundIds].toSorted()] as const;
}

export function useRoundEmailSummary(slug: string, roundIds: string[]) {
  return useQuery({
    enabled: roundIds.length > 0,
    queryFn: () =>
      rpcFetch<RoundEmailSummaryMap>(
        rpc.api.w[":slug"].studio.interviews["round-emails"].summary.$get({
          param: { slug },
          query: { roundIds: roundIds.join(",") },
        }),
        "加载邮件发送状态失败",
      ),
    queryKey: roundEmailSummaryQueryKey(slug, roundIds),
  });
}
