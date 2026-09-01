export const WORKSPACE_AUTHORIZATION_QUERIES = Symbol("WORKSPACE_AUTHORIZATION_QUERIES");

export interface WorkspaceActor {
  id: string;
  email?: string;
  name?: string | null;
}

export interface WorkspaceMemberContext {
  id: string;
  organizationId: string;
  role: string;
  userId: string;
}

export interface WorkspaceOrganizationContext {
  id: string;
  logo: string | null;
  metadata: string | null;
  name: string;
  slug: string;
}

export interface WorkspaceAuthorizationContext {
  actor: WorkspaceActor;
  member: WorkspaceMemberContext;
  workspace: WorkspaceOrganizationContext;
}

export interface WorkspacePermission {
  action: string;
  resource: string;
}

export interface WorkspaceAuthorizationQueries {
  authorize(
    context: WorkspaceAuthorizationContext,
    permission: WorkspacePermission,
  ): Promise<boolean>;
}
