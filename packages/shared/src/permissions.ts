// src/lib/shared/permissions.ts
//
// 多租户权限矩阵的唯一真相源。
// 服务端 (auth.ts) 与客户端 (auth-client.ts) 共享同一份 statement + ac + roles。
// shared 位置而非 server-only：本文件无 node:* 依赖，纯类型 + 配置。
//
// Single source of truth for the multi-tenant permission matrix.
// Server (auth.ts) and client (auth-client.ts) both import the same statement,
// ac, and roles. Lives under shared/ because it has no node:* imports.

import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const STUDIO_PAGE_PERMISSION_ACTIONS = [
  "offerApprovals",
  "resumes",
  "resumePool",
  "interviews",
  "calendar",
  "dashboard",
  "recruitingLedger",
  "interviewers",
  "jobDescriptions",
  "questionBank",
  "me",
  "members",
  "permissions",
  "offerApprovalTemplates",
  "globalConfig",
] as const;

export const STUDIO_PAGE_PERMISSION_LABELS = {
  calendar: "面试管理",
  dashboard: "数据看板",
  globalConfig: "上下文设置",
  interviewers: "面试官 Agent 管理",
  interviews: "AI 初面",
  jobDescriptions: "岗位设置",
  me: "个人中心",
  members: "工作区管理",
  offerApprovalTemplates: "审批流配置",
  offerApprovals: "审批",
  permissions: "权限管理",
  questionBank: "面试题配置",
  recruitingLedger: "招聘台账",
  resumePool: "人才库",
  resumes: "招聘",
} as const;

// 招聘主管：日常招聘 + 配置维护 + 数据看板，只读查看工作区成员与汇报线。
const recruitingSupervisorStudioPagePermissions = [
  "offerApprovals",
  "resumes",
  "resumePool",
  "interviews",
  "calendar",
  "dashboard",
  "recruitingLedger",
  "interviewers",
  "jobDescriptions",
  "questionBank",
  "me",
  "members",
] as const;

// 招聘专员（内置标识仍为 `member`）：日常招聘与配置维护，不含数据看板和工作区管理。
const recruitingSpecialistStudioPagePermissions = [
  "offerApprovals",
  "resumes",
  "resumePool",
  "interviews",
  "calendar",
  "recruitingLedger",
  "interviewers",
  "jobDescriptions",
  "questionBank",
  "me",
] as const;

// 面试官：只通过面试管理查看分派给自己的面试，经面试官邀请链接查看材料并提交评价。
const interviewerStudioPagePermissions = ["calendar", "me"] as const;

export const statement = {
  ...defaultStatements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  humanInterview: ["create", "read", "update", "delete"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
  offerApproval: ["create", "read", "decide", "manage"],
  page: STUDIO_PAGE_PERMISSION_ACTIONS,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const NO_ACCESS_WORKSPACE_ROLE = "noAccess";

// 平台管理员为新用户指定初始工作区时可分配的成员角色，与工作区成员页可分配的内置角色一致。
// owner 只能通过 Better Auth 的转让流程产生；各工作区自定义的动态角色不在平台层开放。
// Roles a platform admin may grant in a new user's initial workspace: the same built-in
// roles the workspace members page can assign. Owner only arises via ownership transfer.
export const RECRUITING_SUPERVISOR_WORKSPACE_ROLE = "recruitingSupervisor";
export const INTERVIEWER_WORKSPACE_ROLE = "interviewer";

export const PLATFORM_INITIAL_WORKSPACE_ROLES = [
  "member",
  "admin",
  RECRUITING_SUPERVISOR_WORKSPACE_ROLE,
  INTERVIEWER_WORKSPACE_ROLE,
  NO_ACCESS_WORKSPACE_ROLE,
] as const;
export type PlatformInitialWorkspaceRole = (typeof PLATFORM_INITIAL_WORKSPACE_ROLES)[number];
export const DEFAULT_PLATFORM_INITIAL_WORKSPACE_ROLE =
  "member" satisfies PlatformInitialWorkspaceRole;

export function isWorkspaceAdministratorRole(
  role: string | null | undefined,
): role is "admin" | "owner" {
  return role === "owner" || role === "admin";
}

export const owner = ac.newRole({
  ...ownerAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  humanInterview: ["create", "read", "update", "delete"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
  offerApproval: ["create", "read", "decide", "manage"],
  page: STUDIO_PAGE_PERMISSION_ACTIONS,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  // admin 与 owner 业务能力一致；workspace delete / transferOwnership 由 better-auth
  // organization 插件内置只许 owner，admin 拿不到。
  //
  // member.update：admin 可以调整成员角色，但**仅限设置为非管理角色**。
  // 真正阻止 admin "互相提权 / 自我提权" 的硬约束在服务端 hook
  // `organizationHooks.beforeUpdateMemberRole`（见 apps/server/src/infrastructure/auth.ts），
  // 校验内容：(1) admin 不能改 admin/owner 角色；(2) admin 不能改自己；
  // (3) admin 给出的新角色只能是招聘主管、招聘专员、面试官、待分配或自定义角色。
  // 矩阵这里开放 "update" 动词
  // 只是为了让请求能到达 hook；具体策略由 hook 兜底，矩阵不承担安全边界。
  //
  // Admin gains member.update so the UI/hook code path becomes reachable, but
  // the actual ceiling (non-admin targets only, no self-edit, no peer-admin
  // edits) is enforced server-side in `beforeUpdateMemberRole`. The matrix only
  // authorizes the verb; the hook is the security boundary.
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  humanInterview: ["create", "read", "update", "delete"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  member: ["create", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
  offerApproval: ["create", "read", "decide", "manage"],
  page: STUDIO_PAGE_PERMISSION_ACTIONS,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
});

// 主管与专员共享的招聘工作权限；删除、Offer 审批与数据看板只给主管。
// Shared recruiting work; deletes, offer approval decisions and the dashboard stay with supervisors.
const recruitingSupervisorStatements = {
  ...memberAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read"],
  humanInterview: ["create", "read", "update", "delete"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
  offerApproval: ["create", "read", "decide"],
  page: recruitingSupervisorStudioPagePermissions,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
} as const;

const recruitingSpecialistStatements = {
  ...memberAc.statements,
  candidateForm: ["create", "read", "update"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update"],
  globalConfig: ["read"],
  humanInterview: ["create", "read", "update"],
  interview: ["create", "read", "update"],
  interviewer: ["create", "read", "update"],
  jd: ["create", "read", "update"],
  offer: ["create", "read", "update"],
  offerApproval: ["create", "read"],
  page: recruitingSpecialistStudioPagePermissions,
  questionTemplate: ["create", "read", "update"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update"],
  resumePool: ["create", "read", "publish", "import"],
  resumeUploadBatch: ["create", "read", "process", "cancel"],
} as const;

export const recruitingSupervisor = ac.newRole(recruitingSupervisorStatements);
/** 招聘专员。内置标识保持 `member`，避免迁移已有成员数据。Recruiting specialist; key stays `member`. */
export const member = ac.newRole(recruitingSpecialistStatements);
export const interviewer = ac.newRole({
  page: interviewerStudioPagePermissions,
});
/** 待分配。内置标识保持 `noAccess`。Pending assignment; key stays `noAccess`. */
export const noAccess = ac.newRole({
  page: [],
});

export const roles = {
  admin,
  interviewer,
  member,
  noAccess,
  owner,
  recruitingSupervisor,
} as const;
export type AppRole = keyof typeof roles;
