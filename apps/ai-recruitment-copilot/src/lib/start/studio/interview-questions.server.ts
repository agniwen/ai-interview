import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { listInterviewQuestionTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries";
import { listAllJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import type { InterviewQuestionFilters } from "./interview-questions.functions";

function normalizeArchivedFilter(value: string): "active" | "archived" | "all" {
  return value === "archived" || value === "all" ? value : "active";
}

export async function loadStudioInterviewQuestionsData({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<InterviewQuestionFilters>;
  slug: string;
  workspaceId: string;
}) {
  const queryClient = createQueryClient();
  const [jobDescriptions] = await Promise.all([
    listAllJobDescriptions(workspaceId),
    queryClient.prefetchQuery({
      queryFn: () =>
        listInterviewQuestionTemplates(
          workspaceId,
          {
            archivedFilter: normalizeArchivedFilter(query.filters.archivedFilter),
            jobDescriptionId: query.filters.jobDescriptionId,
            scope: query.filters.scope,
            search: query.search,
          },
          {
            page: query.page,
            pageSize: query.pageSize,
            sortBy: query.sortBy,
            sortOrder: query.sortOrder,
          },
        ),
      queryKey: buildDataGridQueryKey(["interview-question-templates", slug], query),
    }),
  ]);

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
    jobDescriptions,
  };
}
