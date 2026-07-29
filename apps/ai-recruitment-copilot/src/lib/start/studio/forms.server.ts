import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { createQueryClient } from "@arc/shared/query-client";
import { listCandidateFormTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/queries";
import { listManagedJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import type { CandidateFormFilters } from "./forms.functions";

function normalizeArchivedFilter(value: string): "active" | "archived" | "all" {
  return value === "archived" || value === "all" ? value : "active";
}

export async function loadStudioFormsData({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<CandidateFormFilters>;
  slug: string;
  workspaceId: string;
}) {
  const queryClient = createQueryClient();
  const [jobDescriptions] = await Promise.all([
    listManagedJobDescriptions(workspaceId),
    queryClient.prefetchQuery({
      queryFn: () =>
        listCandidateFormTemplates(
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
      queryKey: buildDataGridQueryKey(["candidate-form-templates", slug], query),
    }),
  ]);

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
    jobDescriptions,
  };
}
