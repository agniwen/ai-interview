/**
 * 面试列表的数据 hook：封装分页 / 排序 / 关键词查询。
 * Data hook for the interview list — wraps pagination / sorting / keyword querying.
 *
 * 这一层只负责"取数据"，不参与 UI 状态、对话框、批量删除等逻辑。
 * This layer only fetches data; it does not deal with UI state, dialogs, or bulk operations.
 */

"use client";

import type {
  PaginatedStudioInterviewResult,
  StudioInterviewSummary,
} from "@/server/queries/studio-interviews";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface InterviewListQueryParams {
  search: string;
  status: string;
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: string;
}

/**
 * 拼装查询字符串并请求面试列表。
 * Build the query string and request the interview list.
 */
export function fetchInterviewList(
  params: InterviewListQueryParams,
): Promise<PaginatedStudioInterviewResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.status !== "all") {
    qs.set("status", params.status);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", params.sortBy);
  qs.set("sortOrder", params.sortOrder);
  return apiFetch<PaginatedStudioInterviewResult>(`/api/studio/interviews?${qs.toString()}`);
}

/**
 * 拉取列表上方的概览统计（按状态聚合）。
 * Fetch the summary stats shown above the table (status aggregates).
 */
export function fetchInterviewListSummary(): Promise<StudioInterviewSummary> {
  return apiFetch<StudioInterviewSummary>("/api/studio/interviews/summary");
}

/**
 * 列表 + 概览的双查询 hook。
 * Combined hook that owns both the list and the summary queries.
 */
export function useInterviewListData(
  query: InterviewListQueryParams,
  initial: { data: PaginatedStudioInterviewResult; summary: StudioInterviewSummary },
) {
  const queryKey = [
    "studio-interviews",
    query.search,
    query.status,
    query.page,
    query.pageSize,
    query.sortBy,
    query.sortOrder,
  ] as const;

  const summaryQueryKey = ["studio-interviews", "summary"] as const;

  const listQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () => fetchInterviewList(query),
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  const summaryQuery = useQuery({
    placeholderData: (prev) => prev,
    queryFn: fetchInterviewListSummary,
    queryKey: summaryQueryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  return {
    data: listQuery.data ?? initial.data,
    isFetching: listQuery.isFetching,
    isRefetching: listQuery.isRefetching,
    queryKey,
    summary: summaryQuery.data ?? initial.summary,
    summaryQueryKey,
  };
}
