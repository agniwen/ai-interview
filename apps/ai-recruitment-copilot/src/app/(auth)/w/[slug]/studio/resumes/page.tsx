import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ResumeLibraryPage } from "@/app/(auth)/w/[slug]/studio/resumes/_components/resume-library-page";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { QueryHydrationBoundary } from "@/components/query-hydration-boundary";
import { resolveOrganizationBySlug } from "@/lib/server/auth-session";
import { parseCsvParam } from "@/lib/shared/csv";
import { loadResumeLibraryMetrics } from "@/server/routes/studio/routes/resumes/dao/metrics";
import { listResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

export const metadata: Metadata = {
  title: "简历库",
};

type ResumeSortColumn = "createdAt" | "candidateName" | "updatedAt";

function normalizeResumeSortColumn(value: string | undefined): ResumeSortColumn | undefined {
  if (value === "createdAt" || value === "candidateName" || value === "updatedAt") {
    return value;
  }
  return undefined;
}

export default async function StudioResumesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { slug } = await params;
  const query = parseDataGridSearchParams(await searchParams, {
    allowedSortIds: ["createdAt", "candidateName", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { creatorIds: "", jdIds: "", skills: "", stage: "" },
  });
  const activeOrg = await resolveOrganizationBySlug(slug);
  if (!activeOrg) {
    notFound();
  }
  const metrics = await loadResumeLibraryMetrics(activeOrg.id);
  return (
    <QueryHydrationBoundary
      queries={[
        {
          queryFn: () =>
            listResumeRecords(
              activeOrg.id,
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
        },
      ]}
    >
      <ResumeLibraryPage metrics={metrics} />
    </QueryHydrationBoundary>
  );
}
