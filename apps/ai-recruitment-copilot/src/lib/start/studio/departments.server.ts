import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { listDepartments } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";

type EmptyFilters = Record<string, never>;

export async function loadStudioDepartmentsHydrationState({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<EmptyFilters>;
  slug: string;
  workspaceId: string;
}): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      listDepartments(
        { organizationId: workspaceId, search: query.search },
        {
          page: query.page,
          pageSize: query.pageSize,
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
      ),
    queryKey: buildDataGridQueryKey(["departments", slug], query),
  });

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
