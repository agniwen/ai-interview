import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { WorkspacePermissionsSection } from "@/components/features/studio/members/workspace-permissions-section";

function StudioPermissionsRoute() {
  return (
    <div className="container mx-auto max-w-7xl flex flex-col gap-6">
      <PageHeader
        description="配置工作区自定义角色，并为角色分配可访问和操作的业务模块。"
        title="权限管理"
      />
      <WorkspacePermissionsSection />
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/permissions")({
  component: StudioPermissionsRoute,
  head: () => ({
    meta: [{ title: "权限管理" }],
  }),
});
