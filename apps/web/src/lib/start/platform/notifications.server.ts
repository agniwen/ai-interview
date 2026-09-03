import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/features/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/features/data-grid/query-contract";
import { rpcFetch } from "@/lib/client/api";
import { getServerRpc } from "@/lib/start/server-rpc";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@app/shared/query-client";
import { z } from "zod";

type PlatformNotificationProviderFilter = "all" | "feishu" | "feishu-jiguang-hr";
type PlatformNotificationStatusFilter = "all" | "failed" | "pending" | "sent";

const SORT_COLUMNS = [
  "createdAt",
  "sentAt",
  "updatedAt",
  "status",
  "providerId",
  "candidateName",
  "organizationName",
] as const;

function normalizeSortColumn(value: string | undefined): (typeof SORT_COLUMNS)[number] {
  return SORT_COLUMNS.find((column) => column === value) ?? "createdAt";
}

export interface PlatformNotificationFilters extends Record<string, string> {
  providerId: PlatformNotificationProviderFilter;
  status: PlatformNotificationStatusFilter;
}

export async function loadPlatformNotificationsHydrationState(
  query: DataGridQueryState<PlatformNotificationFilters>,
): Promise<JsonValue> {
  const rpc = getServerRpc();
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.platform.notifications.$get({
          query: {
            page: String(query.page),
            pageSize: String(query.pageSize),
            providerId: query.filters.providerId,
            search: query.search || undefined,
            sortBy: normalizeSortColumn(query.sortBy),
            sortOrder: query.sortOrder ?? "desc",
            status: query.filters.status,
          },
        }),
        "加载飞书通知失败",
      ),
    queryKey: buildDataGridQueryKey(["platform-notifications"], query),
  });

  const serialized = JSON.stringify(dehydrate(queryClient));
  return z.json().parse(JSON.parse(serialized)) satisfies JsonValue;
}
