import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { listAllDepartments } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";
import { listInterviewers } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";

type EmptyFilters = Record<string, never>;

export async function loadStudioInterviewersData({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<EmptyFilters>;
  slug: string;
  workspaceId: string;
}) {
  const queryClient = createQueryClient();
  const [departments] = await Promise.all([
    listAllDepartments(workspaceId),
    queryClient.prefetchQuery({
      queryFn: () =>
        listInterviewers(
          workspaceId,
          { search: query.search },
          {
            page: query.page,
            pageSize: query.pageSize,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        ),
      queryKey: buildDataGridQueryKey(["interviewers", slug], query),
    }),
  ]);

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
    departments,
  };
}
