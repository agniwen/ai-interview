import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import type {
  ActiveOrganizationState,
  NoAccessWaitState,
  StudioPageAccessState,
  StudioPagePermissionAction,
  WorkspaceAccessState,
  WorkspaceSelectionState,
} from "@/lib/start/auth-session-types";
import { auth } from "@arc/ai-recruitment-copilot-backend/lib/server/auth";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  member as memberTable,
  organization as organizationTable,
  organizationRole,
  user as userTable,
} from "@arc/db-schema/schema";
import { isNoAccessWorkspaceRole } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-roles";
import { createRequestWorkspaceAuthorizer } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";
import type {
  WorkspaceAction,
  WorkspaceResource,
} from "@arc/ai-recruitment-copilot-backend/server/access/workspace-access-policy";
import { roles } from "@arc/shared/permissions";

type PermissionRecord = Record<string, readonly string[] | undefined>;

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

export async function workspaceAccessHasPermission<R extends WorkspaceResource>({
  access,
  action,
  resource,
}: {
  access: Extract<WorkspaceAccessState, { status: "ready" }>;
  resource: R;
  action: WorkspaceAction<R>;
}): Promise<boolean> {
  const requestHeaders = getRequestHeaders();
  const authorize = createRequestWorkspaceAuthorizer({
    headers: requestHeaders,
    memberRole: access.member.role,
    organizationId: access.workspace.id,
    userId: access.user.id,
  });
  return await authorize({ action, resource });
}

export async function getActiveOrganizationStateFromRequest(): Promise<ActiveOrganizationState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const [preference] = await db
    .select({ organizationId: userTable.lastActiveOrganizationId })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  if (!preference?.organizationId) {
    return { status: "no_active_workspace" };
  }

  const organizations = await auth.api.listOrganizations({ headers: requestHeaders });
  const active = organizations.find(
    (organization) => organization.id === preference.organizationId,
  );
  if (!active) {
    return { status: "no_active_workspace" };
  }

  const currentMember = await db.query.member.findFirst({
    columns: { role: true },
    where: { organizationId: active.id, userId: session.user.id },
  });
  if (!currentMember) {
    return { status: "no_active_workspace" };
  }

  return {
    member: {
      role: currentMember.role,
    },
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
  const memberships = await db
    .select({ organizationId: memberTable.organizationId, role: memberTable.role })
    .from(memberTable)
    .where(eq(memberTable.userId, session.user.id));
  const roleByOrganizationId = new Map(
    memberships.map((row) => [row.organizationId, row.role] as const),
  );

  return {
    organizations: organizations.map((organization) => ({
      id: organization.id,
      logo: organization.logo ?? null,
      name: organization.name,
      role: roleByOrganizationId.get(organization.id) ?? "member",
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

export async function getNoAccessWaitStateFromRequest(): Promise<NoAccessWaitState> {
  const requestHeaders = getRequestHeaders();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) {
    return { status: "unauthenticated" };
  }

  const [preference] = await db
    .select({ organizationId: userTable.lastActiveOrganizationId })
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1);
  const rows = await db
    .select({
      logo: organizationTable.logo,
      name: organizationTable.name,
      organizationId: organizationTable.id,
      role: memberTable.role,
      slug: organizationTable.slug,
    })
    .from(memberTable)
    .innerJoin(organizationTable, eq(organizationTable.id, memberTable.organizationId))
    .where(eq(memberTable.userId, session.user.id))
    .orderBy(asc(memberTable.createdAt));

  const activeWaitingWorkspace = rows.find(
    (row) => row.organizationId === preference?.organizationId && isNoAccessWorkspaceRole(row.role),
  );
  const waitingWorkspace =
    activeWaitingWorkspace ??
    (rows.length > 0 && rows.every((row) => isNoAccessWorkspaceRole(row.role)) ? rows[0] : null);

  if (!waitingWorkspace) {
    return { status: "not_waiting" };
  }

  return {
    status: "waiting",
    user: {
      email: session.user.email,
      image: session.user.image,
      name: session.user.name,
    },
    workspace: {
      id: waitingWorkspace.organizationId,
      logo: waitingWorkspace.logo,
      name: waitingWorkspace.name,
      slug: waitingWorkspace.slug,
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
