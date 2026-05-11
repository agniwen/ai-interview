# 多租户改造 P2 — 服务端 workspace 上下文 + DAO 按 org 隔离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在所有 `/studio/*` 路由前装 `workspaceMiddleware`，从 better-auth session 取出当前活跃 organization（找不到则回退 `org_default`）注入 `c.var.activeOrg + c.var.member`。把 8 个 studio 子路由的 DAO/handler 全部改成**按 activeOrg.id scope 查询/写入**。permission 改用 better-auth 官方 `auth.api.hasPermission` API。完成后服务端每个写入操作都带 organizationId，每个读取都 scope，但 URL 仍是旧的 `/api/studio/*`——UI 路由切换 + ALTER NOT NULL 在 P3。

**Architecture:** 严格使用 Better Auth 官方 `organization` 插件提供的 `session.activeOrganizationId` 字段 + `auth.api.hasPermission`。`workspaceMiddleware` 读 session + DB 拿 member 行（DB 直查 drizzle，比 `auth.api.getActiveMember` 减一次内部 context 重建）。permission 校验完全由 `auth.api.hasPermission` 承担，不再写自家 if-else。

**Tech Stack:** Hono, Better Auth `organization` plugin + access-control, Drizzle ORM, PostgreSQL.

**Spec reference:** `docs/superpowers/specs/2026-05-11-multi-tenant-design.md` §6 (中间件 + RPC 改造)。

**Branch:** 继续在 `feat/multi-tenant-p0-foundation`。

---

## Out of Scope（本计划不做）

- `ALTER COLUMN organization_id SET NOT NULL` — 推迟到 P3。理由：非 studio 路由（chat / livekit webhook / feishu bot）暂未 scoped，强 NOT NULL 会让它们的 INSERT 失败。
- `/api/w/:slug/studio/*` URL 重写 — 推迟到 P3。本期 URL 仍是 `/api/studio/*`。
- `/w/[slug]/...` App Router 重构 — 推迟到 P3。
- WorkspaceSwitcher / 邀请页 / 成员管理页 / `/platform/*` — 推迟到 P3。
- studio/routes/users 改造为 "members" — 推迟到 P3（涉及 UI 同步）。
- 非 studio 路由（chat / resume / agent / livekit / feishu / interview）的 DAO scoping — 推迟到 P4 或独立 plan，本期只动 studio。
- 修 bot.ts 的 chat workspace 版本漂移噪音 — 与多租户无关，单独 issue 处理。

---

## 文件结构

**Create:**

- `src/server/middlewares/workspace.ts` — 取 session.activeOrganizationId → 查 member → 注入 c.var.activeOrg + c.var.member
- `src/server/middlewares/permission.ts` — `requirePermission(resource, action)` 工厂，内部调 `auth.api.hasPermission`

**Modify:**

- `src/server/type.d.ts` — `Variables` 加 `activeOrg`、`member`
- `src/server/routes/studio/route.ts` — 挂载 workspaceMiddleware
- `src/server/routes/studio/routes/<sub>/route.ts` × 7 — handler 改用 `c.var.activeOrg.id` 调 DAO；每个 endpoint 加 `requirePermission(...)`
- `src/server/routes/studio/routes/<sub>/dao.ts` (或 utils) × 7 — DAO function 第一参数加 `orgId: string`，所有 SELECT/INSERT/UPDATE/DELETE 加 `where(eq(<table>.organizationId, orgId))` 或 INSERT `organizationId: orgId`

**Not touched in this plan:**

- `src/server/routes/studio/routes/users/*` — 老 better-auth admin 用户管理，P3 拆成 platform vs workspace
- `src/server/routes/{chat,resume,feishu,agent,livekit,interview}/**` — P4 单独 plan

---

## 8 个 studio 子路由的 DAO scoping 检查清单

| Sub-route             | DAO 位置             | 主要表                                                                       |
| --------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `departments`         | inline in `route.ts` | `department`                                                                 |
| `interviewers`        | inline in `route.ts` | `interviewer`                                                                |
| `interviews`          | `dao/`+ `utils.ts`   | `studio_interview` + `studio_interview_schedule` + `interview_conversation*` |
| `job-descriptions`    | inline in `route.ts` | `job_description` + M:N table                                                |
| `forms`               | `dao.ts` 或 `dao/`   | `candidate_form_template` (+ version + question + JD link)                   |
| `interview-questions` | `dao.ts` 或 `dao/`   | `interview_question_template` (+ version + question + JD link + binding)     |
| `global-config`       | inline               | `global_config`                                                              |
| `users`               | `dao.ts`             | 老 better-auth listUsers — **本期不动**                                      |

---

## Task 1 — Env Variables 扩展

**Files:**

- Modify: `src/server/type.d.ts`

- [ ] **Step 1: 改 type.d.ts**

```ts
// src/server/type.d.ts
import type { auth } from "@/lib/server/auth";
import type { member, organization } from "@/lib/shared/db/schema";

type OrganizationRow = typeof organization.$inferSelect;
type MemberRow = typeof member.$inferSelect;

export interface Env {
  Variables: {
    user: typeof auth.$Infer.Session.user | null;
    session: typeof auth.$Infer.Session.session | null;
    activeOrg: OrganizationRow | null;
    member: MemberRow | null;
  };
}
```

注意原文件里 import path 是 `~/lib/auth`——这是个老 alias。**保留原文件用的 alias 形式**（如果 tsconfig 配的是 `~/`，就继续用；如果是 `@/`，就用 `@/`）。先 `grep -n "~/lib/auth\|@/lib/server/auth" src/server/type.d.ts` 确认。

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

Expected: 没有新错误。`c.var.activeOrg` / `c.var.member` 在所有 hono context 里现在是 `OrganizationRow | null` / `MemberRow | null` 类型；尚无消费方所以不报错。

- [ ] **Step 3: Commit**

```
git add src/server/type.d.ts
git commit -m "feat(server): extend Hono Variables with activeOrg + member"
```

---

## Task 2 — workspaceMiddleware

**Files:**

- Create: `src/server/middlewares/workspace.ts`

- [ ] **Step 1: 写文件**

```ts
// src/server/middlewares/workspace.ts
//
// 解析当前请求的活跃 workspace + 用户在该 workspace 中的 member 行,
// 注入到 c.var.activeOrg / c.var.member.
//
// 数据来源 (按优先级):
// 1. better-auth session 上的 activeOrganizationId
// 2. 该用户在 DB 里 created_at 最早的 member 行
// 3. fallback 到 'org_default' (P1 backfill 所建的默认 workspace, 兜底用)
//
// P3 将改造为从 URL slug 解析 (/w/[slug]/...).

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { factory } from "@/server/factory";

const FALLBACK_ORG_ID = "org_default";

export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const user = c.var.user;
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const activeOrgId = c.var.session?.activeOrganizationId ?? (await pickDefaultOrgId(user.id));

  const result = await db
    .select({
      member: {
        createdAt: member.createdAt,
        id: member.id,
        organizationId: member.organizationId,
        role: member.role,
        userId: member.userId,
      },
      organization: {
        createdAt: organization.createdAt,
        id: organization.id,
        logo: organization.logo,
        metadata: organization.metadata,
        name: organization.name,
        slug: organization.slug,
      },
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, user.id), eq(member.organizationId, activeOrgId)))
    .limit(1);

  const row = result[0];
  if (!row) {
    return c.json({ message: "Forbidden: not a member of this workspace" }, 403);
  }

  c.set("activeOrg", row.organization);
  c.set("member", row.member);
  return next();
});

async function pickDefaultOrgId(userId: string): Promise<string> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return rows[0]?.organizationId ?? FALLBACK_ORG_ID;
}
```

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

Expected: 干净。

- [ ] **Step 3: Commit**

```
git add src/server/middlewares/workspace.ts
git commit -m "feat(server): workspaceMiddleware resolves activeOrg + member from session"
```

---

## Task 3 — requirePermission middleware

**Files:**

- Create: `src/server/middlewares/permission.ts`

- [ ] **Step 1: 写文件**

```ts
// src/server/middlewares/permission.ts
//
// 资源-动作粒度的权限校验。通过 better-auth 官方 auth.api.hasPermission
// 完成，内部根据 session.activeOrganizationId + member.role 解析
// 自家 ac/roles 矩阵（见 src/lib/shared/permissions.ts）。

import { auth } from "@/lib/server/auth";
import type { statement } from "@/lib/shared/permissions";
import { factory } from "@/server/factory";

type Resource = keyof typeof statement;
type Action<R extends Resource> = (typeof statement)[R][number];

export function requirePermission<R extends Resource>(resource: R, action: Action<R>) {
  return factory.createMiddleware(async (c, next) => {
    const result = await auth.api.hasPermission({
      headers: c.req.raw.headers,
      body: {
        permissions: { [resource]: [action] } as Record<string, string[]>,
      },
    });

    if (!result.success) {
      return c.json({ message: "Forbidden" }, 403);
    }

    return next();
  });
}
```

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

Expected: 干净。

- [ ] **Step 3: Commit**

```
git add src/server/middlewares/permission.ts
git commit -m "feat(server): requirePermission middleware via auth.api.hasPermission"
```

---

## Task 4 — studioRouter 挂载 workspaceMiddleware

**Files:**

- Modify: `src/server/routes/studio/route.ts`

- [ ] **Step 1: 把 workspaceMiddleware 加到 .use("\*", ...) 链**

打开 `src/server/routes/studio/route.ts`。当前是：

```ts
export const studioRouter = factory
  .createApp()
  .use("*", authMiddleware, adminMiddleware)
  ...
```

把它改成：

```ts
import { workspaceMiddleware } from "@/server/middlewares/workspace";
// (保留原有 imports)

export const studioRouter = factory
  .createApp()
  .use("*", authMiddleware, adminMiddleware, workspaceMiddleware)
  ...
```

**注意**：`adminMiddleware` 仍然保留——它在 workspaceMiddleware 之前跑，确保只有 ADMIN_ORGANIZATION_ID 名单里的 Feishu 用户能进 studio（旧行为，与 workspace 平行）。P3 才删 adminMiddleware。

- [ ] **Step 2: typecheck**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

Expected: 干净。

- [ ] **Step 3: 验证 ordering**

由 middleware 链顺序：`authMiddleware` 解 session → `adminMiddleware` 检查 user.role+ADMIN_ORG_IDS（老路径）→ `workspaceMiddleware` 解 activeOrg + member。**workspaceMiddleware 必须在 authMiddleware 之后**（依赖 c.var.user），同 adminMiddleware 不分先后。

- [ ] **Step 4: Commit**

```
git add src/server/routes/studio/route.ts
git commit -m "feat(server): mount workspaceMiddleware on /studio/* routes"
```

---

## Task 5 — departments 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/departments/route.ts`

- [ ] **Step 1: 读现有文件结构**

Run:

```
sed -n '1,60p' src/server/routes/studio/routes/departments/route.ts
```

记下：list / create / update / delete 的 endpoint，以及它们调的 db.select/insert/update/delete 形态。

- [ ] **Step 2: list endpoint 加 orgId filter**

定位 `.get("/", async (c) => {...})` 或类似的列表 handler。原来是 `db.select().from(department)`，改为：

```ts
const orgId = c.var.activeOrg.id;
const rows = await db
  .select()
  .from(department)
  .where(eq(department.organizationId, orgId))
  .orderBy(...);  // 保留原排序
```

如果原来已有 where()，用 `and(eq(department.organizationId, orgId), <原 where>)`。

确保 `and, eq` 已从 `drizzle-orm` 导入。

- [ ] **Step 3: get-by-id endpoint 加 orgId**

```ts
.where(and(eq(department.id, id), eq(department.organizationId, c.var.activeOrg.id)))
```

- [ ] **Step 4: create endpoint INSERT 加 organizationId**

定位 `db.insert(department).values({...})`。在 values 对象里把先前 `organizationId: null` 改成：

```ts
organizationId: c.var.activeOrg.id,
```

P1 Task 1 时遗留的 `organizationId: null` 由本步骤替换。

- [ ] **Step 5: update endpoint 加 orgId filter**

```ts
db.update(department)
  .set({...})
  .where(and(eq(department.id, id), eq(department.organizationId, c.var.activeOrg.id)))
```

- [ ] **Step 6: delete endpoint 加 orgId filter**

同 Step 5 的 where pattern。

- [ ] **Step 7: 每个 endpoint 加 requirePermission**

在 endpoint chain 上插入：

```ts
.get("/",      requirePermission("department", "read"),   handler)
.post("/",     requirePermission("department", "create"), handler)
.patch("/:id", requirePermission("department", "update"), handler)
.delete("/:id",requirePermission("department", "delete"), handler)
```

把 `requirePermission` 从 `@/server/middlewares/permission` 导入。

- [ ] **Step 8: typecheck + 抽样手测**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

Expected: 干净。

不必启动 dev server——下个 task 还是 grouping mod 类似的改动。

- [ ] **Step 9: Commit**

```
git add src/server/routes/studio/routes/departments/route.ts
git commit -m "feat(studio): scope departments DAO + add requirePermission"
```

---

## Task 6 — interviewers 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/interviewers/route.ts`

完全套用 Task 5 的 pattern。资源名是 `interviewer`（注意：作为权限矩阵中的资源 key 不是 "interviewers" 复数）。

- [ ] **Step 1: list endpoint**

`.where(eq(interviewer.organizationId, c.var.activeOrg.id))`

- [ ] **Step 2: get/update/delete endpoint**

`.where(and(eq(interviewer.id, id), eq(interviewer.organizationId, c.var.activeOrg.id)))`

- [ ] **Step 3: create endpoint INSERT**

把 `organizationId: null` 替换为 `organizationId: c.var.activeOrg.id`。

- [ ] **Step 4: requirePermission per endpoint**

```ts
.get("/",       requirePermission("interviewer", "read"),   handler)
.post("/",      requirePermission("interviewer", "create"), handler)
.patch("/:id",  requirePermission("interviewer", "update"), handler)
.delete("/:id", requirePermission("interviewer", "delete"), handler)
```

- [ ] **Step 5: typecheck**

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

- [ ] **Step 6: Commit**

```
git add src/server/routes/studio/routes/interviewers/route.ts
git commit -m "feat(studio): scope interviewers DAO + add requirePermission"
```

---

## Task 7 — interviews 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/interviews/route.ts`
- Modify: `src/server/routes/studio/routes/interviews/dao/*.ts`
- Modify: `src/server/routes/interview/utils.ts` (跨 route 的 buildScheduleRows helper)

这是 P2 里最大的一个路由——同时操作 `studio_interview` 主表 + `studio_interview_schedule` 子表 + 触发 `interview_conversation*` 写入。

- [ ] **Step 1: 列出所有 db.select/insert/update/delete 调用**

Run:

```
grep -nE "db\.(select|insert|update|delete)" src/server/routes/studio/routes/interviews/route.ts src/server/routes/studio/routes/interviews/dao/*.ts
```

得到一个清单。每条都需要加 orgId scope。

- [ ] **Step 2: 给所有 `studioInterview` 表 SELECT/UPDATE/DELETE 加 where**

`.where(and(<原条件>, eq(studioInterview.organizationId, orgId)))`

对每个 DAO 函数，第一参数改为 `orgId: string`。route handler 调用时传 `c.var.activeOrg.id`。

- [ ] **Step 3: INSERT into studio_interview**

route.ts 里建 `record` 对象（约 line 156-180）目前有 `organizationId: null,` —— 替换为 `organizationId: c.var.activeOrg.id,`。

- [ ] **Step 4: studio_interview_schedule INSERT**

`buildScheduleRows` 在 `src/server/routes/interview/utils.ts:277`，现在每行 `organizationId: existing?.organizationId ?? null` —— 改成接受 orgId 参数：

```ts
export function buildScheduleRows(
  orgId: string,
  interviewRecordId: string,
  entries: ReturnType<typeof parseScheduleEntriesInput>,
  now: Date,
  existingRows?: StudioInterviewScheduleRow[],
) {
  ...
  // buildSingleScheduleRow 内部:
  organizationId: existing?.organizationId ?? orgId,
  ...
}
```

调用点 `route.ts:180, 480` 传 `c.var.activeOrg.id` 作为第一参。

- [ ] **Step 5: interview_conversation / interview_conversation_turn 写入**

如果 route 直接写这两张表，加 `organizationId: c.var.activeOrg.id`。否则跳过——这些表多由 livekit webhook / 后台任务写，是 P4 范围。

`buildFallbackTurns` 在 `dao/interview-conversations.ts` 当前传 `organizationId: null`——保持 null 即可，因为这是 webhook 后端产生的数据，本期不动 livekit 路径。

- [ ] **Step 6: requirePermission**

```ts
.get("/",       requirePermission("interview", "read"),   ...)
.get("/:id",    requirePermission("interview", "read"),   ...)
.post("/",      requirePermission("interview", "create"), ...)
.patch("/:id",  requirePermission("interview", "update"), ...)
.delete("/:id", requirePermission("interview", "delete"), ...)
// schedule / 其他子动作按它们涉及的资源对应处理
```

- [ ] **Step 7: typecheck**

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
```

- [ ] **Step 8: Commit**

```
git add src/server/routes/studio/routes/interviews/ src/server/routes/interview/utils.ts
git commit -m "feat(studio): scope interviews DAO/handlers + add requirePermission"
```

---

## Task 8 — job-descriptions 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/job-descriptions/route.ts`
- Modify: `src/server/routes/studio/routes/job-descriptions/dao/*.ts` (如果存在)

套用 Task 5 pattern：

- 资源名 `"jd"`（注意：在 statement 里是 `jd`，不是 `jobDescription`）
- 主表 `job_description` 加 scope
- M:N 关联表 `candidate_form_template_job_description`、`interview_question_template_job_description`、`job_description_interviewer` 不动（派生表）

- [ ] **Step 1: 所有 SELECT/UPDATE/DELETE 加 `eq(jobDescription.organizationId, orgId)`**

- [ ] **Step 2: INSERT 把 `organizationId: null` 替换为 `c.var.activeOrg.id`**

- [ ] **Step 3: requirePermission**

```ts
.get("/",       requirePermission("jd", "read"),   ...)
.post("/",      requirePermission("jd", "create"), ...)
.patch("/:id",  requirePermission("jd", "update"), ...)
.delete("/:id", requirePermission("jd", "delete"), ...)
// Feishu chat 绑定的 endpoint 也按 jd:update 处理
```

- [ ] **Step 4: typecheck + Commit**

```
pnpm typecheck 2>&1 | grep -v "bot.ts"
git add src/server/routes/studio/routes/job-descriptions/
git commit -m "feat(studio): scope job-descriptions DAO + add requirePermission"
```

---

## Task 9 — forms 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/forms/route.ts`
- Modify: `src/server/routes/studio/routes/forms/dao*` (若存在)

资源名 `"candidateForm"`。主表 `candidate_form_template`，子表 `candidate_form_template_question` / `candidate_form_template_version` / `candidate_form_template_job_description` 派生不打戳。Submission 表 `candidate_form_submission` 已打戳。

- [ ] **Step 1: candidate_form_template 表 SELECT/UPDATE/DELETE 加 scope**

- [ ] **Step 2: candidate_form_submission INSERT 加 `organizationId: c.var.activeOrg.id`**

如果 submission 的 INSERT 在某个 candidate-facing route 而非 studio route，**跳过**——本期只动 studio。可以留个 TODO 注释。

- [ ] **Step 3: 子表 INSERT 不动 (派生)**

`candidate_form_template_question` / `candidate_form_template_version` 通过 template 的 FK 派生，不需要 orgId。

- [ ] **Step 4: requirePermission**

```ts
.get("/",       requirePermission("candidateForm", "read"),   ...)
.post("/",      requirePermission("candidateForm", "create"), ...)
.patch("/:id",  requirePermission("candidateForm", "update"), ...)
.delete("/:id", requirePermission("candidateForm", "delete"), ...)
```

- [ ] **Step 5: typecheck + Commit**

```
git add src/server/routes/studio/routes/forms/
git commit -m "feat(studio): scope forms DAO + add requirePermission"
```

---

## Task 10 — interview-questions 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/interview-questions/route.ts`
- Modify: `src/server/routes/studio/routes/interview-questions/dao*`

资源名 `"questionTemplate"`。主表 `interview_question_template`，binding 表 `interview_question_template_binding` 已打戳；其他子表派生。

- [ ] **Step 1: interview_question_template 表 SELECT/UPDATE/DELETE 加 scope**

- [ ] **Step 2: interview_question_template_binding INSERT 加 `organizationId: c.var.activeOrg.id`**

- [ ] **Step 3: requirePermission**

```ts
.get("/",       requirePermission("questionTemplate", "read"),   ...)
.post("/",      requirePermission("questionTemplate", "create"), ...)
.patch("/:id",  requirePermission("questionTemplate", "update"), ...)
.delete("/:id", requirePermission("questionTemplate", "delete"), ...)
```

- [ ] **Step 4: typecheck + Commit**

```
git add src/server/routes/studio/routes/interview-questions/
git commit -m "feat(studio): scope interview-questions DAO + add requirePermission"
```

---

## Task 11 — global-config 路由 scope by orgId

**Files:**

- Modify: `src/server/routes/studio/routes/global-config/route.ts`

资源名 `"globalConfig"`。表 `global_config` 当前 PK = "singleton"，本期不动 PK；只在 SELECT/UPDATE 加 `where(eq(globalConfig.organizationId, orgId))`。

但有个事情：现存只有 1 行（PK="singleton"，organization_id="org_default"）。新工作区第一次访问时如何 lazy-create？

- [ ] **Step 1: read endpoint: 找 organizationId = activeOrg.id 的行；没找到就 lazy-create**

```ts
.get("/", requirePermission("globalConfig", "read"), async (c) => {
  const orgId = c.var.activeOrg.id;
  const row = await db
    .select()
    .from(globalConfig)
    .where(eq(globalConfig.organizationId, orgId))
    .limit(1);

  if (row[0]) {
    return c.json(row[0], 200);
  }

  // lazy-create 一行新的 (org_default 之外的 workspace 第一次访问)
  const fresh = {
    closingInstructions: "",
    companyContext: "",
    id: `gc_${crypto.randomUUID()}`,
    openingInstructions: "",
    organizationId: orgId,
    updatedAt: new Date(),
  };
  await db.insert(globalConfig).values(fresh);
  return c.json(fresh, 200);
})
```

注意：原 PK 设计 `id text default "singleton"` 会跟新插入冲突。把 id 改成 random UUID 形式（如上）—— `default("singleton")` 不影响主键唯一性约束，只是默认值。多行可以存在。

- [ ] **Step 2: update endpoint: where(organizationId = activeOrg.id)**

```ts
.patch("/", requirePermission("globalConfig", "update"), async (c) => {
  const orgId = c.var.activeOrg.id;
  const input = c.req.valid("json");
  await db
    .update(globalConfig)
    .set({...input, updatedAt: new Date(), updatedBy: c.var.user.id})
    .where(eq(globalConfig.organizationId, orgId));
  ...
})
```

- [ ] **Step 3: typecheck + Commit**

```
git add src/server/routes/studio/routes/global-config/
git commit -m "feat(studio): scope global-config DAO + lazy-create per-org row"
```

---

## Task 12 — 集成测试：workspace scope 隔离

**Files:**

- Create: `src/server/routes/studio/__tests__/workspace-scope.test.ts`

最低限度的回归防线：建两个 workspace（org_a / org_b），各塞一条 department，验证用 org_a 的 ctx 调 list 拿不到 org_b 的数据。

- [ ] **Step 1: 写测试**

```ts
// src/server/routes/studio/__tests__/workspace-scope.test.ts

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { department, member, organization, user } from "@/lib/shared/db/schema";

const TEST_ORG_A = "test_org_a";
const TEST_ORG_B = "test_org_b";
const TEST_USER = "test_user_workspace_scope";

async function cleanup() {
  await db.delete(department).where(eq(department.name, "T:scope-test"));
  await db.delete(member).where(eq(member.userId, TEST_USER));
  await db.delete(organization).where(eq(organization.id, TEST_ORG_A));
  await db.delete(organization).where(eq(organization.id, TEST_ORG_B));
  await db.delete(user).where(eq(user.id, TEST_USER));
}

describe("workspace scope isolation", () => {
  beforeEach(async () => {
    await cleanup();
    await db.insert(user).values({
      createdAt: new Date(),
      email: "scope-test@example.com",
      emailVerified: false,
      id: TEST_USER,
      name: "scope-test",
      updatedAt: new Date(),
    });
    await db.insert(organization).values([
      { createdAt: new Date(), id: TEST_ORG_A, name: "Org A", slug: "test-a" },
      { createdAt: new Date(), id: TEST_ORG_B, name: "Org B", slug: "test-b" },
    ]);
    await db.insert(member).values([
      {
        createdAt: new Date(),
        id: "m_a",
        organizationId: TEST_ORG_A,
        role: "owner",
        userId: TEST_USER,
      },
      {
        createdAt: new Date(),
        id: "m_b",
        organizationId: TEST_ORG_B,
        role: "owner",
        userId: TEST_USER,
      },
    ]);
    await db.insert(department).values([
      {
        createdAt: new Date(),
        id: "dep_a",
        name: "T:scope-test",
        organizationId: TEST_ORG_A,
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        id: "dep_b",
        name: "T:scope-test",
        organizationId: TEST_ORG_B,
        updatedAt: new Date(),
      },
    ]);
  });

  afterEach(cleanup);

  it("scoped SELECT only returns rows for the active org", async () => {
    const rowsForA = await db
      .select()
      .from(department)
      .where(eq(department.organizationId, TEST_ORG_A));
    expect(rowsForA.map((r) => r.id)).toEqual(["dep_a"]);

    const rowsForB = await db
      .select()
      .from(department)
      .where(eq(department.organizationId, TEST_ORG_B));
    expect(rowsForB.map((r) => r.id)).toEqual(["dep_b"]);
  });
});
```

这个测试只断言"drizzle where 子句的隔离行为成立"，不真跑 hono pipeline——后者需要 mock session 比较复杂。够做回归防线。

- [ ] **Step 2: 跑测试**

Run:

```
pnpm test -- src/server/routes/studio/__tests__/workspace-scope.test.ts
```

Expected: PASS。

- [ ] **Step 3: Commit**

```
git add src/server/routes/studio/__tests__/workspace-scope.test.ts
git commit -m "test(server): workspace scope isolation smoke test"
```

---

## Task 13 — 烟测 + 推送

- [ ] **Step 1: full verify**

Run:

```
pnpm typecheck 2>&1 | grep -v "bot.ts" | head -10
pnpm test 2>&1 | tail -5
pnpm check 2>&1 | tail -5
```

Expected:

- typecheck: 没有新错误（bot.ts pre-existing OK）
- test: 全 PASS
- check: 0 warning / 0 error

- [ ] **Step 2: 手测 dev server (controller 跑)**

启动 dev server 后人眼验证：

1. Feishu OAuth 登录现有 admin 账号 → studio sidebar 打开
2. 列出 interviews / departments / JDs / forms / templates → 数据加载正常（仍是 org_default 的全量）
3. 创建一个新 department / interviewer → 写入成功
4. 改一个 JD 的标题 → 保存成功
5. 改 global-config 的"开场白" → 保存成功

如果任一步骤报 401 / 403 / 500，停下来排查。

- [ ] **Step 3: push**

Run:

```
git push
```

- [ ] **Step 4: 简报**

P2 完成。当前状态：

- 7/8 studio 子路由（除 users）DAO scoped 完毕
- 所有写入操作带 c.var.activeOrg.id
- 所有读取按 activeOrg.id 过滤
- 每个 endpoint 用 `auth.api.hasPermission` 走 better-auth 权限矩阵
- 行为变化：**几乎无**（仍是默认 workspace，因为没有切换 UI；但权限矩阵已生效——hr 用户试图 delete 一个 interview 将得 403）

---

## 验证清单（done 标准）

- ☐ Task 1-13 全部勾完
- ☐ `pnpm typecheck` 无新错误（bot.ts pre-existing OK）
- ☐ `pnpm test` 全 PASS（含新加 workspace-scope.test.ts）
- ☐ `pnpm check` PASS
- ☐ dev server 手测 5 个 studio 流程无回归
- ☐ workspace isolation 单元测试存在并通过
- ☐ branch 推到 origin

完成上述清单即认为 P2 落地。下一步 P3：UI 路由 `/w/[slug]/...` + WorkspaceSwitcher + 邀请 + member 管理 + `/platform/*` + ALTER NOT NULL + 清理 admin gate。
