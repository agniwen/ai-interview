import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";
import {
  listInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import type { InterviewFilters } from "./interviews.functions";

export async function loadStudioInterviewsHydrationState({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<InterviewFilters>;
  slug: string;
  workspaceId: string;
}): Promise<JsonValue> {
  const queryClient = createQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryFn: () =>
        listInterviewRounds(
          workspaceId,
          {
            creatorIds: parseCsvParam(query.filters.creatorIds),
            search: query.search,
            status: query.filters.status,
          },
          {
            page: query.page,
            pageSize: query.pageSize,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        ),
      queryKey: buildDataGridQueryKey(["studio-interviews", slug], query),
    }),
    queryClient.prefetchQuery({
      queryFn: () => summarizeInterviewRoundCounts(workspaceId),
      queryKey: ["studio-interviews", slug, "summary"] as const,
    }),
  ]);

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
