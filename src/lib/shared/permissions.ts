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

export const statement = {
  ...defaultStatements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

export const owner = ac.newRole({
  ...ownerAc.statements,
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
});

export const admin = ac.newRole({
  ...adminAc.statements,
  // admin 与 owner 业务能力一致；workspace delete / transferOwnership 由 better-auth
  // organization 插件内置只许 owner，admin 拿不到。
  // member.update (改成员角色) 从 admin 拿走,只留给 owner——避免 admin 互相提权。
  // invite (create) / 移除 (delete) / 读 (read) 保留,admin 仍能日常维护成员名单。
  auditLog: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  interview: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  member: ["create", "read", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
});

export const hr = ac.newRole({
  ...memberAc.statements,
  candidateForm: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  department: ["read"],
  globalConfig: ["read"],
  interview: ["create", "read", "update"],
  interviewer: ["read"],
  jd: ["create", "read", "update"],
  questionTemplate: ["create", "read", "update", "delete"],
});

export const viewer = ac.newRole({
  ...memberAc.statements,
  candidateForm: ["read"],
  chat: ["create", "read", "update", "delete"],
  department: ["read"],
  globalConfig: ["read"],
  interview: ["read"],
  interviewer: ["read"],
  jd: ["read"],
  questionTemplate: ["read"],
});

export const roles = { admin, hr, owner, viewer } as const;
export type AppRole = keyof typeof roles;
