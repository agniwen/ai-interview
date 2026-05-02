"use client";

import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import { useQuery } from "@tanstack/react-query";

const QUERY_KEY = ["job-descriptions", "all"] as const;

async function fetchJobDescriptionOptions(): Promise<JobDescriptionListRecord[]> {
  const response = await fetch("/api/studio/job-descriptions/all");
  if (!response.ok) {
    throw new Error("加载在招岗位列表失败");
  }
  const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
  return payload.records;
}

/**
 * Wrapper around the in-app JD list query. Shared cache across the shell
 * (which needs `refetch` for tool callbacks) and the dialog (which needs
 * the records for the select).
 */
export function useJobDescriptionOptionsQuery() {
  return useQuery({
    queryFn: fetchJobDescriptionOptions,
    queryKey: QUERY_KEY,
    staleTime: 60_000,
  });
}
