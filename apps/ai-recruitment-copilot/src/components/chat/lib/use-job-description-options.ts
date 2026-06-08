"use client";

import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { authClient } from "@/lib/client/auth-client";
import { rpc } from "@/lib/client/rpc";
import { useQuery } from "@tanstack/react-query";

async function fetchJobDescriptionOptions(slug: string): Promise<JobDescriptionListRecord[]> {
  const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
    param: { slug },
  });
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
  const { data: activeOrg } = authClient.useActiveOrganization();
  const slug = activeOrg?.slug ?? "";
  return useQuery({
    enabled: !!slug,
    queryFn: () => fetchJobDescriptionOptions(slug),
    queryKey: ["job-descriptions", "all", slug],
    staleTime: 60_000,
  });
}
