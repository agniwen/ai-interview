const WORKSPACE_ROLE_LABELS = {
  admin: "管理员",
  hr: "招聘成员",
  owner: "拥有者",
  recruitingLead: "招聘组长",
  recruitingSupervisor: "招聘主管",
  viewer: "只读成员",
} as const;

const WORKSPACE_ROLE_DESCRIPTIONS = {
  admin:
    "可管理业务数据和成员邀请；可将其他成员调整为招聘主管、招聘组长、招聘成员或只读成员，不能调整其他管理员或自己的角色，不能转让工作区。",
  hr: "拥有与管理员一致的业务权限，但不能邀请、移除或调整成员。",
  owner: "拥有完整权限，可调整角色并转让工作区所有权。",
  recruitingLead: "权限与招聘成员一致，可管理业务数据，但不能邀请、移除或调整成员。",
  recruitingSupervisor: "权限与招聘成员一致，可管理业务数据，但不能邀请、移除或调整成员。",
  viewer: "可查看核心业务数据，并可使用聊天助手。",
} as const;

export type WorkspaceRole = keyof typeof WORKSPACE_ROLE_LABELS;

export const ASSIGNABLE_ROLES = [
  "admin",
  "recruitingSupervisor",
  "recruitingLead",
  "hr",
  "viewer",
] as const satisfies readonly WorkspaceRole[];
export const WORKSPACE_ROLES = [
  "owner",
  ...ASSIGNABLE_ROLES,
] as const satisfies readonly WorkspaceRole[];

export function getWorkspaceRoleLabel(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_LABELS[role];
}

export function getWorkspaceRoleDescription(role: WorkspaceRole): string {
  return WORKSPACE_ROLE_DESCRIPTIONS[role];
}
