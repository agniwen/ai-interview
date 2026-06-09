import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";
import { loadResumeLibraryMetrics } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/metrics";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import type { ResumeFilters } from "./resumes.functions";

type ResumeSortColumn = "createdAt" | "candidateName" | "updatedAt";

function normalizeResumeSortColumn(value: string | undefined): ResumeSortColumn | undefined {
  if (value === "createdAt" || value === "candidateName" || value === "updatedAt") {
    return value;
  }
  return undefined;
}

export async function loadStudioResumesData({
  query,
  slug,
  workspaceId,
}: {
  query: DataGridQueryState<ResumeFilters>;
  slug: string;
  workspaceId: string;
}) {
  const metrics = await loadResumeLibraryMetrics(workspaceId);
  const queryClient = createQueryClient();
  await queryClient.prefetchQuery({
    queryFn: () =>
      listResumeRecords(
        workspaceId,
        {
          creatorIds: parseCsvParam(query.filters.creatorIds),
          jobDescriptionIds: parseCsvParam(query.filters.jdIds),
          pipelineStages: parseCsvParam(query.filters.stage),
          search: query.search,
          skills: parseCsvParam(query.filters.skills),
        },
        {
          page: query.page,
          pageSize: query.pageSize,
          sortBy: normalizeResumeSortColumn(query.sortBy),
          sortOrder: query.sortOrder,
        },
      ),
    queryKey: buildDataGridQueryKey(["studio-resumes", slug], query),
  });

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
    metrics,
  };
}
