import type { WorkspacePermissionStatements } from "@app/shared/permission-statements";

export interface SessionUser {
  email: string;
  id: string;
  image?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface SessionOrganization {
  id: string;
  logo: string | null;
  name: string;
  slug: string;
}

export interface SessionMembership {
  organizationId: string;
  role: string;
}

export interface WaitingWorkspace extends SessionMembership, SessionOrganization {}

export interface SessionStateDependencies {
  computePermissionSnapshot: (input: {
    memberRole: string;
    organizationId: string;
    userId: string;
  }) => Promise<WorkspacePermissionStatements>;
  listMemberships: (userId: string) => Promise<SessionMembership[]>;
  listOrganizations: (headers: Headers) => Promise<SessionOrganization[]>;
  listWaitingWorkspaces: (userId: string) => Promise<WaitingWorkspace[]>;
  loadLastActiveOrganizationId: (userId: string) => Promise<string | null>;
  loadMemberRole: (input: { organizationId: string; userId: string }) => Promise<string | null>;
  updateLastActiveOrganizationId: (input: {
    organizationId: string;
    userId: string;
  }) => Promise<void>;
  isNoAccessWorkspaceRole: (role: string | null | undefined) => boolean;
}

export async function resolveActiveOrganizationState(
  user: SessionUser | null,
  headers: Headers,
  dependencies: SessionStateDependencies,
) {
  if (!user) {
    return { status: "unauthenticated" as const };
  }

  const organizationId = await dependencies.loadLastActiveOrganizationId(user.id);
  if (!organizationId) {
    return { status: "no_active_workspace" as const };
  }

  const organizations = await dependencies.listOrganizations(headers);
  const active = organizations.find((organization) => organization.id === organizationId);
  if (!active) {
    return { status: "no_active_workspace" as const };
  }

  const role = await dependencies.loadMemberRole({ organizationId: active.id, userId: user.id });
  if (!role) {
    return { status: "no_active_workspace" as const };
  }

  return {
    member: { role },
    status: "ready" as const,
    workspace: { id: active.id, slug: active.slug },
  };
}

export async function resolveWorkspaceSelectionState(
  user: SessionUser | null,
  headers: Headers,
  dependencies: SessionStateDependencies,
) {
  if (!user) {
    return { status: "unauthenticated" as const };
  }

  const [organizations, memberships] = await Promise.all([
    dependencies.listOrganizations(headers),
    dependencies.listMemberships(user.id),
  ]);
  const roleByOrganizationId = new Map(
    memberships.map((membership) => [membership.organizationId, membership.role] as const),
  );

  return {
    organizations: organizations.map((organization) => ({
      ...organization,
      role: roleByOrganizationId.get(organization.id) ?? "member",
    })),
    status: "ready" as const,
    user: {
      email: user.email,
      image: user.image ?? null,
      name: user.name ?? null,
    },
  };
}

export async function resolveNoAccessWaitState(
  user: SessionUser | null,
  dependencies: SessionStateDependencies,
) {
  if (!user) {
    return { status: "unauthenticated" as const };
  }

  const [organizationId, workspaces] = await Promise.all([
    dependencies.loadLastActiveOrganizationId(user.id),
    dependencies.listWaitingWorkspaces(user.id),
  ]);
  const activeWaitingWorkspace = workspaces.find(
    (workspace) =>
      workspace.organizationId === organizationId &&
      dependencies.isNoAccessWorkspaceRole(workspace.role),
  );
  const waitingWorkspace =
    activeWaitingWorkspace ??
    (workspaces.length > 0 &&
    workspaces.every((workspace) => dependencies.isNoAccessWorkspaceRole(workspace.role))
      ? workspaces[0]
      : null);

  if (!waitingWorkspace) {
    return { status: "not_waiting" as const };
  }

  return {
    status: "waiting" as const,
    user: {
      email: user.email,
      image: user.image ?? null,
      name: user.name ?? null,
    },
    workspace: {
      id: waitingWorkspace.id,
      logo: waitingWorkspace.logo,
      name: waitingWorkspace.name,
      slug: waitingWorkspace.slug,
    },
  };
}

export async function resolveWorkspaceAccessState(
  user: SessionUser | null,
  headers: Headers,
  slug: string,
  dependencies: SessionStateDependencies,
) {
  if (!user) {
    return { status: "unauthenticated" as const };
  }

  const organizations = await dependencies.listOrganizations(headers);
  const matched = organizations.find((organization) => organization.slug === slug);
  if (!matched) {
    return { status: "not_found" as const };
  }

  const role = await dependencies.loadMemberRole({ organizationId: matched.id, userId: user.id });
  if (!role) {
    return { status: "not_found" as const };
  }

  await dependencies.updateLastActiveOrganizationId({
    organizationId: matched.id,
    userId: user.id,
  });
  const permissions = await dependencies.computePermissionSnapshot({
    memberRole: role,
    organizationId: matched.id,
    userId: user.id,
  });

  return {
    member: { role },
    permissions,
    status: "ready" as const,
    user: { id: user.id },
    workspace: { id: matched.id, slug: matched.slug },
  };
}
