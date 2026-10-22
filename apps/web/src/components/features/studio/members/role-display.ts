// `member` 显示为招聘专员、`noAccess` 显示为待分配；内置标识不变，避免迁移成员数据。
const WORKSPACE_ROLE_LABELS = {
  admin: "管理员",
  interviewer: "面试官",
  member: "招聘专员",
  noAccess: "待分配",
  owner: "拥有者",
  recruitingSupervisor: "招聘主管",
} as const;

const WORKSPACE_ROLE_DESCRIPTIONS = {
  admin:
    "可管理成员、邀请、汇报线和全部配置，能看到全部招聘数据；不能调整其他管理员或自己的角色，不能转让工作区。",
  interviewer: "只能在面试管理查看分派给自己的面试，通过面试官链接查看候选人材料并提交评价。",
  member:
    "负责日常招聘，可维护岗位、部门、面试官 Agent、沟通题和表单题；不能删除数据，能看到自己和全部下级的招聘数据。",
  noAccess: "暂不能访问系统页面；需要等待管理员分配角色。",
  owner: "拥有完整权限，可调整角色并转让工作区所有权。",
  recruitingSupervisor:
    "在招聘专员基础上可删除数据、审批 Offer、查看数据看板和团队成员，能看到自己和全部下级的招聘数据。",
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
  "recruitingSupervisor",
  "member",
  "interviewer",
  "noAccess",
] as const satisfies readonly WorkspaceRole[];
export const WORKSPACE_ROLES = [
  "owner",
  ...ASSIGNABLE_ROLES,
] as const satisfies readonly WorkspaceRole[];

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
