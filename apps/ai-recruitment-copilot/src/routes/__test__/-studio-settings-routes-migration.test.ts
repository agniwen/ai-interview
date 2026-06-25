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
    expect(permissionsRoute).toContain("<WorkspacePermissionsSection />");
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

    expect(source).toContain("PencilIcon");
    expect(source).toContain("CopyIcon");
    expect(source).toContain("Trash2Icon");
    expect(source).toContain("RoleFormDialog");
    expect(source).toContain("AlertDialog");
    expect(source).toContain("nextPermission = togglePermissionAction");
    expect(source).toContain("permissionHeaderGroups");
    expect(source).toContain("rowSpan={2}");
    expect(source).toContain("colSpan={group.items.length}");
    expect(source).toContain("新建角色");
    expect(source).toContain("additionalFields: { name: input.name }");
    expect(source).toContain("name: input.name");
    expect(source).toContain(
      "role: input.role === roleFormState.role.role ? undefined : input.role",
    );
    expect(source).not.toContain("SaveIcon");
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
    expect(source).not.toContain("PencilIcon");
    expect(source).not.toContain("PlusIcon");
    expect(memberCellSource).toContain('avatarSize = "sm"');
  });
});
