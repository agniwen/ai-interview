import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import {
  listInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import type { InterviewFilters } from "./interviews.functions";

export async function loadStudioInterviewsHydrationState({
  query,
  slug,
  visibilityScope,
  workspaceId,
}: {
  query: DataGridQueryState<InterviewFilters>;
  slug: string;
  visibilityScope: RecruitingVisibilityScope;
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
          visibilityScope,
        ),
      queryKey: buildDataGridQueryKey(["studio-interviews", slug], query),
    }),
    queryClient.prefetchQuery({
      queryFn: () => summarizeInterviewRoundCounts(workspaceId, visibilityScope),
      queryKey: ["studio-interviews", slug, "summary"] as const,
    }),
  ]);

  return structuredClone(dehydrate(queryClient)) as unknown as JsonValue;
}
