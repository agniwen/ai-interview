import { createFileRoute } from "@tanstack/react-router";

import { MembersManagementPage } from "@/components/features/studio/members/members-page";
import { coerceWorkspaceManagementSearch } from "@/components/features/studio/members/workspace-management-search";
import { MembersPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/members")({
  loader: ({ parentMatchPromise }) => requireStudioPagePermission(parentMatchPromise, "members"),
  validateSearch: (search) => coerceWorkspaceManagementSearch(coerceSearchParams(search)),
  head: () => ({
    meta: [{ title: formatDocumentTitle("工作区管理") }],
  }),
  component: MembersManagementPage,
  pendingComponent: MembersPageSkeleton,
});
