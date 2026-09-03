import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { WorkspacePermissionsSection } from "@/components/features/studio/members/workspace-permissions-section";
import { PermissionsPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";

function StudioPermissionsRoute() {
  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <WorkspacePermissionsSection
        headerRender={({ actionRender }) => (
          <PageHeader actionRender={actionRender} title="权限管理" />
        )}
      />
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/permissions")({
  component: StudioPermissionsRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("权限管理") }],
  }),
  pendingComponent: PermissionsPageSkeleton,
});
