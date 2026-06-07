import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { InterviewManagementPage } from "@/app/(auth)/w/[slug]/studio/interviews/_components/interview-management-page";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { parseCsvParam } from "@arc/shared/csv";
import {
  listInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@arc/backend/server/routes/studio/routes/interviews/dao/interview-rounds";

export const metadata: Metadata = {
  title: "AI 面试",
};

export default async function StudioInterviewsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { slug } = await params;
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["scheduledAt", "createdAt", "candidateName", "roundLabel"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", status: "" },
  });
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }

  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () =>
            listInterviewRounds(
              activeOrg.id,
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
        },
        {
          queryFn: () => summarizeInterviewRoundCounts(activeOrg.id),
          queryKey: ["studio-interviews", slug, "summary"] as const,
        },
      ]}
    >
      <InterviewManagementPage />
    </QueryHydrationBoundary>
  );
}
