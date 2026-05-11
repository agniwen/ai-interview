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
import { defaultStatements, ownerAc } from "better-auth/plugins/organization/access";

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

// roles map 后续在每个角色加完后整体导出。先放一个临时 partial 以让测试看到。
export const roles = { owner } as const;
export type AppRole = keyof typeof roles;
