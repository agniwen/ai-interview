import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";
import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
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
  userId,
  userRole,
  workspaceId,
}: {
  query: DataGridQueryState<ResumeFilters>;
  slug: string;
  userId: string;
  userRole: string;
  workspaceId: string;
}) {
  const metrics = await loadResumeLibraryMetrics(workspaceId);
  const visibilityScope = await resolveRecruitingVisibilityScope({
    currentRole: userRole,
    organizationId: workspaceId,
    userId,
  });
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
        visibilityScope,
      ),
    queryKey: buildDataGridQueryKey(["studio-resumes", slug], query),
  });

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
    metrics,
  };
}
