import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { listAllDepartments } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";
import { listAllInterviewers } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";
import {
  listJobDescriptions,
  loadJobDescriptionMetrics,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { JobDescriptionManagementPage } from "./_components/job-description-management-page";

export const metadata: Metadata = {
  title: "在招岗位管理",
};

export default async function StudioJobDescriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { slug } = await params;
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { departmentId: "", interviewerId: "" },
  });
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const [departments, interviewers, metrics] = await Promise.all([
    listAllDepartments(activeOrg.id),
    listAllInterviewers(activeOrg.id),
    loadJobDescriptionMetrics(activeOrg.id),
  ]);

  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () =>
            listJobDescriptions(
              activeOrg.id,
              {
                departmentId: query.filters.departmentId,
                interviewerId: query.filters.interviewerId,
                search: query.search,
              },
              {
                page: query.page,
                pageSize: query.pageSize,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
              },
            ),
          queryKey: buildDataGridQueryKey(["job-descriptions", slug], query),
        },
      ]}
    >
      <JobDescriptionManagementPage
        departments={departments}
        interviewers={interviewers}
        metrics={metrics}
      />
    </QueryHydrationBoundary>
  );
}
