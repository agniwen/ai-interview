import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { recruitingBoardViewSchema } from "@app/shared/recruiting-board";
import { z } from "zod";
import { RecruitingLedgerPage } from "@/components/features/studio/recruiting-ledger/recruiting-ledger-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioRecruitingLedgerState } from "@/lib/start/studio/recruiting-ledger.functions";

const routeApi = getRouteApi("/w/$slug/studio/recruiting-ledger");

export const recruitingLedgerSearchSchema = z.object({
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  departmentId: z.string().optional(),
  jobDescriptionId: z.string().optional(),
  joiningFrom: z.iso.date().optional(),
  joiningTo: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  recommendationLevel: z.string().optional(),
  responsibleHrId: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "candidateName", "joiningDate", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  stage: recruitingBoardViewSchema.default("all"),
  view: z.enum(["records", "jobs"]).default("records"),
});

function StudioRecruitingLedgerRoute() {
  const state = routeApi.useLoaderData();
  if (state.status !== "ready") {
    return null;
  }
  return <RecruitingLedgerPage />;
}

export const Route = createFileRoute("/w/$slug/studio/recruiting-ledger")({
  validateSearch: recruitingLedgerSearchSchema,
  loader: async ({ params }) => {
    const state = await loadStudioRecruitingLedgerState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/recruiting-ledger`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("招聘台账") }] }),
  component: StudioRecruitingLedgerRoute,
  pendingComponent: () => (
    <StudioTablePageSkeleton columnCount={12} filterCount={4} label="招聘台账" />
  ),
  shouldReload: false,
});
