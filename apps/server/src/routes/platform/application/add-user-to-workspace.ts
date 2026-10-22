import type { PlatformInitialWorkspaceRole } from "@app/shared/permissions";

export type AddUserToWorkspaceFailure =
  | "already_member"
  | "membership_limit_reached"
  | "user_not_found"
  | "workspace_not_found";

export class AddUserToWorkspaceError extends Error {
  readonly reason: AddUserToWorkspaceFailure;

  constructor(reason: AddUserToWorkspaceFailure) {
    super(`Cannot add user to workspace: ${reason}`);
    this.name = "AddUserToWorkspaceError";
    this.reason = reason;
  }
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
}

export interface AddUserToWorkspaceDependencies {
  /** 通过 Better Auth 加入成员；冲突时抛出 AddUserToWorkspaceError。Adds via Better Auth. */
  addMember: (input: {
    organizationId: string;
    role: PlatformInitialWorkspaceRole;
    userId: string;
  }) => Promise<void>;
  findWorkspace: (organizationId: string) => Promise<WorkspaceSummary | null>;
  isWorkspaceMember: (input: { organizationId: string; userId: string }) => Promise<boolean>;
  userExists: (userId: string) => Promise<boolean>;
}

export interface AddUserToWorkspaceInput {
  organizationId: string;
  role: PlatformInitialWorkspaceRole;
  userId: string;
}

export interface AddUserToWorkspaceResult {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: PlatformInitialWorkspaceRole;
}

export async function addUserToWorkspace(
  input: AddUserToWorkspaceInput,
  dependencies: AddUserToWorkspaceDependencies,
): Promise<AddUserToWorkspaceResult> {
  if (!(await dependencies.userExists(input.userId))) {
    throw new AddUserToWorkspaceError("user_not_found");
  }
  const workspace = await dependencies.findWorkspace(input.organizationId);
  if (!workspace) {
    throw new AddUserToWorkspaceError("workspace_not_found");
  }
  if (
    await dependencies.isWorkspaceMember({ organizationId: workspace.id, userId: input.userId })
  ) {
    throw new AddUserToWorkspaceError("already_member");
  }

  await dependencies.addMember({
    organizationId: workspace.id,
    role: input.role,
    userId: input.userId,
  });

  return {
    organizationId: workspace.id,
    organizationName: workspace.name,
    organizationSlug: workspace.slug,
    role: input.role,
  };
}
