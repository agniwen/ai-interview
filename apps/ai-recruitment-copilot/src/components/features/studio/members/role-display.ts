const WORKSPACE_ROLE_LABELS = {
  admin: "管理员",
  member: "普通成员",
  noAccess: "空权限用户",
  owner: "拥有者",
} as const;

const WORKSPACE_ROLE_DESCRIPTIONS = {
  admin: "可管理工作区成员、邀请和招聘组；不能调整其他管理员或自己的角色，不能转让工作区。",
  member: "可进入工作区；具体招聘权限由所在招聘组内的角色决定。",
  noAccess: "暂不能访问系统页面；需要等待管理员分配其他角色。",
  owner: "拥有完整权限，可调整角色并转让工作区所有权。",
} as const;

export type WorkspaceRole = keyof typeof WORKSPACE_ROLE_LABELS;
export type AnyWorkspaceRole = string;
export interface DynamicWorkspaceRoleDisplay {
  name: string;
  role: string;
}

export interface WorkspaceRoleOption {
  description: string;
  label: string;
  value: string;
}

export const ASSIGNABLE_ROLES = [
  "admin",
  "member",
  "noAccess",
] as const satisfies readonly WorkspaceRole[];
export const WORKSPACE_ROLES = [
  "owner",
  ...ASSIGNABLE_ROLES,
] as const satisfies readonly WorkspaceRole[];

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  admin: 2,
  member: 1,
  noAccess: 0,
  owner: 3,
};

export function isBuiltInWorkspaceRole(role: string): role is WorkspaceRole {
  return role in WORKSPACE_ROLE_LABELS;
}

export function getWorkspaceRoleLabel(role: AnyWorkspaceRole): string {
  return isBuiltInWorkspaceRole(role) ? WORKSPACE_ROLE_LABELS[role] : role;
}

export function getWorkspaceRoleDescription(role: AnyWorkspaceRole): string {
  return isBuiltInWorkspaceRole(role)
    ? WORKSPACE_ROLE_DESCRIPTIONS[role]
    : "自定义工作区角色；具体权限由系统设置中的权限管理决定。";
}

export function buildWorkspaceRoleOptions(
  roles: readonly string[],
  dynamicRoles: readonly DynamicWorkspaceRoleDisplay[] = [],
): WorkspaceRoleOption[] {
  const dynamicRoleNameByRole = new Map(dynamicRoles.map((role) => [role.role, role.name]));

  return roles.map((role) => ({
    description: getWorkspaceRoleDescription(role),
    label: isBuiltInWorkspaceRole(role)
      ? getWorkspaceRoleLabel(role)
      : (dynamicRoleNameByRole.get(role) ?? role),
    value: role,
  }));
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
