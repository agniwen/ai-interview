const WORKSPACE_ROLE_LABELS = {
  admin: "管理员",
  member: "普通成员",
  owner: "拥有者",
} as const;

const WORKSPACE_ROLE_DESCRIPTIONS = {
  admin: "可管理工作区成员、邀请和招聘组；不能调整其他管理员或自己的角色，不能转让工作区。",
  member: "可进入工作区；具体招聘权限由所在招聘组内的角色决定。",
  owner: "拥有完整权限，可调整角色并转让工作区所有权。",
} as const;

export type WorkspaceRole = keyof typeof WORKSPACE_ROLE_LABELS;

export const ASSIGNABLE_ROLES = ["admin", "member"] as const satisfies readonly WorkspaceRole[];
export const WORKSPACE_ROLES = [
  "owner",
  ...ASSIGNABLE_ROLES,
] as const satisfies readonly WorkspaceRole[];

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  admin: 2,
  member: 1,
  owner: 3,
};

export function getWorkspaceRoleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_LABELS[role];
}

export function getWorkspaceRoleDescription(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_DESCRIPTIONS[role];
}

export function canAssignWorkspaceRole(
  currentRole: WorkspaceRole | null | undefined,
  targetRole: WorkspaceRole,
): boolean {
  if (!currentRole) {
    return false;
  }
  return WORKSPACE_ROLE_RANK[currentRole] > WORKSPACE_ROLE_RANK[targetRole];
}

export function getAssignableWorkspaceRoles(
  currentRole: WorkspaceRole | null | undefined,
): readonly WorkspaceRole[] {
  return ASSIGNABLE_ROLES.filter((role) => canAssignWorkspaceRole(currentRole, role));
}
