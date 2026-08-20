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
  "resumes",
  "resumePool",
  "interviews",
  "dashboard",
  "departments",
  "interviewers",
  "jobDescriptions",
  "forms",
  "interviewQuestions",
  "me",
  "members",
  "mailIngestAccounts",
  "permissions",
  "globalConfig",
] as const;

export const STUDIO_PAGE_PERMISSION_LABELS = {
  dashboard: "数据看板",
  departments: "部门管理",
  forms: "表单题",
  globalConfig: "上下文设置",
  interviewQuestions: "沟通题",
  interviewers: "AI面试官管理",
  interviews: "AI 面试",
  jobDescriptions: "岗位设置",
  mailIngestAccounts: "邮箱监听",
  me: "个人中心",
  members: "工作区管理",
  permissions: "权限管理",
  resumePool: "人才库",
  resumes: "招聘",
} as const;

const memberStudioPagePermissions = [
  "resumes",
  "resumePool",
  "interviews",
  "departments",
  "interviewers",
  "jobDescriptions",
  "forms",
  "interviewQuestions",
  "me",
  "members",
] as const;

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
  mailIngestAccount: ["create", "read", "update", "delete", "manage"],
  offer: ["create", "read", "update", "delete"],
  page: STUDIO_PAGE_PERMISSION_ACTIONS,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const NO_ACCESS_WORKSPACE_ROLE = "noAccess";

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
  mailIngestAccount: ["create", "read", "update", "delete", "manage"],
  offer: ["create", "read", "update", "delete"],
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
  // `organizationHooks.beforeUpdateMemberRole`（见 src/lib/server/auth.ts），
  // 校验内容：(1) admin 不能改 admin/owner 角色；(2) admin 不能改自己；
  // (3) admin 给出的新角色必须是 recruitingSupervisor / recruitingLead / hr / viewer。
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
  mailIngestAccount: ["create", "read", "update", "delete", "manage"],
  member: ["create", "update", "delete"],
  offer: ["create", "read", "update", "delete"],
  page: STUDIO_PAGE_PERMISSION_ACTIONS,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
});

const recruitingMemberStatements = {
  ...memberAc.statements,
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
  page: memberStudioPagePermissions,
  questionTemplate: ["create", "read", "update", "delete"],
  resumeEmailIngest: ["create", "read", "update", "delete"],
  resumeLibrary: ["create", "read", "update", "delete"],
  resumePool: ["create", "read", "publish", "import", "delete"],
  resumeUploadBatch: ["create", "read", "process", "cancel", "delete"],
} as const;

export const member = ac.newRole(recruitingMemberStatements);
export const noAccess = ac.newRole({
  page: [],
});

export const roles = { admin, member, noAccess, owner } as const;
export type AppRole = keyof typeof roles;
