import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { recruitingBoardViewSchema } from "@app/shared/recruiting-board";
import { jobRecruitingStatusSchema } from "@app/db-schema/job-recruiting-status";
import { z } from "zod";
import { RecruitingLedgerPage } from "@/components/features/studio/recruiting-ledger/recruiting-ledger-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioRecruitingLedgerState } from "@/lib/start/studio/recruiting-ledger.functions";

const routeApi = getRouteApi("/w/$slug/studio/recruiting-ledger");

const multiValueSearchParamSchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    let values: string[] = [];
    if (Array.isArray(value)) {
      values = value;
    } else if (value) {
      values = [value];
    }
    const normalized = [...new Set(values.map((item) => item.trim()).filter(Boolean))];
    return normalized.length > 0 ? normalized : undefined;
  });

const recruitingStatusSearchParamSchema = multiValueSearchParamSchema.transform((values) => {
  const statuses = values?.flatMap((value) => {
    const parsed = jobRecruitingStatusSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  return statuses && statuses.length > 0 ? statuses : undefined;
});

export const recruitingLedgerSearchSchema = z.object({
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  departmentId: multiValueSearchParamSchema,
  jobDescriptionId: multiValueSearchParamSchema,
  joiningFrom: z.iso.date().optional(),
  joiningTo: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  recommendationLevel: multiValueSearchParamSchema,
  recruitingStatus: recruitingStatusSearchParamSchema,
  responsibleHrId: multiValueSearchParamSchema,
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
    <StudioTablePageSkeleton columnCount={12} filterCount={5} label="招聘台账" />
  ),
  shouldReload: false,
});
