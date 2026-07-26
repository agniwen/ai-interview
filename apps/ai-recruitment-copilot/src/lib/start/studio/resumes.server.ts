import { dehydrate } from "@tanstack/react-query";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { buildInfiniteDataGridQueryKey } from "@/components/data-grid/query-contract";
import type { JsonValue } from "@/lib/start/server-function-types";
import { parseCsvParam } from "@arc/shared/csv";
import { createQueryClient } from "@arc/shared/query-client";
import {
  RESUME_LIBRARY_INFINITE_PAGE_SIZE,
  resumeLibrarySortIds,
} from "@arc/shared/studio-resumes";
import type { PaginatedResumeLibraryResult, ResumeLibrarySortId } from "@arc/shared/studio-resumes";
import type { RecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { listResumeRecords } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import type { ResumeFilters } from "./resumes.functions";

export async function loadStudioResumesData({
  prefetchList,
  query,
  slug,
  visibilityScope,
  workspaceId,
}: {
  prefetchList: boolean;
  query: DataGridQueryState<ResumeFilters>;
  slug: string;
  visibilityScope?: RecruitingVisibilityScope;
  workspaceId: string;
}) {
  const queryClient = createQueryClient();
  if (prefetchList && !visibilityScope) {
    throw new Error("Resume list prefetch requires a recruiting visibility scope.");
  }
  const sortBy = resumeLibrarySortIds.includes(query.sortBy as ResumeLibrarySortId)
    ? (query.sortBy as ResumeLibrarySortId)
    : undefined;
  const listPrefetch =
    prefetchList && visibilityScope
      ? queryClient.prefetchInfiniteQuery({
          getNextPageParam: (lastPage: PaginatedResumeLibraryResult) =>
            lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
          initialPageParam: 1,
          queryFn: ({ pageParam }) =>
            listResumeRecords(
              workspaceId,
              {
                creatorIds: parseCsvParam(query.filters.creatorIds),
                jobDescriptionIds: parseCsvParam(query.filters.jdIds),
                pipelineStages: parseCsvParam(query.filters.stage),
                search: query.search || undefined,
                skills: parseCsvParam(query.filters.skills),
              },
              {
                page: Number(pageParam),
                pageSize: RESUME_LIBRARY_INFINITE_PAGE_SIZE,
                sortBy,
                sortOrder: query.sortOrder,
              },
              visibilityScope,
            ),
          queryKey: buildInfiniteDataGridQueryKey(["studio-resumes", slug], { ...query, sortBy }),
        })
      : Promise.resolve();
  await listPrefetch;

  return {
    dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
  };
}
