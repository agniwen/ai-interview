import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { listInterviewQuestionTemplates } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries";
import { listAllJobDescriptions } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { InterviewQuestionTemplateManagementPage } from "./_components/interview-question-template-management-page";

export const metadata: Metadata = {
  title: "面试题",
};

export default async function StudioInterviewQuestionTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { slug } = await params;
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
  });
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const jobDescriptions = await listAllJobDescriptions(activeOrg.id);
  const archivedFilter =
    query.filters.archivedFilter === "archived" || query.filters.archivedFilter === "all"
      ? query.filters.archivedFilter
      : "active";

  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () =>
            listInterviewQuestionTemplates(
              activeOrg.id,
              {
                archivedFilter,
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
        },
      ]}
    >
      <InterviewQuestionTemplateManagementPage jobDescriptions={jobDescriptions} />
    </QueryHydrationBoundary>
  );
}
