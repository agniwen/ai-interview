# 多租户改造设计（Better Auth `organization` + access-control）

- 日期：2026-05-11
- 状态：设计确认完毕，待写实施计划
- 范围：把现有 Better Auth 单租户应用改造为支持 workspace 模式的多租户应用

---

## 1. 决策摘要

| 决策项            | 选择                                                     | 理由                                           |
| ----------------- | -------------------------------------------------------- | ---------------------------------------------- |
| 租户粒度          | **Workspace 模式**（用户可属多 workspace，IdP 解耦）     | Linear/Notion 风格，与飞书 OAuth 解绑后更灵活  |
| 加入方式          | **邀请制 + 自助创建**（双轨）                            | B 端避免陆火注册；同时支持 PLG                 |
| 历史数据          | **迁移到默认 workspace `org_default`**                   | 生产零距离迁移，不丢数据                       |
| 角色              | **owner / admin / hr / viewer**（4 类）                  | 第一期不区分 interviewer，按需后续拆           |
| 平台 super-admin  | **保留 better-auth `admin` 插件**                        | 运维/客服跨 workspace 排障                     |
| URL 语义          | **`/w/[slug]/...`**（slug 在路径里）                     | 分享链接自带上下文，多 tab 同时看多 ws         |
| Chat 归属         | **跟随 workspace**（加 organizationId）                  | 防止跨客户数据串扰                             |
| Feishu tenant_key | **重命名为 `feishuTenantKey`**，纯资料用途               | 不再参与鉴权，但保留以备未来"飞书同事"等功能   |
| 权限实现          | **方案 C：organization 插件 + access-control statement** | 单一真相源、客户端 sync gating、加资源只改一处 |
| 数据隔离          | **应用层 scope（DAO 强制 orgId 参数）**                  | 第一期不上 Postgres RLS，靠 helper + review    |

---

## 2. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│  Better Auth core                                            │
│   ├── user, session, account, verification (现有)            │
│   ├── admin 插件 (现有，平台 super-admin)                    │
│   ├── genericOAuth 插件 (现有，飞书登录)                     │
│   └── organization 插件 (新增)                               │
│        ├── organization, member, invitation 表               │
│        ├── session.activeOrganizationId                      │
│        └── ac (access-control) + 4 roles                     │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  @/lib/shared/permissions.ts (新增，唯一真相源)              │
│   - statement（业务资源 × 动作）as const                     │
│   - ac = createAccessControl(statement)                      │
│   - export roles: owner / admin / hr / viewer                │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────┐  ┌──────────────────────────────────┐
│  Server (Hono RPC)      │  │  Client (Next App Router)        │
│   - workspaceMiddleware │  │   - /w/[slug]/* 路由              │
│     解析 slug→org→member│  │   - <PermissionGate /> 组件       │
│   - requirePermission   │  │   - useHasPermission hook        │
│     调 hasPermission    │  │     (checkRolePermission, sync)  │
│   - DAO 强制 orgId 参数 │  │   - 邀请页 /invite/[token]        │
└─────────────────────────┘  └──────────────────────────────────┘
```

**三层边界**：

1. **身份层（user / session / account）** 跨工作区共享
2. **成员层（member）** 把 `user × organization × role` 三元组实例化，是权限的事实表
3. **业务层** 所有原本全局的表加 `organizationId` 列 + 索引；DAO 强制带 orgId 参数

**Feishu**：从鉴权依据降级为画像数据；`user.feishuTenantKey` / `user.feishuTenantName` 仅作为资料字段保留。

**平台 super-admin**：`better-auth/admin` 插件继续生效；`user.role = "admin"` 通过新的环境变量白名单（`PLATFORM_ADMIN_EMAILS`）或手工 SQL 提升。Super-admin 走独立的 `/platform/*` 入口，不混在 `/studio/*` 里。

---

## 3. 权限矩阵

### 3.1 statement（资源 × 动作）

```ts
// src/lib/shared/permissions.ts
import { createAccessControl } from "better-auth/plugins/access";
import {
  defaultStatements,
  adminAc,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements, // organization / member / invitation / team
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
```

### 3.2 4 个角色的能力矩阵

| 资源 / 动作                                                   | owner | admin | hr  | viewer |
| ------------------------------------------------------------- | :---: | :---: | :-: | :----: |
| `interview` create / update                                   |   ✓   |   ✓   |  ✓  |        |
| `interview` read                                              |   ✓   |   ✓   |  ✓  |   ✓    |
| `interview` delete                                            |   ✓   |   ✓   |     |        |
| `jd` create / update                                          |   ✓   |   ✓   |  ✓  |        |
| `jd` read                                                     |   ✓   |   ✓   |  ✓  |   ✓    |
| `jd` delete                                                   |   ✓   |   ✓   |     |        |
| `department` / `interviewer` create / update / delete         |   ✓   |   ✓   |     |        |
| `department` / `interviewer` read                             |   ✓   |   ✓   |  ✓  |   ✓    |
| `candidateForm` / `questionTemplate` create / update / delete |   ✓   |   ✓   |  ✓  |        |
| `candidateForm` / `questionTemplate` read                     |   ✓   |   ✓   |  ✓  |   ✓    |
| `globalConfig` read                                           |   ✓   |   ✓   |  ✓  |   ✓    |
| `globalConfig` update                                         |   ✓   |   ✓   |     |        |
| `chat` create / read / update / delete                        |   ✓   |   ✓   |  ✓  |   ✓    |
| `auditLog` read                                               |   ✓   |   ✓   |     |        |
| `member` invite / remove / updateRole（仅插件 endpoint）      |   ✓   |  ✓\*  |     |        |
| `organization` update settings                                |   ✓   |   ✓   |     |        |
| `organization` delete / transferOwnership                     |   ✓   |       |     |        |

\* admin 可改其他 member 的角色，但不能改 owner 的角色——这是 better-auth `organization` 插件内置约束，直接继承。

### 3.3 角色定义

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

export const admin = ac.newRole({
  ...adminAc.statements,
  // 同 owner，除了 organization 的 delete / transferOwnership
  // 这两个动作由 better-auth org 插件内置只允许 owner，admin 自动拿不到
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

export const roles = { owner, admin, hr, viewer };
export type AppRole = keyof typeof roles;
```

### 3.4 文件位置说明

`permissions.ts` 放在 `src/lib/shared/` 而非 `src/lib/server/`，因为客户端 `auth-client.ts` 也要 import `ac` 和 `roles`。文件内无 `node:*` 依赖，纯类型 + 配置，符合 shared 约定。

---

## 4. 数据库 schema 变更

### 4.1 organization 插件新建的表

由 `npx @better-auth/cli@latest generate --config ./src/lib/server/auth.ts` 生成，落到 `@/lib/shared/db/schema.ts`：

| 表             | 字段要点                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| `organization` | id (PK), name, **slug (唯一)**, logo, metadata, createdAt                     |
| `member`       | id (PK), userId → user, organizationId → organization, role (text)，createdAt |
| `invitation`   | id, email, inviterId, organizationId, role, status, createdAt, expiresAt      |
| `session` (改) | 增列 `activeOrganizationId`                                                   |

### 4.2 `user` 表重命名

```
organizationId   →  feishuTenantKey
organizationName →  feishuTenantName
```

分两步：(a) 加新列 + 数据 backfill，(b) 一个发布周期后 drop 旧列。中间所有引用 `ADMIN_ORGANIZATION_ID` / `canAccessAdmin` / `user.organizationId` 的代码同步删除。

### 4.3 业务表加 `organizationId`

**直接打 `organizationId` 列 + 索引**（一级实体 + 热写子表）：

```
studio_interview
department
interviewer
job_description
candidate_form_template
interview_question_template
chat_conversation
chat_attachment
feishu_thread_state

# 热写子表（按用户决定，全部打戳）
interview_conversation
interview_conversation_turn
interview_audit_log
interview_notification
studio_interview_schedule
candidate_form_submission
interview_question_template_binding
chat_message
```

**经 FK 派生（不加列）**：

```
candidate_form_template_question
candidate_form_template_version
interview_question_template_question
interview_question_template_version
candidate_form_template_job_description       (M:N junction)
interview_question_template_job_description   (M:N junction)
job_description_interviewer                   (M:N junction)
```

### 4.4 单例表转 per-org

```
global_config:
  PK 从 id = "singleton" 改为 PK = organizationId
  每个工作区一行；首次访问时 lazy-create
```

### 4.5 跨工作区联表防护

所有业务 DAO 通过统一 helper 注入 `where(organizationId)`：

```ts
// src/server/routes/_helpers/scoped-query.ts
export function scoped<T>(orgId: string, query: T): T {
  /* ... */
}
```

第一期**不上** Postgres RLS——和 drizzle 连接池模式有冲突、调试复杂。靠"DAO 必经 helper" + code review 守门。后续如有需要再加 RLS。

---

## 5. 数据迁移脚本

### 5.1 创建默认 workspace + member

```sql
-- 5.1.1 创建默认 workspace
INSERT INTO organization (id, name, slug, created_at)
VALUES ('org_default', '默认工作区', 'default', NOW());

-- 5.1.2 把所有现有用户加为成员
--   • 老 ADMIN_ORGANIZATION_ID 列表里的人 → admin
--   • better-auth user.role='admin'        → 沿用 admin
--   • 其他人                                → hr（保守、给写权限不中断业务）
INSERT INTO member (id, user_id, organization_id, role, created_at)
SELECT
  'mem_' || u.id,
  u.id,
  'org_default',
  CASE
    WHEN u.organization_id IN ($ADMIN_ORG_IDS) THEN 'admin'
    WHEN u.role = 'admin'                       THEN 'admin'
    ELSE 'hr'
  END,
  NOW()
FROM "user" u;

-- 5.1.3 把第一个 admin 提升为 owner
UPDATE member
SET role = 'owner'
WHERE id = (
  SELECT id FROM member
  WHERE organization_id = 'org_default' AND role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
);
```

迁移上线当晚默认给 `hr` 而不是 `viewer`，是为了**不中断现有业务**。上线后再让 owner/admin 在 UI 里降级不该写的人。

### 5.2 业务表 backfill

```sql
UPDATE studio_interview            SET organization_id='org_default';
UPDATE department                  SET organization_id='org_default';
UPDATE interviewer                 SET organization_id='org_default';
UPDATE job_description             SET organization_id='org_default';
UPDATE candidate_form_template     SET organization_id='org_default';
UPDATE interview_question_template SET organization_id='org_default';
UPDATE chat_conversation           SET organization_id='org_default';
UPDATE chat_attachment             SET organization_id='org_default';
UPDATE feishu_thread_state         SET organization_id='org_default';

UPDATE interview_conversation              SET organization_id='org_default';
UPDATE interview_conversation_turn         SET organization_id='org_default';
UPDATE interview_audit_log                 SET organization_id='org_default';
UPDATE interview_notification              SET organization_id='org_default';
UPDATE studio_interview_schedule           SET organization_id='org_default';
UPDATE candidate_form_submission           SET organization_id='org_default';
UPDATE interview_question_template_binding SET organization_id='org_default';
UPDATE chat_message                        SET organization_id='org_default';

-- global_config 从 singleton 转 per-org
INSERT INTO global_config (id, opening_instructions, closing_instructions,
                           company_context, updated_by, updated_at)
SELECT 'org_default', opening_instructions, closing_instructions,
       company_context, updated_by, updated_at
FROM global_config WHERE id = 'singleton';
DELETE FROM global_config WHERE id = 'singleton';

-- 全部 ALTER 为 NOT NULL
ALTER TABLE studio_interview            ALTER COLUMN organization_id SET NOT NULL;
-- ... 其余表同
```

### 5.3 收尾迁移（一个发布周期后单独跑）

```sql
ALTER TABLE "user" ADD COLUMN feishu_tenant_key  text;
ALTER TABLE "user" ADD COLUMN feishu_tenant_name text;

UPDATE "user"
SET feishu_tenant_key  = organization_id,
    feishu_tenant_name = organization_name;

-- 等代码全切走以后:
ALTER TABLE "user" DROP COLUMN organization_id;
ALTER TABLE "user" DROP COLUMN organization_name;
```

### 5.4 分阶段上线

| 阶段        | 内容                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| migration 1 | 创建 organization / member / invitation 表，session.activeOrganizationId |
| migration 2 | 业务表加 organizationId (nullable)                                       |
| migration 3 | 数据 backfill + ALTER NOT NULL                                           |
| migration 4 | user.feishuTenantKey / Name 加列 + backfill                              |
| migration 5 | (一个发布周期后) drop user.organizationId / organizationName             |

每个 migration 都附 `down.sql` 回滚。

### 5.5 演练

- 在 staging 跑完整 migration，记录耗时（重点：`interview_conversation_turn` 等大表）
- 若 backfill 超 30s，改成分批 `UPDATE ... WHERE id IN (...) LIMIT N`

---

## 6. 中间件 + RPC 改造

### 6.1 三类中间件

```ts
// src/server/middlewares/workspace.ts
export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const slug = c.req.param("slug");
  if (!slug) return c.json({ message: "Missing workspace" }, 400);

  const org = await orgDao.findBySlug(slug);
  if (!org) return c.json({ message: "Workspace not found" }, 404);

  const member = await memberDao.find(c.var.user.id, org.id);
  if (!member) return c.json({ message: "Forbidden" }, 403);

  c.set("activeOrg", org);
  c.set("member", member);
  await next();
});

// src/server/middlewares/permission.ts
export const requirePermission = (resource: keyof typeof statement, action: string) =>
  factory.createMiddleware(async (c, next) => {
    const { success } = await auth.api.hasPermission({
      headers: c.req.raw.headers,
      body: { permissions: { [resource]: [action] } },
    });
    if (!success) return c.json({ message: "Forbidden" }, 403);
    await next();
  });

// src/server/middlewares/platform-admin.ts
export const platformAdminMiddleware = factory.createMiddleware(async (c, next) => {
  if (c.var.user?.role !== "admin") {
    return c.json({ message: "Forbidden" }, 403);
  }
  await next();
});
```

### 6.2 路由挂载

```ts
// src/server/routes/studio/route.ts
export const studioRouter = factory
  .createApp()
  .use("*", authMiddleware, workspaceMiddleware)
  .route("/interviews", studioInterviewsRouter)
  .route("/departments", departmentsRouter)
  .route("/global-config", globalConfigRouter)
  .route("/interviewers", interviewersRouter)
  .route("/job-descriptions", jobDescriptionsRouter)
  .route("/forms", candidateFormsRouter)
  .route("/interview-questions", interviewQuestionTemplatesRouter)
  .route("/members", workspaceMembersRouter); // 替换原 users 路由

// src/server/routes/studio/routes/interviews/route.ts
export const studioInterviewsRouter = factory
  .createApp()
  .get("/", requirePermission("interview", "read"), listHandler)
  .post("/", requirePermission("interview", "create"), createHandler)
  .patch("/:id", requirePermission("interview", "update"), updateHandler)
  .delete("/:id", requirePermission("interview", "delete"), deleteHandler);
```

### 6.3 RPC URL 形态

```
旧: /api/studio/interviews
新: /api/w/:slug/studio/interviews
```

整个 `studioRouter` 挂到 `/api/w/:slug/studio` 即可，slug 从 param 流到 `workspaceMiddleware`。

### 6.4 DAO 强制 orgId 参数

```ts
// before
export function listInterviews(filter: Filter) { ... }
// after
export function listInterviews(orgId: string, filter: Filter) {
  return db.select().from(studioInterview)
    .where(and(eq(studioInterview.organizationId, orgId), ...));
}
```

调用点：`listInterviews(c.var.activeOrg.id, filter)`。第一期靠 PR review 守门，后续可加 lint rule。

---

## 7. App Router 路由重构

### 7.1 目录结构

```
src/app/
├─ (auth)/
│  ├─ layout.tsx                ← 仅校验登录
│  ├─ select-workspace/         ← 新：已登录但无活跃 workspace 时落地
│  │  └─ page.tsx
│  └─ w/                        ← 新：工作区根
│     └─ [slug]/
│        ├─ layout.tsx          ← workspace gate
│        ├─ page.tsx            ← workspace 首页（chat）
│        └─ studio/             ← 原 studio 整体平移
│           ├─ layout.tsx       ← 不再做 admin gate
│           ├─ interviews/...
│           ├─ job-descriptions/...
│           └─ members/         ← 原 system-management 改造
├─ invite/[token]/              ← 新：接受邀请
├─ create-workspace/            ← 新：自助创建
└─ platform/                    ← 新：super-admin 入口
   ├─ layout.tsx                ← platformAdmin gate
   ├─ organizations/...
   └─ users/...                 ← 原 better-auth admin
```

### 7.2 路由行为

| 路径                | 行为                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                 | 未登录 → `/login`；已登录且 `session.activeOrganizationId` 为空 → `/select-workspace`；有则查出该 org 的 slug 重定向到 `/w/[slug]` |
| `/select-workspace` | 列出我所在的所有 workspace；右上角"创建新工作区"按钮                                                                               |
| `/w/[slug]/...`     | layout 用 `getCurrentSession + checkMembership(slug)`，未授权 404                                                                  |
| `/invite/[token]`   | 未登录先登；接受后调 `authClient.organization.acceptInvitation`                                                                    |
| `/create-workspace` | 调 `authClient.organization.create({ name, slug })`；自动成为 owner                                                                |
| `/platform/*`       | layout 仅检查 `session.user.role === "admin"`                                                                                      |

### 7.3 sidebar 改造

`src/components/app-sidebar/*` 顶部加 **WorkspaceSwitcher**：

```
┌─────────────────────────┐
│ 🟢 Acme HR  ▼          │
├─────────────────────────┤
│ Acme HR         (active)│
│ Beta Recruiting         │
│ ─────────────────       │
│ + 创建新工作区          │
│ ⚙ 工作区设置 (admin+)  │
└─────────────────────────┘
```

切换 = `router.push("/w/[newSlug]" + 当前 sub-path)` + 同步调 `setActive` 更新 session。

### 7.4 SSR 与权限

- 所有 server component 走 `getCurrentSession()`（已 React.cache）
- workspace layout 里加 `getCurrentMember(slug)`（也 React.cache）
- 服务端鉴权直接调 `auth.api.hasPermission({...})`
- layout 已 gate 过的情况下，子页面可信任 `member.role`，只在敏感动作前再校一次

---

## 8. UI 改造清单

### 8.1 新增组件

```
src/components/workspace/
  workspace-switcher.tsx        ← sidebar 顶部下拉
  workspace-create-dialog.tsx   ← 创建表单（name / slug）
  workspace-settings-form.tsx   ← 改名、删 ws、转 owner
  member-table.tsx              ← DataGrid（头像/邮箱/角色/操作）
  member-invite-dialog.tsx      ← 邀请表单（email + role select）
  member-role-select.tsx        ← 角色下拉
  invitation-accept-card.tsx    ← /invite/[token] 用
  permission-gate.tsx           ← <PermissionGate resource="jd" action="create">
```

### 8.2 客户端权限 hook

```ts
// src/hooks/use-has-permission.ts
import { authClient } from "@/lib/client/auth-client";
import type { statement } from "@/lib/shared/permissions";

export function useHasPermission(resource: keyof typeof statement, action: string) {
  // `useActiveMember` 直接返回当前用户在 activeOrganization 中的 member 记录，
  // 比 `useActiveOrganization().members.find(...)` 更直接，避免拉整个成员列表。
  const { data: member } = authClient.useActiveMember();
  if (!member?.role) return false;
  return authClient.organization.checkRolePermission({
    permissions: { [resource]: [action] },
    role: member.role,
  });
}
```

### 8.3 删除 / 改造

```
删除:
  src/lib/server/auth-roles.ts (canAccessAdmin + ADMIN_ORGANIZATION_IDS)
  src/server/middlewares/admin.ts
  原 studio/system-management 里跨平台用户管理页

改造:
  src/components/app-sidebar/sidebar-tabs.tsx → 用 useHasPermission 控可见性
  src/lib/client/auth-client.ts → 加 organizationClient + ac + roles
  src/lib/server/auth.ts → 加 organization plugin + sendInvitationEmail
```

### 8.4 邀请邮件（第一期简化）

`organization` 插件的 `sendInvitationEmail` 回调先 stub 成"把邀请链接 toast 给 inviter 复制"，不集成真实邮件通道。后续接 Resend / 飞书消息。

---

## 9. 测试策略

### 9.1 单元测试

- **`permissions.test.ts`**：表驱动断言所有 (role × resource × action) 矩阵
- **`scoped-query.test.ts`**：vitest + 测试 DB，断言"orgA 的 ctx 调 DAO 拿不到 orgB 的数据"
- **`migrate.test.ts`**：fixtures 建含历史数据的 DB，跑 migration，断言所有行 `organizationId='org_default'`，第一 admin 升 owner 正确

### 9.2 集成测试（Hono testClient）

每个 workspace 路由加一组 case：

```
1. 未登录                                      → 401
2. 登录但不在该 workspace                      → 403
3. 在该 workspace 但角色不够                   → 403
4. 角色够                                      → 200
5. 跨 workspace 越权（用 orgA slug 查 orgB 资源）→ 404
```

### 9.3 E2E 关键路径

```
□ 新用户注册 → /select-workspace → 创建工作区 → 自动成为 owner
□ owner 邀请 admin / hr / viewer → 接受邀请 → 看到对的 tab/按钮
□ owner 切换工作区 → interviews / chat / JD 数据互不可见
□ super-admin 登录 → /platform 能看所有 organization
□ viewer 试图改 JD → UI 按钮隐藏 + 直接 POST 也返回 403
□ Feishu OAuth 首次登录 → user 创建成功但需走 invite/create 才能进 workspace
```

### 9.4 性能 / 迁移演练

在 staging 跑完整 migration，记录大表 backfill 耗时；若 turn 表 backfill 超 30s，改分批。

---

## 10. 风险与开放问题

1. **chat 历史数据归属**：现有 `chat_conversation` 都属于个人，迁移后全部进 `org_default`。如果用户后续加入第二个 workspace，看不到老历史属于"功能特性"还是"bug"——需上线后观察是否有用户反馈。
2. **Feishu bot 多 app 适配**：当前支持两个 Feishu app（`feishu` / `feishu-jiguang-hr`），workspace 化后是否每个 workspace 绑定特定 Feishu app？第一期默认所有 workspace 共享两个 Feishu provider，不做绑定。后续如果客户隔离需要，加 `organization.feishuAppId` 字段。
3. **Slug 冲突**：用户自助创建可能撞 slug。better-auth org 插件本身有唯一约束保护，UI 报"该 slug 已被占用，请换一个"即可。
4. **邀请邮件 stub**：第一期靠 inviter 复制链接，存在产品体验断点。需评估是否接 Resend 或飞书消息再上线。
5. **lint 守护 DAO**：第一期靠 review，团队增长后必须加 lint rule 防"忘 orgId 参数"。
6. **跨 workspace 链接误点**：用户在 Acme 看到分享的 Beta 链接，点开会 404。这是预期行为，但需在 404 页提示"请切换到对应工作区"。
7. **`"admin"` 字符串语义重载**：`user.role` (better-auth admin 插件，平台超管) 和 `member.role` (workspace 内角色) 都可能取值 `"admin"`，但语义完全不同——一个是跨平台特权，一个是工作区内管理员。两个字段在不同表，没有技术冲突，但命名冲突容易看错。中间件/DAO 里坚持读对字段：平台超管查 `c.var.user.role`，workspace 角色查 `c.var.member.role`，永远不要把这两个混着判断。

---

## 11. 上线分阶段

| 阶段                    | 内容                                                                | 兼容性                   |
| ----------------------- | ------------------------------------------------------------------- | ------------------------ |
| **P0：基础设施**        | migration 1-3 上线，组件代码加 organizationId 但仍单 workspace 运行 | 业务无感                 |
| **P1：UI 切换**         | 上 /w/[slug] 路由 + WorkspaceSwitcher + member 管理                 | URL 变化，需做重定向兼容 |
| **P2：邀请 + 自助创建** | 邀请流 + create-workspace 页 + 邀请 stub                            | 真实多租户上线           |
| **P3：清理**            | migration 5 drop 老列 + 删 ADMIN_ORGANIZATION_ID                    | 收尾                     |
| **P4（后续）**          | 邀请邮件、RLS、lint 守护、Feishu 多 app 隔离                        | 增强                     |
