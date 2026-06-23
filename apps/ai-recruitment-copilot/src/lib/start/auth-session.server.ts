import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { statement } from "@arc/shared/permissions";
import type {
  ActiveOrganizationState,
  StudioPageAccessState,
  StudioPagePermissionAction,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { organizationRole, recruitingGroupMember, user as userTable } from "@arc/db-schema/schema";
import { roles } from "@arc/shared/permissions";

type PermissionRecord = Record<string, readonly string[] | undefined>;
type Resource = keyof typeof statement;
type Action<R extends Resource> = (typeof statement)[R][number];

const RECRUITING_GROUP_RESOURCES = new Set<Resource>([
  "candidateForm",
  "department",
  "globalConfig",
  "interview",
  "interviewer",
  "jd",
  "resumeLibrary",
  "resumePool",
  "resumeUploadBatch",
  "questionTemplate",
]);

function readPermissionRecord(value: string): PermissionRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as PermissionRecord;
  } catch {
    return {};
  }
}

function groupRoleAllows(role: string, action: string) {
  if (action === "read") {
    return true;
  }
  return role === "hr" || role === "recruitingLead" || role === "recruitingSupervisor";
}

async function hasRecruitingGroupPermission({
  action,
  organizationId,
  userId,
}: {
  action: string;
  organizationId: string;
  userId: string;
}) {
  const rows = await db
    .select({ role: recruitingGroupMember.role })
    .from(recruitingGroupMember)
    .where(
      and(
        eq(recruitingGroupMember.organizationId, organizationId),
        eq(recruitingGroupMember.userId, userId),
      ),
    );
  return rows.some((row) => groupRoleAllows(row.role, action));
}

async function roleCanBrowseStudioPage({
  action,
  organizationId,
  role,
}: {
  action: StudioPagePermissionAction;
  organizationId: string;
  role: string;
}): Promise<boolean> {
  const builtInRole = (roles as Record<string, { statements: PermissionRecord } | undefined>)[role];
  if (builtInRole) {
    return builtInRole.statements.page?.includes(action) ?? false;
  }

  const dynamicRole = await db
    .select({ permission: organizationRole.permission })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)),
    )
    .limit(1);
  const permission = readPermissionRecord(dynamicRole[0]?.permission ?? "{}");
  return permission.page?.includes(action) ?? false;
}

export async function workspaceAccessHasPermission<R extends Resource>({
  access,
  action,
  resource,
}: {
  access: Extract<WorkspaceAccessState, { status: "ready" }>;
  resource: R;
  action: Action<R>;
}): Promise<boolean> {
  if (access.member.role === "member" && RECRUITING_GROUP_RESOURCES.has(resource)) {
    return await hasRecruitingGroupPermission({
      action,
      organizationId: access.workspace.id,
      userId: access.user.id,
    });
  }

  const requestHeaders = getRequestHeaders();
  const result = await auth.api.hasPermission({
    body: {
      permissions: { [resource]: [action] } as Record<string, string[]>,
    },
    headers: requestHeaders,
  });
  return result.success;
}

export async function getActiveOrganizationStateFromRequest(): Promise<ActiveOrganizationState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const activeId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (!activeId) {
    return { status: "no_active_workspace" };
  }

  const active = organizations.find((organization) => organization.id === activeId);
  if (!active) {
    return { status: "no_active_workspace" };
  }

  return {
    status: "ready",
    workspace: {
      id: active.id,
      slug: active.slug,
    },
  };
}

export async function getWorkspaceSelectionStateFromRequest(): Promise<WorkspaceSelectionState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });

  return {
    organizations: organizations.map((organization) => ({
      id: organization.id,
      logo: organization.logo ?? null,
      name: organization.name,
      slug: organization.slug,
    })),
    status: "ready",
    user: {
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
    },
  };
}

async function resolveWorkspaceAccess(
  requestHeaders: Headers,
  slug: string,
): Promise<WorkspaceAccessState> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const matched = organizations.find((organization) => organization.slug === slug);
  if (!matched) {
    return { status: "not_found" };
  }

  const activeOrgId = (session.session as { activeOrganizationId?: string | null } | null)
    ?.activeOrganizationId;
  if (activeOrgId !== matched.id) {
    await auth.api.setActiveOrganization({
      body: { organizationId: matched.id },
      headers: requestHeaders,
    });
  }

  const currentMember = await db.query.member.findFirst({
    columns: { role: true },
    where: { organizationId: matched.id, userId: session.user.id },
  });
  if (!currentMember) {
    return { status: "not_found" };
  }

  await db
    .update(userTable)
    .set({ lastActiveOrganizationId: matched.id })
    .where(
      and(
        eq(userTable.id, session.user.id),
        or(
          isNull(userTable.lastActiveOrganizationId),
          ne(userTable.lastActiveOrganizationId, matched.id),
        ),
      ),
    );

  return {
    member: {
      role: currentMember.role,
    },
    status: "ready",
    user: {
      id: session.user.id,
    },
    workspace: {
      id: matched.id,
      slug: matched.slug,
    },
  };
}

export async function resolveWorkspaceAccessFromRequest(
  slug: string,
): Promise<WorkspaceAccessState> {
  return await resolveWorkspaceAccess(getRequestHeaders(), slug);
}

export async function resolveStudioPageAccessFromRequest(
  slug: string,
  action: StudioPagePermissionAction,
): Promise<StudioPageAccessState> {
  const state = await resolveWorkspaceAccess(getRequestHeaders(), slug);
  if (state.status !== "ready") {
    return state;
  }

  return {
    ...state,
    allowed: await roleCanBrowseStudioPage({
      action,
      organizationId: state.workspace.id,
      role: state.member.role,
    }),
  };
}
