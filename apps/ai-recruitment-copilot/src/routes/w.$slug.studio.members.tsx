import { createFileRoute } from "@tanstack/react-router";

import { MembersManagementPage } from "@/components/features/studio/members/members-page";
import { coerceWorkspaceManagementSearch } from "@/components/features/studio/members/members-page-model";
import { MembersPageSkeleton } from "@/components/features/studio/studio-page-skeletons";

export const Route = createFileRoute("/w/$slug/studio/members")({
  component: MembersManagementPage,
  head: () => ({
    meta: [{ title: "工作区管理" }],
  }),
  pendingComponent: MembersPageSkeleton,
  validateSearch: (search: Record<string, unknown>) => coerceWorkspaceManagementSearch(search),
});
