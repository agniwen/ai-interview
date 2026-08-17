import { createFileRoute } from "@tanstack/react-router";
import { DepartmentManagementPage } from "@/components/features/studio/departments/department-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";

export const Route = createFileRoute("/w/$slug/studio/departments")({
  validateSearch: coerceSearchParams,
  head: () => ({
    meta: [{ title: formatDocumentTitle("部门管理") }],
  }),
  component: DepartmentManagementPage,
  pendingComponent: () => <StudioTablePageSkeleton label="部门管理" />,
  shouldReload: false,
});
