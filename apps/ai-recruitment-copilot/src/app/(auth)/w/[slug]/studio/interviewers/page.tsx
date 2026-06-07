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
import { listInterviewers } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";
import { InterviewerManagementPage } from "./_components/interviewer-management-page";

export const metadata: Metadata = {
  title: "面试官管理",
};

export default async function StudioInterviewersPage({
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
    initialFilters: {},
  });
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const departments = await listAllDepartments(activeOrg.id);

  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () =>
            listInterviewers(
              activeOrg.id,
              { search: query.search },
              {
                page: query.page,
                pageSize: query.pageSize,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
              },
            ),
          queryKey: buildDataGridQueryKey(["interviewers", slug], query),
        },
      ]}
    >
      <InterviewerManagementPage departments={departments} />
    </QueryHydrationBoundary>
  );
}
