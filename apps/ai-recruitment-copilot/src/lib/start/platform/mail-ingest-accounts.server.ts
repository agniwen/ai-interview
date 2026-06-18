import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { queryPaginatedPlatformMailIngestAccounts } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import { createQueryClient } from "@arc/shared/query-client";

type EmptyFilters = Record<string, never>;

export async function loadPlatformMailIngestAccountsHydrationState(
  query: DataGridQueryState<EmptyFilters>,
): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      queryPaginatedPlatformMailIngestAccounts(
        { search: query.search },
        {
          page: query.page,
          pageSize: query.pageSize,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
      ),
    queryKey: buildDataGridQueryKey(["platform-mail-ingest-accounts"], query),
  });

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
