import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { WorkspacePermissionsSection } from "@/components/features/studio/members/workspace-permissions-section";

function StudioPermissionsRoute() {
  return (
    <div className="mx-auto w-full max-w-[96rem]">
      <WorkspacePermissionsSection
        headerRender={({ actionRender }) => (
          <PageHeader
            actionRender={actionRender}
            description="配置工作区自定义角色，并为角色分配可访问和操作的业务模块。"
            title="权限管理"
          />
        )}
      />
    </div>
  );
}

export const Route = createFileRoute("/w/$slug/studio/permissions")({
  component: StudioPermissionsRoute,
  head: () => ({
    meta: [{ title: "权限管理" }],
  }),
});
