import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio settings and detail route migration", () => {
  const routes = [
    "/w/$slug/studio/interview-questions",
    "/w/$slug/studio/global-config",
    "/w/$slug/studio/agent-debug",
    "/w/$slug/studio/permissions",
    "/w/$slug/studio/members",
    "/w/$slug/studio/me",
    "/w/$slug/studio/mail-ingest-accounts",
    "/w/$slug/studio/interviews/$roundId",
  ];

  it("registers migrated studio settings and detail routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated route files and reused components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.studio.interview-questions.tsx"),
      readSource("routes/w.$slug.studio.global-config.tsx"),
      readSource("routes/w.$slug.studio.agent-debug.tsx"),
      readSource("routes/w.$slug.studio.permissions.tsx"),
      readSource("routes/w.$slug.studio.members.tsx"),
      readSource("routes/w.$slug.studio.me.tsx"),
      readSource("routes/w.$slug.studio.mail-ingest-accounts.tsx"),
      readSource("routes/w.$slug.studio.interviews.$roundId.tsx"),
      readSource("components/features/studio/global-config/global-config-form.tsx"),
      readSource("components/features/studio/members/workspace-permissions-section.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("exposes workspace permission management as a system configuration page", () => {
    const sidebar = readSource("components/features/studio/studio-sidebar-slots.tsx");
    const permissionsRoute = readSource("routes/w.$slug.studio.permissions.tsx");
    const globalConfigForm = readSource(
      "components/features/studio/global-config/global-config-form.tsx",
    );

    expect(sidebar).toContain('path: "/studio/permissions"');
    expect(sidebar).toContain('title: "权限管理"');
    expect(sidebar).toContain('action: "permissions"');
    expect(sidebar).toContain('resource: "page"');
    expect(permissionsRoute).toContain("<WorkspacePermissionsSection");
    expect(permissionsRoute).toContain("headerRender");
    expect(globalConfigForm).not.toContain("<WorkspacePermissionsSection />");
  });

  it("exposes agent debug as an administrator-only system configuration page", () => {
    const sidebar = readSource("components/features/studio/studio-sidebar-slots.tsx");
    const globalConfigForm = readSource(
      "components/features/studio/global-config/global-config-form.tsx",
    );
    const agentDebugRoute = readSource("routes/w.$slug.studio.agent-debug.tsx");

    expect(sidebar).toContain('path: "/studio/agent-debug"');
    expect(sidebar).toContain('title: "Agent 调试"');
    expect(sidebar).toContain('action: "agentDebug"');
    expect(sidebar).toContain("adminOnly: true");
    expect(globalConfigForm).not.toContain("简历解析测试");
    expect(agentDebugRoute).toContain("requireStudioAdminAccess");
    expect(agentDebugRoute).toContain('action: "agentDebug"');
    expect(agentDebugRoute).toContain("JsonEditor");
    expect(agentDebugRoute).toContain("/studio/agent-debug/resume-parser-test");
    expect(agentDebugRoute).toContain('<section className="flex flex-col gap-4">');
    expect(agentDebugRoute).not.toContain("@/components/ui/card");
    expect(agentDebugRoute).not.toContain("<Card");
    expect(agentDebugRoute).not.toContain("简历解析");
    expect(agentDebugRoute).not.toContain("仅用于调试当前解析链路");
    expect(agentDebugRoute).not.toContain("当前上传文件的解析结果");
  });

  it("keeps system settings as a bare form with the save action in the page header", () => {
    const source = readSource("components/features/studio/global-config/global-config-form.tsx");

    expect(source).toContain("actionRender={");
    expect(source).toContain("保存配置");
    expect(source).toContain('<FieldGroup className="gap-5">');
    expect(source).not.toContain("@/components/ui/card");
    expect(source).not.toContain("<Card");
    expect(source).not.toContain("<CardHeader");
    expect(source).not.toContain("<CardContent");
    expect(source).not.toContain("Agent 全局指令");
    expect(source).not.toContain("配置面试话术和公司背景");
  });

  it("keeps system settings as the last item in the system configuration group", () => {
    const sidebar = readSource("components/features/studio/studio-sidebar-slots.tsx");
    const systemGroupStart = sidebar.indexOf('label: "系统配置"');
    const systemGroupSource = sidebar.slice(
      sidebar.lastIndexOf("items:", systemGroupStart),
      systemGroupStart,
    );
    const permissionIndex = systemGroupSource.indexOf('title: "权限管理"');
    const settingsIndex = systemGroupSource.indexOf('title: "系统设置"');

    expect(permissionIndex).toBeGreaterThanOrEqual(0);
    expect(settingsIndex).toBeGreaterThan(permissionIndex);
  });

  it("hides studio sidebar groups after permissions remove all menu items", () => {
    const sidebar = readSource("components/features/studio/studio-sidebar-slots.tsx");
    const sidebarGroup = readSource("components/ui/sidebar.tsx");

    expect(sidebar).toContain('className="hidden has-[[data-sidebar=menu-item]]:flex"');
    expect(sidebarGroup).not.toContain("has-[[data-sidebar=menu-item]]:flex");
  });

  it("guards direct studio page access with page permissions", () => {
    const studioRoute = readSource("routes/w.$slug.studio.tsx");
    const authSession = readSource("lib/start/auth-session.ts");
    const authSessionServer = readSource("lib/start/auth-session.server.ts");

    expect(studioRoute).toContain("getStudioPageAccessState");
    expect(studioRoute).toContain("findFirstAllowedStudioPath");
    expect(studioRoute).toContain('action: "dashboard"');
    expect(studioRoute).toContain('path: "/resumes"');
    expect(studioRoute).toMatch(/if \(!state\.allowed\) \{\s+throw notFound\(\);\s+\}/u);
    expect(studioRoute).not.toMatch(
      /if \(!state\.allowed\) \{\s+const fallbackPath = await findFirstAllowedStudioPath/u,
    );
    expect(authSession).toContain("getStudioPageAccessState");
    expect(authSessionServer).toContain("resolveStudioPageAccessFromRequest");
    expect(authSessionServer).toContain("organizationRole.permission");
  });

  it("guards studio prefetch loaders with matching page permissions", () => {
    const pageAccess = readSource("lib/start/studio/page-access.ts");
    const pages = [
      ["dashboard", "dashboard"],
      ["departments", "departments"],
      ["forms", "forms"],
      ["global-config", "globalConfig"],
      ["interview-questions", "interviewQuestions"],
      ["interviewers", "interviewers"],
      ["interviews", "interviews"],
      ["job-descriptions", "jobDescriptions"],
      ["resumes", "resumes"],
    ] as const;

    expect(pageAccess).toContain("getStudioPageAccessState");
    expect(pageAccess).toContain("throw notFound()");

    for (const [file, action] of pages) {
      const source = readSource(`routes/w.$slug.studio.${file}.tsx`);
      const guardIndex = source.indexOf(`action: "${action}"`);
      const prefetchIndex = source.search(/await loadStudio[A-Za-z]+State\(/u);

      expect(source).toContain("requireStudioPageAccess");
      expect(guardIndex).toBeGreaterThanOrEqual(0);
      expect(prefetchIndex).toBeGreaterThan(guardIndex);
    }
  });

  it("keeps workspace permission role actions compact in the role column", () => {
    const source = readSource(
      "components/features/studio/members/workspace-permissions-section.tsx",
    );
    const routeSource = readSource("routes/w.$slug.studio.permissions.tsx");
    const pageHeaderSource = readSource("components/features/studio/page-header.tsx");

    expect(source).toContain("IconPencil");
    expect(source).toContain("IconCopy");
    expect(source).toContain("IconTrash");
    expect(source).toContain("RoleFormDialog");
    expect(source).toContain("AlertDialog");
    expect(source).toContain("nextPermission = togglePermissionAction");
    expect(source).toContain("permissionHeaderGroups");
    expect(source).toContain("rowSpan={2}");
    expect(source).toContain("colSpan={group.items.length}");
    expect(source).toContain("新建角色");
    expect(source).toContain('<section className="flex flex-col gap-4">');
    expect(source).not.toContain("角色权限表");
    expect(source).not.toContain("每一行是工作区角色");
    expect(source).toContain("headerRender?.({ actionRender: createRoleAction })");
    expect(routeSource).toContain("headerRender={({ actionRender }) =>");
    expect(routeSource).toContain("actionRender={actionRender}");
    expect(pageHeaderSource).toContain("actionRender?: ReactNode;");
    expect(pageHeaderSource).toContain("{actionRender ? <div");
    expect(source).toContain("additionalFields: { name: input.name }");
    expect(source).toContain("name: input.name");
    expect(source).toContain(
      "role: input.role === roleFormState.role.role ? undefined : input.role",
    );
    expect(source).not.toContain("@/components/ui/card");
    expect(source).not.toContain("<Card");
    expect(source).not.toContain("<CardHeader");
    expect(source).not.toContain("<CardContent");
    expect(source).not.toContain("IconDeviceFloppy");
    expect(source).not.toContain('title="保存权限"');
    expect(source).not.toContain("showStatusText");
    expect(source).not.toContain("内置允许");
    expect(source).not.toContain("未授权");
    expect(source).not.toContain("sticky right-0");
    expect(source).not.toContain(">操作<");
  });

  it("keeps the mail ingest account table aligned with shared table conventions", () => {
    const source = readSource("routes/w.$slug.studio.mail-ingest-accounts.tsx");
    const memberCellSource = readSource("components/data-grid/cells/member-cell.tsx");

    expect(source).toContain(
      'import { MemberCell } from "@/components/data-grid/cells/member-cell"',
    );
    expect(source).toContain("<MemberCell");
    expect(source).toContain("useDataGridState<ManagedMailIngestRow");
    expect(source).toContain("<DataGrid<ManagedMailIngestRow>");
    expect(source).toContain('type: "search"');
    expect(source).toContain('columnPinning={{ right: ["actions"] }}');
    expect(source).not.toContain("<Table>");
    expect(source).not.toContain("function getInitials");
    expect(source).not.toContain("IconPencil");
    expect(source).not.toContain("IconPlus");
    expect(memberCellSource).toContain('avatarSize = "sm"');
  });

  it("splits mail ingest account role and status into separate columns", () => {
    const source = readSource("routes/w.$slug.studio.mail-ingest-accounts.tsx");
    const roleColumnSource = source.slice(
      source.indexOf('key: "role"'),
      source.indexOf('key: "status"'),
    );
    const statusColumnSource = source.slice(
      source.indexOf('key: "status"'),
      source.indexOf('key: "imapHost"'),
    );

    expect(source).toContain("authClient.organization.listRoles");
    expect(source).toContain("buildWorkspaceRoleOptions");
    expect(roleColumnSource).toContain('title: "角色"');
    expect(source).toContain("roleLabelByValue.get(row.user.role) ?? row.user.role");
    expect(statusColumnSource).toContain('title: "状态"');
    expect(source).toContain('let statusLabel = "未配置";');
    expect(source).toContain('statusLabel = "启用";');
    expect(source).toContain('statusLabel = "停用";');
    expect(statusColumnSource).not.toContain("roleLabelByValue");
  });
});
