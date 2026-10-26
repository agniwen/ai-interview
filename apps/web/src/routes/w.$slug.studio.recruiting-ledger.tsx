import { createFileRoute } from "@tanstack/react-router";
import { recruitingBoardViewSchema } from "@app/shared/recruiting-board";
import { hrStatisticPeriodSchema } from "@app/shared/recruiting-hr-statistics";
import { jobRecruitingStatusSchema } from "@app/db-schema/job-recruiting-status";
import { z } from "zod";
import { RecruitingWorkspacePage } from "@/components/features/studio/recruiting-ledger/recruiting-workspace-page";
import { recruitingWorkspaceViewSchema } from "@/components/features/studio/recruiting-ledger/recruiting-workspace-view";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

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
  hrPeriod: hrStatisticPeriodSchema.default("week"),
  hrFrom: z.iso.date().optional(),
  hrTo: z.iso.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  recommendationLevel: multiValueSearchParamSchema,
  recruitingStatus: recruitingStatusSearchParamSchema,
  responsibleHrId: multiValueSearchParamSchema,
  search: z.string().optional(),
  sortBy: z.enum(["createdAt", "candidateName", "joiningDate", "updatedAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  stage: recruitingBoardViewSchema.default("all"),
  view: recruitingWorkspaceViewSchema.default("hr"),
});

export const Route = createFileRoute("/w/$slug/studio/recruiting-ledger")({
  validateSearch: recruitingLedgerSearchSchema,
  loader: ({ parentMatchPromise }) =>
    requireStudioPagePermission(parentMatchPromise, ["recruitingLedger", "dashboard"]),
  head: () => ({ meta: [{ title: formatDocumentTitle("招聘台账") }] }),
  component: RecruitingWorkspacePage,
  pendingComponent: () => (
    <StudioTablePageSkeleton columnCount={12} filterCount={5} label="招聘台账" />
  ),
  shouldReload: false,
});
