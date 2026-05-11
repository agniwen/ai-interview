# 多租户改造 P0 — 权限基础设施 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Better Auth `organization` 插件接入项目；定义 4 个角色（owner/admin/hr/viewer）的权限矩阵作为单一真相源；新建 organization/member/invitation 三张表 + `session.activeOrganizationId` 列。完成本计划后，应用对外行为完全不变（仍单租户），但权限实体和矩阵已就位。

**Architecture:** 服务端 `src/lib/server/auth.ts` 接入 `organization` 插件并传入 `ac + roles`；客户端 `src/lib/client/auth-client.ts` 接入 `organizationClient` 并传入同一份 `ac + roles`；统一的 statement / roles 定义放在 `src/lib/shared/permissions.ts`，server-only 与 client-only 共享。better-auth CLI 生成的表结构合并进 `src/lib/shared/db/schema.ts`，关系定义补到 `src/lib/shared/db/relations.ts`。

**Tech Stack:** Better Auth `^1.6.10`, Drizzle ORM 1.0-rc, PostgreSQL, Vitest, oxlint, pnpm.

**Spec reference:** `docs/superpowers/specs/2026-05-11-multi-tenant-design.md` §2–§3 + §4.1。本计划仅覆盖 P0；P1（业务表加 organizationId + backfill 迁移）、P2（路由/UI/邀请）、P3（清理）是后续独立 plan。

**Out of scope（本计划不做）：**

- 业务表加 `organizationId`（P1）
- `/w/[slug]/...` 路由重构（P2）
- WorkspaceSwitcher / 邀请 UI / 成员管理页（P2）
- DAO 强制 orgId 参数（P1）
- 历史数据 backfill 到 `org_default`（P1）
- `user.organizationId → feishuTenantKey` 重命名（P1）
- 删除 `canAccessAdmin` / `ADMIN_ORGANIZATION_ID`（P2 同步）

---

## 文件结构

**Create:**

- `src/lib/shared/permissions.ts` — statement、ac、4 个 role 的定义（shared 因为 server+client 都需 import）
- `src/lib/shared/__tests__/permissions.test.ts` — 权限矩阵单元测试

**Modify:**

- `src/lib/server/auth.ts` — 加入 `organization` 插件，传 ac + roles
- `src/lib/client/auth-client.ts` — 加入 `organizationClient`，传同一份 ac + roles
- `src/lib/shared/db/schema.ts` — 增加 `organization` / `member` / `invitation` 三张表 + `session.activeOrganizationId` 列
- `src/lib/shared/db/relations.ts` — 补 organization → member → user 等关系

**Auto-generated:**

- `drizzle/<timestamp>_add_organization_plugin.sql` — drizzle-kit 生成的 DDL（人工 review 后入库）

---

## Task 1 — 切分支 + baseline 验证

**Files:** 无变更（仅做环境检查）

- [ ] **Step 1: 切到 next 之外的工作分支**

Run:

```
git checkout -b feat/multi-tenant-p0-foundation
```

Expected: 切到新分支，工作树干净。

- [ ] **Step 2: 跑基线测试和类型检查**

Run:

```
pnpm typecheck && pnpm test && pnpm check
```

Expected: 全部通过。如有任何一项失败，先修主干，本计划不允许带病开工。

- [ ] **Step 3: 确认 better-auth 版本能用 organization 插件**

Run:

```
pnpm why better-auth
```

Expected: `better-auth@^1.6.10`（任何 ≥1.6 都可），子路径 `better-auth/plugins/organization` 与 `better-auth/plugins/access` 可解析。

如果 better-auth < 1.6，先 `pnpm up better-auth@latest` 单独提交，再继续。

---

## Task 2 — 建 permissions.ts 骨架（statement only，无 role）

**Files:**

- Create: `src/lib/shared/permissions.ts`

- [ ] **Step 1: 写文件**

```ts
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
  interview: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  candidateForm: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  auditLog: ["read"],
} as const;

export const ac = createAccessControl(statement);

// 角色将在后续 Task 3-6 逐个补齐。先 export 空 roles 占位防止下游 import 失败。
export const roles = {} as Record<string, ReturnType<typeof ac.newRole>>;
export type AppRole = keyof typeof roles;
```

- [ ] **Step 2: 跑 typecheck 验证 imports 解析正确**

Run:

```
pnpm typecheck
```

Expected: PASS（statement 类型推导出常量化的 resource × action 联合类型）。如果报 `Cannot find module 'better-auth/plugins/access'`，回到 Task 1 Step 3 升级 better-auth。

- [ ] **Step 3: Commit**

```
git add src/lib/shared/permissions.ts
git commit -m "feat(permissions): scaffold multi-tenant access-control statement"
```

---

## Task 3 — 加 owner 角色 + 单测

**Files:**

- Modify: `src/lib/shared/permissions.ts`
- Create: `src/lib/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: 先写失败测试**

Create `src/lib/shared/__tests__/permissions.test.ts`:

```ts
// src/lib/shared/__tests__/permissions.test.ts
//
// 权限矩阵的表驱动测试。每加一个角色就追加测试块，确保矩阵不会被无意改坏。

import { describe, expect, it } from "vitest";
import { roles } from "@/lib/shared/permissions";

describe("permissions matrix", () => {
  describe("owner role", () => {
    it("exists in roles map", () => {
      expect(roles.owner).toBeDefined();
    });

    it("can create/read/update/delete every business resource", () => {
      const owner = roles.owner;
      const resources = [
        "interview",
        "jd",
        "department",
        "interviewer",
        "candidateForm",
        "questionTemplate",
        "chat",
      ] as const;
      for (const r of resources) {
        expect(owner.statements[r]).toEqual(
          expect.arrayContaining(["create", "read", "update", "delete"]),
        );
      }
    });

    it("can update globalConfig and read auditLog", () => {
      const owner = roles.owner;
      expect(owner.statements.globalConfig).toEqual(expect.arrayContaining(["read", "update"]));
      expect(owner.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
    });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: FAIL — `roles.owner is undefined`。

- [ ] **Step 3: 在 permissions.ts 里加 owner**

Edit `src/lib/shared/permissions.ts`，把文件末尾的 `roles` 占位替换为：

```ts
export const owner = ac.newRole({
  ...ownerAc.statements,
  interview: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  candidateForm: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  auditLog: ["read"],
});

// roles map 后续在每个角色加完后整体导出。先放一个临时 partial 以让测试看到。
export const roles = { owner } as const;
export type AppRole = keyof typeof roles;
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: PASS — owner 三个 case 全绿。

- [ ] **Step 5: Commit**

```
git add src/lib/shared/permissions.ts src/lib/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add owner role with full business resource access"
```

---

## Task 4 — 加 admin 角色 + 单测

**Files:**

- Modify: `src/lib/shared/permissions.ts`
- Modify: `src/lib/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `permissions.test.ts` 末尾、`describe("permissions matrix"` 内追加：

```ts
describe("admin role", () => {
  it("exists", () => {
    expect(roles.admin).toBeDefined();
  });

  it("can write all business resources like owner", () => {
    const admin = roles.admin;
    const resources = [
      "interview",
      "jd",
      "department",
      "interviewer",
      "candidateForm",
      "questionTemplate",
      "chat",
    ] as const;
    for (const r of resources) {
      expect(admin.statements[r]).toEqual(
        expect.arrayContaining(["create", "read", "update", "delete"]),
      );
    }
  });

  it("can update globalConfig and read auditLog", () => {
    expect(roles.admin.statements.globalConfig).toEqual(expect.arrayContaining(["read", "update"]));
    expect(roles.admin.statements.auditLog).toEqual(expect.arrayContaining(["read"]));
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: FAIL — `roles.admin is undefined`。

- [ ] **Step 3: 在 permissions.ts 里加 admin**

在 `permissions.ts` 中 `export const owner` 后追加：

```ts
export const admin = ac.newRole({
  ...adminAc.statements,
  // admin 与 owner 业务能力一致；workspace delete / transferOwnership 由 better-auth
  // organization 插件内置只许 owner，admin 拿不到。
  interview: ["create", "read", "update", "delete"],
  jd: ["create", "read", "update", "delete"],
  department: ["create", "read", "update", "delete"],
  interviewer: ["create", "read", "update", "delete"],
  candidateForm: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  globalConfig: ["read", "update"],
  auditLog: ["read"],
});
```

然后把文件末尾 roles 改为：

```ts
export const roles = { owner, admin } as const;
export type AppRole = keyof typeof roles;
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```
git add src/lib/shared/permissions.ts src/lib/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add admin role"
```

---

## Task 5 — 加 hr 角色 + 单测

**Files:**

- Modify: `src/lib/shared/permissions.ts`
- Modify: `src/lib/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `permissions.test.ts` 末尾追加：

```ts
describe("hr role", () => {
  it("exists", () => {
    expect(roles.hr).toBeDefined();
  });

  it("can create+update interview/jd but not delete", () => {
    const hr = roles.hr;
    expect(hr.statements.interview).toEqual(expect.arrayContaining(["create", "read", "update"]));
    expect(hr.statements.interview).not.toContain("delete");
    expect(hr.statements.jd).toEqual(expect.arrayContaining(["create", "read", "update"]));
    expect(hr.statements.jd).not.toContain("delete");
  });

  it("can fully manage candidateForm and questionTemplate", () => {
    const hr = roles.hr;
    expect(hr.statements.candidateForm).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
    expect(hr.statements.questionTemplate).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("can only read department/interviewer/globalConfig, no write", () => {
    const hr = roles.hr;
    expect(hr.statements.department).toEqual(["read"]);
    expect(hr.statements.interviewer).toEqual(["read"]);
    expect(hr.statements.globalConfig).toEqual(["read"]);
  });

  it("has full chat CRUD", () => {
    expect(roles.hr.statements.chat).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("has no auditLog access", () => {
    expect(roles.hr.statements.auditLog).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: FAIL — `roles.hr is undefined`。

- [ ] **Step 3: 在 permissions.ts 里加 hr**

在 `permissions.ts` 中 `export const admin` 后追加：

```ts
export const hr = ac.newRole({
  ...memberAc.statements,
  interview: ["create", "read", "update"],
  jd: ["create", "read", "update"],
  department: ["read"],
  interviewer: ["read"],
  candidateForm: ["create", "read", "update", "delete"],
  questionTemplate: ["create", "read", "update", "delete"],
  chat: ["create", "read", "update", "delete"],
  globalConfig: ["read"],
});
```

更新 roles 导出：

```ts
export const roles = { owner, admin, hr } as const;
export type AppRole = keyof typeof roles;
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```
git add src/lib/shared/permissions.ts src/lib/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add hr role"
```

---

## Task 6 — 加 viewer 角色 + 单测

**Files:**

- Modify: `src/lib/shared/permissions.ts`
- Modify: `src/lib/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `permissions.test.ts` 末尾追加：

```ts
describe("viewer role", () => {
  it("exists", () => {
    expect(roles.viewer).toBeDefined();
  });

  it("is read-only across business resources", () => {
    const viewer = roles.viewer;
    const readOnly = [
      "interview",
      "jd",
      "department",
      "interviewer",
      "candidateForm",
      "questionTemplate",
    ] as const;
    for (const r of readOnly) {
      expect(viewer.statements[r]).toEqual(["read"]);
    }
  });

  it("still has full chat CRUD", () => {
    expect(roles.viewer.statements.chat).toEqual(
      expect.arrayContaining(["create", "read", "update", "delete"]),
    );
  });

  it("can read globalConfig but not update", () => {
    const viewer = roles.viewer;
    expect(viewer.statements.globalConfig).toEqual(["read"]);
  });

  it("has no auditLog access", () => {
    expect(roles.viewer.statements.auditLog).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: FAIL — `roles.viewer is undefined`。

- [ ] **Step 3: 在 permissions.ts 里加 viewer**

追加：

```ts
export const viewer = ac.newRole({
  ...memberAc.statements,
  interview: ["read"],
  jd: ["read"],
  department: ["read"],
  interviewer: ["read"],
  candidateForm: ["read"],
  questionTemplate: ["read"],
  chat: ["create", "read", "update", "delete"],
  globalConfig: ["read"],
});
```

更新 roles 导出：

```ts
export const roles = { owner, admin, hr, viewer } as const;
export type AppRole = keyof typeof roles;
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: PASS — 全部角色测试通过。

- [ ] **Step 5: Commit**

```
git add src/lib/shared/permissions.ts src/lib/shared/__tests__/permissions.test.ts
git commit -m "feat(permissions): add viewer role + complete 4-role matrix"
```

---

## Task 7 — 表驱动 cross-cut 矩阵测试（防回归）

**Files:**

- Modify: `src/lib/shared/__tests__/permissions.test.ts`

- [ ] **Step 1: 在测试文件末尾追加 cross-cut 表驱动测试**

```ts
describe("permission matrix cross-cut", () => {
  // [role, resource, action, expected]
  // 这张表跟 spec §3.2 1:1 对齐，是回归防线。
  const cases: Array<[keyof typeof roles, string, string, boolean]> = [
    // interview
    ["owner", "interview", "delete", true],
    ["admin", "interview", "delete", true],
    ["hr", "interview", "delete", false],
    ["viewer", "interview", "delete", false],
    ["viewer", "interview", "read", true],
    // jd
    ["hr", "jd", "update", true],
    ["hr", "jd", "delete", false],
    ["viewer", "jd", "update", false],
    // department / interviewer
    ["hr", "department", "create", false],
    ["hr", "interviewer", "update", false],
    ["admin", "department", "delete", true],
    // candidateForm / questionTemplate
    ["hr", "candidateForm", "delete", true],
    ["viewer", "candidateForm", "delete", false],
    ["hr", "questionTemplate", "delete", true],
    // globalConfig
    ["hr", "globalConfig", "update", false],
    ["admin", "globalConfig", "update", true],
    ["viewer", "globalConfig", "read", true],
    // auditLog
    ["owner", "auditLog", "read", true],
    ["admin", "auditLog", "read", true],
    ["hr", "auditLog", "read", false],
    ["viewer", "auditLog", "read", false],
    // chat — 全员可全 CRUD
    ["viewer", "chat", "delete", true],
  ];

  for (const [role, resource, action, expected] of cases) {
    it(`${role} ${expected ? "can" : "cannot"} ${action} ${resource}`, () => {
      const stmts = roles[role].statements as Record<string, readonly string[] | undefined>;
      const allowed = stmts[resource]?.includes(action) ?? false;
      expect(allowed).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: 跑测试确认全通过**

Run:

```
pnpm test -- src/lib/shared/__tests__/permissions.test.ts
```

Expected: PASS — 全部 cross-cut 用例绿。如果某条失败，说明 Task 3-6 的角色定义和 spec §3.2 矩阵不一致；以 spec 为准修正。

- [ ] **Step 3: Commit**

```
git add src/lib/shared/__tests__/permissions.test.ts
git commit -m "test(permissions): add cross-cut matrix regression table"
```

---

## Task 8 — 服务端 auth.ts 接入 organization 插件

**Files:**

- Modify: `src/lib/server/auth.ts`

- [ ] **Step 1: 读现有 auth.ts 末尾的 plugins 数组**

Run:

```
grep -n "plugins:" src/lib/server/auth.ts
```

Expected: 看到 `plugins: [` 的行号（约 222 行附近）。

- [ ] **Step 2: 顶部 imports 加 organization 插件 + permissions**

在 `src/lib/server/auth.ts` 顶部、现有 better-auth 导入下追加：

```ts
import { organization } from "better-auth/plugins/organization";
import { ac, roles } from "@/lib/shared/permissions";
```

- [ ] **Step 3: 在 plugins 数组里追加 organization 插件**

定位到 `plugins: [ admin({...}), genericOAuth({...}) ]` 这段，在数组末尾追加：

```ts
organization({
  ac,
  roles,
  // 第一期还没有发邀请邮件的通道；先 stub 成 console.log + 让 inviter 自己复制
  // 链接。P2 接邮件后替换。
  // No invitation email channel yet; stub to console.log so inviter can copy the
  // link manually. Wire a real channel in P2.
  async sendInvitationEmail({ email, invitation, organization: org }) {
    console.log(
      `[invitation stub] org=${org.name} email=${email} invitationId=${invitation.id}`,
    );
  },
}),
```

最终 plugins 数组形状：

```ts
plugins: [
  admin({ /* 原配置不变 */ }),
  genericOAuth({ /* 原配置不变 */ }),
  organization({
    ac,
    roles,
    async sendInvitationEmail({ email, invitation, organization: org }) {
      console.log(
        `[invitation stub] org=${org.name} email=${email} invitationId=${invitation.id}`,
      );
    },
  }),
],
```

- [ ] **Step 4: 跑 typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS。如果报 `Property 'roles' does not exist on type 'Readonly<...>'`，说明 better-auth 版本不支持自定义 roles map；升级 better-auth 到 ≥1.6.10 后再试。

- [ ] **Step 5: Commit**

```
git add src/lib/server/auth.ts
git commit -m "feat(auth): wire organization plugin with custom ac/roles"
```

---

## Task 9 — 客户端 auth-client.ts 接入 organizationClient

**Files:**

- Modify: `src/lib/client/auth-client.ts`

- [ ] **Step 1: 整体替换文件内容**

把 `src/lib/client/auth-client.ts` 改为：

```ts
import "client-only";

import {
  adminClient,
  genericOAuthClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import type { auth } from "@/lib/server/auth";
import { ac, roles } from "@/lib/shared/permissions";

export const authClient = createAuthClient({
  baseURL:
    typeof window === "undefined"
      ? (process.env.BETTER_AUTH_URL ?? "http://localhost:3000")
      : window.location.origin,
  plugins: [
    adminClient(),
    genericOAuthClient(),
    inferAdditionalFields<typeof auth>(),
    // 客户端用同一份 ac+roles，使 authClient.organization.checkRolePermission
    // 在浏览器里同步本地解析（不发请求）。
    // Client uses the same ac+roles so checkRolePermission resolves locally,
    // no network round trip for UI gating.
    organizationClient({ ac, roles }),
  ],
});
```

- [ ] **Step 2: 跑 typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 3: Commit**

```
git add src/lib/client/auth-client.ts
git commit -m "feat(auth): wire organizationClient with shared ac/roles"
```

---

## Task 10 — 用 better-auth CLI 生成 organization schema + 合并到 shared schema

**Files:**

- Modify: `src/lib/shared/db/schema.ts`
- Modify: `src/lib/shared/db/relations.ts`

- [ ] **Step 1: 跑 CLI 让它打印新增的 drizzle schema**

Run:

```
pnpm dlx @better-auth/cli@latest generate --config ./src/lib/server/auth.ts --output ./tmp-org-schema.ts
```

Expected: 生成 `tmp-org-schema.ts`，里头是 `organization` / `member` / `invitation` 三张表 + 对 `session` 表的修改提示。

如果 CLI 提示无法 import `auth.ts`（next 的 server-only 守卫），可以在临时根目录复制一份 `auth.ts`、把 `import "server-only"` 注释掉，再跑 CLI；CLI 跑完恢复源文件。**别忘恢复 server-only 守卫。**

- [ ] **Step 2: 把三张表追加到 schema.ts**

打开 `src/lib/shared/db/schema.ts`，在 `verification` 表（约 199 行）之后、`studioInterview` 之前插入：

```ts
export const organization = pgTable("organization", {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  id: text("id").primaryKey(),
  logo: text("logo"),
  metadata: text("metadata"),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const member = pgTable(
  "member",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("member_user_org_uq").on(table.userId, table.organizationId),
    index("member_organization_idx").on(table.organizationId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    role: text("role"),
    status: text("status").notNull().default("pending"),
  },
  (table) => [
    index("invitation_organization_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);
```

- [ ] **Step 3: 在 session 表加 activeOrganizationId 列**

定位到 `session` 表（约 138 行）。在 `userAgent` 字段之前/之后加：

```ts
activeOrganizationId: text("active_organization_id"),
```

- [ ] **Step 4: 在 relations.ts 补关系**

打开 `src/lib/shared/db/relations.ts`，在 `defineRelations` 的对象里追加（按字母序找合适位置插入）：

```ts
organization: {
  invitations: r.many.invitation(),
  members: r.many.member(),
},
member: {
  organization: r.one.organization({
    from: r.member.organizationId,
    to: r.organization.id,
  }),
  user: r.one.user({
    from: r.member.userId,
    to: r.user.id,
  }),
},
invitation: {
  inviter: r.one.user({
    from: r.invitation.inviterId,
    to: r.user.id,
  }),
  organization: r.one.organization({
    from: r.invitation.organizationId,
    to: r.organization.id,
  }),
},
```

如果 `user` 这一块在 relations.ts 已经存在，追加：

```ts
memberships: r.many.member(),
invitationsSent: r.many.invitation(),
```

如果 `user` 不存在，新建：

```ts
user: {
  memberships: r.many.member(),
  invitationsSent: r.many.invitation(),
},
```

- [ ] **Step 5: 删掉临时文件**

Run:

```
rm tmp-org-schema.ts
```

- [ ] **Step 6: typecheck**

Run:

```
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 7: Commit**

```
git add src/lib/shared/db/schema.ts src/lib/shared/db/relations.ts
git commit -m "feat(db): add organization/member/invitation tables + session.activeOrganizationId"
```

---

## Task 11 — drizzle-kit 生成迁移 SQL

**Files:**

- Auto-generated: `drizzle/<timestamp>_*.sql`

- [ ] **Step 1: 让 drizzle-kit 算 diff**

Run:

```
pnpm db:generate
```

Expected: 在 `drizzle/` 下生成新的 `<timestamp>_<random_name>.sql` 文件，内容包含：

- `CREATE TABLE "organization" ...`
- `CREATE TABLE "member" ...` + 索引
- `CREATE TABLE "invitation" ...` + 索引
- `ALTER TABLE "session" ADD COLUMN "active_organization_id" text;`

- [ ] **Step 2: 人工 review 生成的 SQL**

打开新生成的 `.sql` 文件确认：

1. 三张新表的字段类型与 schema.ts 一致
2. 外键 ON DELETE CASCADE 已就位
3. 没有意外的 DROP / ALTER（如果有，停下来排查——可能上一次的 schema 漂移）
4. `member_user_org_uq` 唯一索引存在

如果有任何意外 DROP，**不要继续 Task 12**，先排查 schema.ts 是否动到了其他不该动的地方。

- [ ] **Step 3: Commit migration**

```
git add drizzle/
git commit -m "feat(db): generate migration for organization plugin tables"
```

---

## Task 12 — 本地应用迁移 + 烟测

**Files:** 无源文件改动；仅本地数据库

- [ ] **Step 1: 跑 migrate**

Run:

```
pnpm db:migrate
```

Expected: PASS — 看到 `+ organization`、`+ member`、`+ invitation`、`~ session` 的 apply log。

- [ ] **Step 2: 用 psql 直接验证表结构**

Run:

```
psql "$DATABASE_URL" -c "\d organization" -c "\d member" -c "\d invitation" -c "\d session" | grep -E "active_organization_id|slug|role"
```

Expected: 看到 `active_organization_id`, `slug`, `role` 字段存在。

- [ ] **Step 3: 启动 dev server 烟测**

Run:

```
pnpm dev
```

然后浏览器跑这几步：

1. 现有用户登录 → 跳转应该和改造前一致
2. 进入 studio → tab 都能打开
3. 列出面试 → 数据加载正常
4. 在 chat 里发条消息 → 流式回复正常

Expected: 没有任何回归。better-auth 后台多出 `/api/auth/organization/*` 一组 endpoint（实际上还没人调用，但它存在）。

Ctrl-C 关 dev server。

- [ ] **Step 4: 跑全套 verify**

Run:

```
pnpm typecheck && pnpm test && pnpm check
```

Expected: 全部 PASS。

- [ ] **Step 5: 如有 lint 抱怨，修干净后 commit**

如果 `pnpm check` 报样式 / lint 问题：

```
pnpm fix
git add -u
git commit -m "chore: ultracite autofix"
```

否则跳过本步。

---

## Task 13 — 推上分支 + 整理

**Files:** 无源文件改动

- [ ] **Step 1: push 分支**

Run:

```
git push -u origin feat/multi-tenant-p0-foundation
```

Expected: 远端建立追踪分支。

- [ ] **Step 2: 打开 PR 草稿（可选，让团队 review）**

Run:

```
gh pr create --draft --title "feat(multi-tenant): P0 permissions foundation" --body "$(cat <<'EOF'
## Summary
- 接入 better-auth `organization` 插件
- 定义 statement + 4 个 role (owner/admin/hr/viewer)
- 新建 organization/member/invitation 表 + session.activeOrganizationId
- 全套权限矩阵单测 + cross-cut 回归表

## 行为变化
**对外行为完全不变**。本 PR 只装"骨架"，没有任何路由/UI/DAO 走多租户路径。后续 P1 (业务表 + 数据迁移)、P2 (路由/UI/邀请)、P3 (清理) 独立 PR。

## Spec
`docs/superpowers/specs/2026-05-11-multi-tenant-design.md` §2–§3 + §4.1

## Test plan
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 通过（含权限矩阵 cross-cut 表）
- [ ] `pnpm check` 通过
- [ ] `pnpm db:migrate` 应用迁移无 drift
- [ ] dev server 启动后现有 studio / chat / login 流程无回归
EOF
)"
```

Expected: PR 草稿建立。

- [ ] **Step 3: 总结**

P0 完成。下一步等团队 review / merge，再写 P1 plan（业务表加 organizationId + 数据 backfill）。

---

## 验证清单（done 标准）

- ☐ Task 1-13 全部勾完
- ☐ `pnpm typecheck` PASS
- ☐ `pnpm test` PASS（含 permissions 单测）
- ☐ `pnpm check` PASS
- ☐ `pnpm db:migrate` 应用成功，psql 能查到三张新表
- ☐ Dev server 跑现有流程无回归
- ☐ PR 提交（可选 draft）

完成上述清单即认为 P0 落地。
