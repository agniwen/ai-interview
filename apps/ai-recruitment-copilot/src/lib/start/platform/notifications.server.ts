import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { queryPaginatedPlatformNotifications } from "@arc/ai-recruitment-copilot-backend/server/routes/platform/routes/notifications/dao";
import type {
  PlatformNotificationProviderFilter,
  PlatformNotificationStatusFilter,
} from "@arc/ai-recruitment-copilot-backend/server/routes/platform/routes/notifications/dao";
import { createQueryClient } from "@arc/shared/query-client";

export interface PlatformNotificationFilters extends Record<string, string> {
  providerId: PlatformNotificationProviderFilter;
  status: PlatformNotificationStatusFilter;
}

export async function loadPlatformNotificationsHydrationState(
  query: DataGridQueryState<PlatformNotificationFilters>,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      queryPaginatedPlatformNotifications({
        page: query.page,
        pageSize: query.pageSize,
        providerId: query.filters.providerId,
        search: query.search,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        status: query.filters.status,
      }),
    queryKey: buildDataGridQueryKey(["platform-notifications"], query),
  });

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
