# 多租户改造 P3 — UI 路由 + 邀请/切换 + 清理 (合并原 P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 P0-P2 准备的后端多租户能力接到 UI。把 URL 切到 `/w/[slug]/...`，加 WorkspaceSwitcher / 邀请页 / 自助创建 / 成员管理 / `/platform/*` 超管入口；客户端用 better-auth 官方 `checkRolePermission` 同步 gating；同时收尾原 P4：候选人 / Feishu bot / livekit 写入路径打戳，删 `canAccessAdmin` + `ADMIN_ORGANIZATION_ID`，drop 旧 `user.organizationId/Name` 列，业务表 `ALTER NOT NULL`，修 `bot.ts` chat 包漂移。

**Architecture:** URL slug 是活跃 workspace 的真相源。`workspaceMiddleware` 优先读 `c.req.param("slug")`，找不到时退回 `session.activeOrganizationId` 然后 `member.createdAt ASC` 首选；解析成功后**写回 session**，让 `auth.api.hasPermission` 能用。所有 organization/member/invitation 实体操作通过 better-auth 官方 `auth.api.*` / `authClient.organization.*`——零自家邀请流。

**Tech Stack:** Next.js 16 App Router, Hono RPC, Better Auth `organization` plugin (server + client), Drizzle, shadcn/ui, Tanstack Query.

**Spec reference:** `docs/superpowers/specs/2026-05-11-multi-tenant-design.md` §6.3 / §7 / §8 / §10 / §11.

**Branch:** 继续在 `feat/multi-tenant-p0-foundation`。

---

## 分组

| 组                                             | 任务  | 触发条件                               |
| ---------------------------------------------- | ----- | -------------------------------------- |
| **A. 紧急止血**                                | 1     | "暂无可展示候选人详情" bug，**先跑**   |
| **B. 候选人/bot/livekit DAO scoping**          | 2-5   | 解锁 ALTER NOT NULL                    |
| **C. URL slug + App Router 重构**              | 6-7   | 切到 `/w/[slug]`                       |
| **D. UI: switcher / invite / create / select** | 8-12  | 真多租户体验                           |
| **E. 权限 gating UI**                          | 13-15 | 角色按钮可见性                         |
| **F. 平台 super-admin**                        | 16-17 | `/platform/*`                          |
| **G. 清理 / 收尾**                             | 18-22 | 删旧 gate、drop 旧列、NOT NULL、修漂移 |

---

## Task 1 — 紧急止血:session.activeOrganizationId 回填 + workspaceMiddleware 写回

**Goal:** 修今天出现的"暂无可展示候选人详情":旧 session 的 `active_organization_id` 是 NULL,导致 `auth.api.hasPermission` 无法解析角色 → 403 → 客户端拿到 error → "暂无可展示"。

**Files:**

- Create: `drizzle/<timestamp>_backfill_active_org/migration.sql`
- Modify: `src/server/middlewares/workspace.ts`

- [ ] **Step 1: 起一个空 migration**

Run:

```
pnpm db:generate --custom
```

(如 drizzle-kit 不支持 --custom, 手动: `mkdir -p drizzle/$(date +%Y%m%d%H%M%S)_backfill_active_org && touch $_/migration.sql`)

- [ ] **Step 2: 写 SQL**

```sql
-- 回填 session 表的 active_organization_id。
-- P0 加这列时是 nullable, 没有 backfill; 旧 session 都是 NULL。
-- 把所有有 default workspace 成员资格的 session 设到该 org;
-- 没成员资格的留 NULL (workspaceMiddleware 会拦)。

UPDATE "session" s
SET "active_organization_id" = (
  SELECT m."organization_id"
  FROM "member" m
  WHERE m."user_id" = s."user_id"
  ORDER BY m."created_at" ASC
  LIMIT 1
)
WHERE s."active_organization_id" IS NULL;
```

drizzle journal 需要登记。如果 db:generate --custom 不存在,手动加进 `drizzle/meta/_journal.json` 的 entries 数组末尾 (idx 递增,when=current epoch ms,tag 对应文件夹名)。

- [ ] **Step 3: 应用**

Run:

```
pnpm db:migrate
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM session WHERE active_organization_id IS NULL;"
```

Expected: 第二条 COUNT = 0 (新登的 session 也都填上了 org_default)。

- [ ] **Step 4: workspaceMiddleware 写回**

修改 `src/server/middlewares/workspace.ts`,在解出 `activeOrgId` 之后、查 member 之前加一段:**如果 session.activeOrganizationId 是 null 且我们解到了一个 fallback,就写回 session 表**。

```ts
// 在 const activeOrgId = ... 之后, const result = await db.select... 之前:
if (!c.var.session?.activeOrganizationId && c.var.session?.id) {
  await db
    .update(session)
    .set({ activeOrganizationId: activeOrgId })
    .where(eq(session.id, c.var.session.id));
}
```

需要 import `session` from `@/lib/shared/db/schema`。drizzle update 是幂等的;同一个 session 接下来的请求 session.activeOrganizationId 已写,这段不会再触发。

- [ ] **Step 5: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add drizzle/ src/server/middlewares/workspace.ts
git commit -m "fix(server): backfill session.activeOrganizationId + persist from middleware"
```

---

## Task 2 — 候选人端 /interview/\* route DAO scoping

**Goal:** 候选人面试页面的 livekit-token endpoint + match-job-description endpoint 不再硬编 `"org_default"`,改从 interview 记录上的 organizationId 拿。

**Files:**

- Modify: `src/server/routes/interview/route.ts`

- [ ] **Step 1: match-job-description 改为按候选人提交的 interviewId 解析 org**

定位 `.post("/match-job-description", ...)` (约 line 71)。它现在硬编 "org_default"。

加 input schema 一个可选 `interviewRecordId`:

```ts
zValidator(
  "json",
  z.object({
    interviewRecordId: z.string().optional(),
    resumeProfile: resumeProfileSchema,
  }),
  ...
)
```

handler:

```ts
const { interviewRecordId, resumeProfile } = c.req.valid("json");
let orgId = "org_default";
if (interviewRecordId) {
  const [row] = await db
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  orgId = row?.organizationId ?? "org_default";
}
const jobDescriptions = await listAllJobDescriptions(orgId);
```

把旧的"workspace not yet plumbed"注释一并删掉。

调用方 (前端 candidate page) 不强制传 `interviewRecordId` —— 这是 P3 入口 hardening。

- [ ] **Step 2: livekit-token endpoint**

定位 `.post("/:id/:roundId/livekit-token", ...)`。这里 `interviewRecord` 已经 load 出来,其 organizationId 由 P2 task 11 已经加到 view 返回。`getGlobalConfig(orgId)` 调用也已在 P2 修对。**这一步不用动**。校验:

```
grep -n "getGlobalConfig\|org_default" src/server/routes/interview/route.ts
```

确认 `getGlobalConfig` 调用传的是真实 `interviewRecord.organizationId ?? "org_default"`,不是硬编。

- [ ] **Step 3: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add src/server/routes/interview/route.ts
git commit -m "feat(interview): match-job-description resolves orgId from interview record"
```

---

## Task 3 — Feishu bot /resume/\* route DAO scoping

**Files:**

- Modify: `src/server/routes/resume/utils/agent-tools.ts`
- Modify: `src/server/routes/resume/route.ts` (如果它 import 了 studio DAO)

**Goal:** Feishu bot 处理简历的工具调用从硬编 `"org_default"` 改为按 bot 当前绑定的 JD 解析 org。

- [ ] **Step 1: 在 agent-tools.ts 的 tool definition 上加 orgId 参数**

定位 `listAllJobDescriptions("org_default")` (line 188)。

把外层导出的 tool factory 改为接 `orgId: string`:

```ts
export function createResumeAgentTools({ orgId }: { orgId: string }) {
  return {
    searchJobDescriptions: ...
    // 内部使用 orgId 调 listAllJobDescriptions(orgId)
  };
}
```

调用方 (Feishu bot agent 注入处) 需要传 orgId。bot 启动时,从 `job_description.organizationId`(若 bot 绑定 JD) 或固定 fallback 拿。

- [ ] **Step 2: 在 bot 启动/路由层注入 orgId**

```
grep -rn "createResumeAgentTools\|resumeAgentTools" src/
```

找到调用点。Feishu bot 绑定的是 chat_id → `job_description.feishu_chat_id`。从该 JD 取 `organizationId`:

```ts
const jdRow = feishu_chat_id
  ? await db
      .select({ orgId: jobDescription.organizationId })
      .from(jobDescription)
      .where(eq(jobDescription.feishuChatId, feishu_chat_id))
      .limit(1)
  : null;
const orgId = jdRow?.[0]?.orgId ?? "org_default";
const tools = createResumeAgentTools({ orgId });
```

- [ ] **Step 3: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add src/server/routes/resume/
git commit -m "feat(resume): bot agent tools resolve orgId from bound JD"
```

---

## Task 4 — Chat 路由 + Livekit webhook DAO scoping

**Files:**

- Modify: `src/server/routes/chat/route.ts` + `src/server/routes/chat/dao/*.ts`
- Modify: `src/server/routes/livekit/route.ts`
- Modify: `src/server/routes/agent/route.ts` (如有)

**Goal:** Chat (chat_conversation/message/attachment) + livekit webhook (interview_conversation/turn 写入) 全部带上 orgId。

- [ ] **Step 1: chat routes 加 workspaceMiddleware**

`src/server/routes/chat/route.ts` 当前可能只有 authMiddleware。把 workspaceMiddleware 加到链上:

```
.use("*", authMiddleware, workspaceMiddleware)
```

然后:

- `chat_conversation` INSERT: `organizationId: c.var.activeOrg!.id`
- `chat_message` INSERT: 同上
- `chat_attachment` INSERT: 同上
- SELECT/UPDATE/DELETE 加 `eq(chat*.organizationId, activeOrg.id)`

- [ ] **Step 2: livekit webhook**

`src/server/routes/livekit/route.ts` 处理 webhook(无登录 session,来自 LiveKit 服务器)。这里**不能**走 workspaceMiddleware。改为从 `interview_record_id`(webhook 里有 metadata)反查 studio_interview.organizationId,然后 INSERT 时打戳。

```ts
async function resolveOrgFromInterviewId(interviewRecordId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: studioInterview.organizationId })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  return row?.organizationId ?? "org_default";
}

// INSERT interview_conversation / interview_conversation_turn / interview_audit_log 时
const orgId = await resolveOrgFromInterviewId(interviewRecordId);
await db.insert(interviewConversation).values({
  ...,
  organizationId: orgId,
});
```

`buildFallbackTurns` 在 `interviews/dao/interview-conversations.ts` 也要改成接收 orgId。

- [ ] **Step 3: agent webhook** (如有)

```
grep -rn "agent.*webhook\|agent route" src/server/routes/agent/ 2>/dev/null
```

同 livekit 套路。

- [ ] **Step 4: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -10
git add src/server/routes/chat/ src/server/routes/livekit/ src/server/routes/agent/ src/server/routes/studio/routes/interviews/dao/
git commit -m "feat(server): scope chat + livekit webhook + agent DAOs by orgId"
```

---

## Task 5 — /api/w/:slug 路径 + slug 解析

**Files:**

- Modify: `src/server/middlewares/workspace.ts` — 加 slug param 解析
- Modify: `src/app.ts` (Hono app) — mount studio under `/w/:slug/studio`

**Goal:** URL 真相源是 `:slug`。client 通过 `/api/w/[slug]/studio/...` 调用。

- [ ] **Step 1: workspaceMiddleware 优先读 slug**

修改 `src/server/middlewares/workspace.ts`:

```ts
import { eq } from "drizzle-orm";
// ...

export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const user = c.var.user;
  if (!user) return c.json({ message: "Unauthorized" }, 401);

  // 1. URL slug (P3 主入口)
  // 2. session.activeOrganizationId (老入口,后兼)
  // 3. 用户最早的 member 行 fallback
  let activeOrgId: string | null = null;
  const slug = c.req.param("slug");
  if (slug) {
    const [byslug] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    activeOrgId = byslug?.id ?? null;
    if (!activeOrgId) return c.json({ message: "Workspace not found" }, 404);
  } else {
    activeOrgId = c.var.session?.activeOrganizationId ?? (await pickDefaultOrgId(user.id));
  }

  // ... 余下逻辑不变(查 member + 写回 session)
});
```

写回 session 改为:

```ts
if (c.var.session?.activeOrganizationId !== activeOrgId && c.var.session?.id) {
  await db
    .update(session)
    .set({ activeOrganizationId: activeOrgId })
    .where(eq(session.id, c.var.session.id));
}
```

- [ ] **Step 2: app.ts 加 /w/:slug/studio mount**

```
grep -n "studioRouter\|app.route" src/app.ts | head -10
```

找到 `app.route("/studio", studioRouter)` 这样的。加一行**并保留旧的**(为了过渡期):

```ts
app.route("/w/:slug/studio", studioRouter);
app.route("/studio", studioRouter); // 旧路径保留,P3 结束删
```

注意 Hono mount 同一个 router 到两处是支持的。

- [ ] **Step 3: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add src/server/middlewares/workspace.ts src/app.ts
git commit -m "feat(server): mount studio under /w/:slug + workspaceMiddleware reads slug"
```

---

## Task 6 — App Router /w/[slug] 重构

**Files:**

- Create: `src/app/(auth)/w/[slug]/layout.tsx`
- Create: `src/app/(auth)/w/[slug]/page.tsx`
- Move: `src/app/(auth)/studio/*` → `src/app/(auth)/w/[slug]/studio/*`
- Modify: `src/app/(auth)/page.tsx` 或 `src/middleware.ts` — root redirect 逻辑

**Goal:** 用户访问 `/` 时根据 active org 跳到 `/w/[slug]`。所有 studio 页面在 `/w/[slug]/studio` 下。

- [ ] **Step 1: 用 git mv 整体平移 studio**

```
git mv src/app/\(auth\)/studio src/app/\(auth\)/w/\[slug\]/studio
```

- [ ] **Step 2: 写 /w/[slug]/layout.tsx**

```tsx
// src/app/(auth)/w/[slug]/layout.tsx
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { eq, and } from "drizzle-orm";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const [row] = await db
    .select()
    .from(organization)
    .innerJoin(
      member,
      and(eq(member.organizationId, organization.id), eq(member.userId, session.user.id)),
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!row) notFound();

  // 把 active org 持久化到 session,这样客户端 RPC 也对齐
  if (session.session.activeOrganizationId !== row.organization.id) {
    await auth.api.setActiveOrganization({
      headers: await headers(),
      body: { organizationId: row.organization.id },
    });
  }

  return <>{children}</>;
}
```

- [ ] **Step 3: 写 /w/[slug]/page.tsx**

转发到 chat 首页 (workspace 默认入口):

```tsx
import { redirect } from "next/navigation";

export default async function WorkspaceRoot({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/w/${slug}/studio/interviews`);
}
```

- [ ] **Step 4: 修改根 /page.tsx 或 /(auth)/page.tsx**

定位 `src/app/(auth)/page.tsx` 或类似入口。修改为:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { eq, asc } from "drizzle-orm";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const activeId = session.session.activeOrganizationId;
  let targetSlug: string | null = null;
  if (activeId) {
    const [org] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, activeId))
      .limit(1);
    targetSlug = org?.slug ?? null;
  }
  if (!targetSlug) {
    const [first] = await db
      .select({ slug: organization.slug })
      .from(organization)
      .innerJoin(member, eq(member.organizationId, organization.id))
      .where(eq(member.userId, session.user.id))
      .orderBy(asc(member.createdAt))
      .limit(1);
    targetSlug = first?.slug ?? null;
  }
  if (!targetSlug) redirect("/select-workspace");
  redirect(`/w/${targetSlug}`);
}
```

- [ ] **Step 5: client RPC 调用切换到新 URL**

```
grep -rn "rpc.api.studio\." src/app/\(auth\)/w/ src/components/ src/lib/client/ | head -20
```

把每个 `rpc.api.studio.<path>` 改为 `rpc.api.w[":slug"].studio.<path>`,slug 从 next params / pathname 拿。

最简方式:在 `@/lib/client/rpc` 上加一个 helper `wRpc(slug)` 返回作用域化的 client。或者维持现有 rpc + 调用点显式传 slug。**MVP 用后者**:

更新 `src/lib/client/api/endpoints/studio-*.ts` 里每个 endpoint 函数,从 caller 那里收 slug,拼到 URL。

具体改造太大,本 task 先放一个**适配 shim**,让旧 `/api/studio/*` 仍可用 (Task 5 step 2 已经双 mount)。客户端切到新 URL 在 **Task 7** 里做。

- [ ] **Step 6: typecheck + 手测**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -10
pnpm dev
```

浏览器访问 `/`,确认 redirect 到 `/w/default/studio/interviews`,数据加载。

- [ ] **Step 7: Commit**

```
git add src/app/
git commit -m "feat(app): /w/[slug] workspace routing + redirect from root"
```

---

## Task 7 — 客户端 RPC 切到 /api/w/:slug

**Files:**

- Modify: `src/lib/client/api/endpoints/*.ts` — 每个 studio 相关 endpoint 函数加 `slug` 参数
- Modify: `src/lib/client/rpc.ts` — 暴露 `wApi(slug)` 类型化作用域客户端

**Goal:** 前端调用从 `/api/studio/*` 换成 `/api/w/:slug/studio/*`,slug 通过 hook/context 注入。

- [ ] **Step 1: 在 client 加 workspace slug provider**

```tsx
// src/lib/client/workspace-context.tsx
"use client";
import { createContext, useContext } from "react";
const Ctx = createContext<string | null>(null);
export const WorkspaceSlugProvider = Ctx.Provider;
export function useWorkspaceSlug(): string {
  const slug = useContext(Ctx);
  if (!slug) throw new Error("useWorkspaceSlug must be used within a workspace route");
  return slug;
}
```

- [ ] **Step 2: 在 /w/[slug]/layout.tsx 注入 slug**

```tsx
<WorkspaceSlugProvider value={slug}>{children}</WorkspaceSlugProvider>
```

(layout 是 server component;Provider 在 client component wrapper 里,需要拆个 wrapper)。

```tsx
// 新建 src/app/(auth)/w/[slug]/_components/workspace-slug-bridge.tsx
"use client";
import { WorkspaceSlugProvider } from "@/lib/client/workspace-context";
export function WorkspaceSlugBridge({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  return <WorkspaceSlugProvider value={slug}>{children}</WorkspaceSlugProvider>;
}
```

在 layout.tsx return:

```tsx
return <WorkspaceSlugBridge slug={slug}>{children}</WorkspaceSlugBridge>;
```

- [ ] **Step 3: 改 endpoint 函数收 slug**

例如 `fetchStudioInterview`:

```ts
export function fetchStudioInterview(
  slug: string,
  id: string,
): Promise<StudioInterviewRecord | null> {
  return rpcFetch<StudioInterviewRecord>(
    rpc.api.w[":slug"].studio.interviews[":id"].$get({ param: { slug, id } }),
    "加载面试详情失败",
    { allow404: true },
  );
}
```

调用方 (dialog / page 组件) 在顶部:

```ts
const slug = useWorkspaceSlug();
// ...
queryFn: () => fetchStudioInterview(slug, recordId),
queryKey: ["studio-interview", slug, recordId],
```

注意 queryKey 加 slug 防止跨工作区缓存串。

- [ ] **Step 4: 重复对所有 studio endpoint 函数做**

清单:

```
grep -l "rpc.api.studio" src/lib/client/api/endpoints/
```

每个文件里的 endpoint 函数都加 slug 参数。每个调用点也对应更新。

这个 task 涉及很多文件,但都是机械变换。如果某个 endpoint 不在 studio 下 (chat, interview 等),先不动 —— 它们仍走老路径,Task 4 已经让它们的服务端拿到 orgId。

- [ ] **Step 5: typecheck + 手测**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -20
```

`pnpm dev` 跑一遍,点开 studio 各页确认数据加载。

- [ ] **Step 6: Commit**

```
git add src/lib/client/ src/app/ src/components/
git commit -m "feat(client): studio RPC endpoints call /api/w/:slug/studio with workspace slug context"
```

---

## Task 8 — useHasPermission hook + PermissionGate

**Files:**

- Create: `src/hooks/use-has-permission.ts`
- Create: `src/components/permission/permission-gate.tsx`

- [ ] **Step 1: 写 hook**

```ts
// src/hooks/use-has-permission.ts
"use client";
import { authClient } from "@/lib/client/auth-client";
import type { statement } from "@/lib/shared/permissions";

export function useHasPermission<R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
): boolean {
  const { data: member } = authClient.useActiveMember();
  if (!member?.role) return false;
  return authClient.organization.checkRolePermission({
    permissions: { [resource]: [action] } as Record<string, string[]>,
    role: member.role,
  });
}
```

- [ ] **Step 2: 写 PermissionGate 组件**

```tsx
// src/components/permission/permission-gate.tsx
"use client";
import type { statement } from "@/lib/shared/permissions";
import { useHasPermission } from "@/hooks/use-has-permission";

export function PermissionGate<R extends keyof typeof statement>({
  resource,
  action,
  fallback = null,
  children,
}: {
  resource: R;
  action: (typeof statement)[R][number];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const allowed = useHasPermission(resource, action);
  return allowed ? <>{children}</> : <>{fallback}</>;
}
```

- [ ] **Step 3: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add src/hooks/use-has-permission.ts src/components/permission/permission-gate.tsx
git commit -m "feat(client): useHasPermission hook + PermissionGate component"
```

---

## Task 9 — WorkspaceSwitcher (sidebar 顶部)

**Files:**

- Create: `src/components/workspace/workspace-switcher.tsx`
- Modify: `src/components/app-sidebar/app-sidebar.tsx` (或具体 sidebar 入口)

**Goal:** Sidebar 顶部一个下拉:显示当前 workspace 名 + 头像,展开列出我所在的所有 workspace,底部"创建新工作区"+"工作区设置"。

- [ ] **Step 1: 写 switcher 组件**

```tsx
// src/components/workspace/workspace-switcher.tsx
"use client";

import { authClient } from "@/lib/client/auth-client";
import { useRouter } from "next/navigation";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Plus } from "lucide-react";

export function WorkspaceSwitcher() {
  const router = useRouter();
  const slug = useWorkspaceSlug();
  const { data: orgs = [] } = authClient.useListOrganizations();
  const active = orgs.find((o) => o.slug === slug);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-between">
          <span className="truncate">{active?.name ?? slug}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.id}
            onClick={() => router.push(`/w/${o.slug}`)}
            className={o.slug === slug ? "bg-accent" : ""}
          >
            {o.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/create-workspace")}>
          <Plus className="mr-2 h-4 w-4" />
          创建新工作区
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: 在 sidebar 里挂上**

```
grep -n "AppSidebar\|SidebarHeader" src/components/app-sidebar/app-sidebar.tsx
```

找到 sidebar 顶部,把 `<WorkspaceSwitcher />` 加进去。

- [ ] **Step 3: typecheck + 手测**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
pnpm dev
```

手测:下拉能列出 workspace、点击切换 URL。

- [ ] **Step 4: commit**

```
git add src/components/workspace/ src/components/app-sidebar/
git commit -m "feat(ui): WorkspaceSwitcher in sidebar"
```

---

## Task 10 — /select-workspace 落地页

**Files:**

- Create: `src/app/(auth)/select-workspace/page.tsx`

**Goal:** 用户登录后如无 active workspace 跳到这里;展示 my workspaces + 创建按钮。

- [ ] **Step 1: 写 page**

```tsx
// src/app/(auth)/select-workspace/page.tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SelectWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const rows = await db
    .select({ slug: organization.slug, name: organization.name })
    .from(organization)
    .innerJoin(member, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id));

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-6 text-2xl font-semibold">选择一个工作区</h1>
      {rows.length === 0 ? (
        <p className="mb-4 text-muted-foreground">
          你还没有加入任何工作区。创建一个,或等待管理员邀请。
        </p>
      ) : (
        <ul className="mb-6 space-y-2">
          {rows.map((r) => (
            <li key={r.slug}>
              <Link href={`/w/${r.slug}`}>
                <Card className="hover:bg-accent">
                  <CardHeader>
                    <CardTitle>{r.name}</CardTitle>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Button asChild>
        <Link href="/create-workspace">创建新工作区</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: commit**

```
git add src/app/\(auth\)/select-workspace/
git commit -m "feat(app): /select-workspace landing for users with no active org"
```

---

## Task 11 — /create-workspace 自助创建

**Files:**

- Create: `src/app/(auth)/create-workspace/page.tsx`
- Create: `src/app/(auth)/create-workspace/_components/create-form.tsx`

**Goal:** 表单 name + slug,提交后调 `authClient.organization.create`,成功跳到 `/w/[newSlug]`。

- [ ] **Step 1: 写表单 client component**

```tsx
// src/app/(auth)/create-workspace/_components/create-form.tsx
"use client";
import { authClient } from "@/lib/client/auth-client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function CreateWorkspaceForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { data, error } = await authClient.organization.create({
      name: name.trim(),
      slug: slug.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "创建失败");
      return;
    }
    await authClient.organization.setActive({ organizationId: data.id });
    router.push(`/w/${data.slug}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label>工作区名</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div>
        <Label>Slug (URL 路径)</Label>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          pattern="[a-z0-9-]+"
          required
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? "创建中..." : "创建工作区"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: page.tsx**

```tsx
// src/app/(auth)/create-workspace/page.tsx
import { CreateWorkspaceForm } from "./_components/create-form";

export default function CreateWorkspacePage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-6 text-2xl font-semibold">创建新工作区</h1>
      <CreateWorkspaceForm />
    </div>
  );
}
```

- [ ] **Step 3: commit**

```
git add src/app/\(auth\)/create-workspace/
git commit -m "feat(app): /create-workspace self-serve workspace creation"
```

---

## Task 12 — /invite/[token] 接受邀请

**Files:**

- Create: `src/app/invite/[token]/page.tsx`

**Goal:** 邀请链接落地。已登录直接接受,未登录先跳 login 带 returnTo。

- [ ] **Step 1: 写 page**

```tsx
// src/app/invite/[token]/page.tsx
"use client";
import { authClient } from "@/lib/client/auth-client";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [accepting, setAccepting] = useState(false);

  if (isPending) return <div className="p-8">加载中...</div>;

  if (!session?.user) {
    router.push(`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`);
    return null;
  }

  async function onAccept() {
    setAccepting(true);
    const { data, error } = await authClient.organization.acceptInvitation({
      invitationId: token,
    });
    setAccepting(false);
    if (error) {
      toast.error(error.message ?? "接受邀请失败");
      return;
    }
    // data.organizationId / member 已建立,setActive 然后跳转
    await authClient.organization.setActive({ organizationId: data.invitation.organizationId });
    router.push(`/`);
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">接受邀请</h1>
      <p className="mb-6 text-muted-foreground">你被邀请加入一个工作区。点击"接受"完成加入。</p>
      <Button onClick={onAccept} disabled={accepting}>
        {accepting ? "处理中..." : "接受邀请"}
      </Button>
    </div>
  );
}
```

`/invite/[token]` 不在 `(auth)/` 下,因为未登录也能看。

- [ ] **Step 2: commit**

```
git add src/app/invite/
git commit -m "feat(app): /invite/[token] accept flow via better-auth"
```

---

## Task 13 — workspace 内成员管理页

**Files:**

- Create: `src/app/(auth)/w/[slug]/studio/members/page.tsx`
- Create: `src/app/(auth)/w/[slug]/studio/members/_components/members-table.tsx`
- Create: `src/app/(auth)/w/[slug]/studio/members/_components/invite-dialog.tsx`

**Goal:** 列出当前 workspace 的成员 (调 `authClient.organization.getFullOrganization`),允许 admin/owner 邀请新成员、改成员角色、移除成员、所有都通过 better-auth 官方 API。

- [ ] **Step 1: 表组件**

```tsx
// _components/members-table.tsx
"use client";
import { authClient } from "@/lib/client/auth-client";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PermissionGate } from "@/components/permission/permission-gate";

export function MembersTable() {
  const { data: org, refetch } = authClient.useActiveOrganization();
  const members = org?.members ?? [];

  async function changeRole(memberId: string, role: string) {
    await authClient.organization.updateMemberRole({ memberId, role });
    refetch();
  }
  async function removeMember(memberIdOrEmail: string) {
    if (!confirm("确定移除该成员?")) return;
    await authClient.organization.removeMember({ memberIdOrEmail });
    refetch();
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>邮箱</TableHead>
          <TableHead>角色</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{m.user?.email}</TableCell>
            <TableCell>
              <PermissionGate resource="member" action="update" fallback={<span>{m.role}</span>}>
                <Select value={m.role} onValueChange={(v) => changeRole(m.id, v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">owner</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="hr">hr</SelectItem>
                    <SelectItem value="viewer">viewer</SelectItem>
                  </SelectContent>
                </Select>
              </PermissionGate>
            </TableCell>
            <TableCell>
              <PermissionGate resource="member" action="delete">
                <Button variant="ghost" size="sm" onClick={() => removeMember(m.id)}>
                  移除
                </Button>
              </PermissionGate>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: 邀请 dialog**

```tsx
// _components/invite-dialog.tsx
"use client";
import { authClient } from "@/lib/client/auth-client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("hr");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    const { data, error } = await authClient.organization.inviteMember({ email, role });
    setSubmitting(false);
    if (error) {
      toast.error(error.message ?? "邀请失败");
      return;
    }
    const url = `${window.location.origin}/invite/${data.id}`;
    await navigator.clipboard.writeText(url);
    toast.success(`邀请链接已复制: ${url}`);
    setOpen(false);
    setEmail("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>邀请成员</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>邀请成员</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>邮箱</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <Label>角色</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">admin</SelectItem>
                <SelectItem value="hr">hr</SelectItem>
                <SelectItem value="viewer">viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onSubmit} disabled={submitting || !email}>
            {submitting ? "生成邀请..." : "生成邀请链接"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

注意:本期 invite 不发邮件 (P2 plan 已 stub sendInvitationEmail 为 console.log)。dialog 提交后直接把 `${origin}/invite/[id]` 链接复制到剪贴板。

- [ ] **Step 3: page.tsx**

```tsx
// page.tsx
import { MembersTable } from "./_components/members-table";
import { InviteDialog } from "./_components/invite-dialog";

export default function MembersPage() {
  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">成员管理</h1>
        <InviteDialog />
      </div>
      <MembersTable />
    </div>
  );
}
```

- [ ] **Step 4: sidebar 加入口 + commit**

把"成员管理"加到 sidebar tabs (替代/补充原"用户管理")。用 `<PermissionGate resource="member" action="read">` 包住。

```
git add src/app/\(auth\)/w/\[slug\]/studio/members/ src/components/app-sidebar/
git commit -m "feat(ui): workspace members management page via authClient.organization"
```

---

## Task 14 — sidebar tab 可见性按 role gate

**Files:**

- Modify: `src/components/app-sidebar/sidebar-tabs.tsx`

**Goal:** 按当前 member.role 决定哪些 tab 可见。viewer 看不到"系统管理"、"全局配置 update"按钮等。

- [ ] **Step 1: 把 tab 列表包 PermissionGate**

```
grep -n "ADMIN_ORGANIZATION_IDS\|canAccessAdmin" src/components/app-sidebar/sidebar-tabs.tsx
```

把硬编的 admin gating 替换为 PermissionGate 调用。例如:

```tsx
<PermissionGate resource="globalConfig" action="update">
  <SidebarTab href="/w/[slug]/studio/global-config" />
</PermissionGate>
```

每个 tab 选合适的 (resource, action) 对。

- [ ] **Step 2: commit**

```
git add src/components/app-sidebar/
git commit -m "feat(ui): sidebar tabs gated by useHasPermission"
```

---

## Task 15 — 现存 studio "用户管理" 页移除/重定向

**Files:**

- Delete: `src/app/(auth)/w/[slug]/studio/system-management/**`
- Update: 旧路径 `/studio/system-management` redirect 到 `/w/[slug]/studio/members` 或 `/platform/users`

**Goal:** 老的"用户管理"页面是基于 ADMIN_ORGANIZATION_ID 的全局用户列表。多租户后拆成两个:workspace 内用 Task 13 的成员管理,平台级在 Task 16 的 /platform/users。

- [ ] **Step 1: 删除**

```
git rm -r src/app/\(auth\)/w/\[slug\]/studio/system-management/
git rm src/server/routes/studio/routes/users/route.ts src/server/routes/studio/routes/users/dao.ts
```

修改 `src/server/routes/studio/route.ts`,把 `.route("/users", adminUsersRouter)` 这行删掉,并删 import。

- [ ] **Step 2: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add -u
git commit -m "chore(studio): remove legacy global-user management (moved to platform)"
```

---

## Task 16 — /platform/\* 超管入口

**Files:**

- Create: `src/app/(auth)/platform/layout.tsx`
- Create: `src/app/(auth)/platform/page.tsx`
- Create: `src/app/(auth)/platform/users/page.tsx`
- Create: `src/app/(auth)/platform/organizations/page.tsx`

**Goal:** `user.role = "admin"` (better-auth admin 插件意义上的超管) 可以进 `/platform/*` 看所有 org/user/operations。

- [ ] **Step 1: layout 做平台超管 gate**

```tsx
// src/app/(auth)/platform/layout.tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/server/auth";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");
  return <>{children}</>;
}
```

- [ ] **Step 2: /platform/users 用 better-auth admin.listUsers**

```tsx
// src/app/(auth)/platform/users/page.tsx
import { auth } from "@/lib/server/auth";
import { headers } from "next/headers";

export default async function PlatformUsersPage() {
  const { users, total } = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: 100 },
  });
  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">平台所有用户 ({total})</h1>
      <table className="w-full">
        <thead>
          <tr>
            <th>邮箱</th>
            <th>角色</th>
            <th>创建时间</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{new Date(u.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

最简版本,可以后续加分页/封禁/角色提升按钮(都走 `auth.api.setRole`, `auth.api.banUser`)。

- [ ] **Step 3: /platform/organizations 列所有 org**

```tsx
// src/app/(auth)/platform/organizations/page.tsx
import { db } from "@/lib/server/db";
import { organization, member } from "@/lib/shared/db/schema";
import { sql, count } from "drizzle-orm";

export default async function PlatformOrganizationsPage() {
  const rows = await db
    .select({
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      createdAt: organization.createdAt,
      memberCount: count(member.id),
    })
    .from(organization)
    .leftJoin(member, sql`${member.organizationId} = ${organization.id}`)
    .groupBy(organization.id);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-2xl font-semibold">平台所有工作区 ({rows.length})</h1>
      <table className="w-full">
        <thead>
          <tr>
            <th>名</th>
            <th>Slug</th>
            <th>成员数</th>
            <th>创建</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.slug}</td>
              <td>{r.memberCount}</td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: /platform 首页 + commit**

```tsx
// src/app/(auth)/platform/page.tsx
import Link from "next/link";

export default function PlatformIndex() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">平台管理</h1>
      <Link href="/platform/users" className="text-blue-600">
        所有用户
      </Link>
      <Link href="/platform/organizations" className="text-blue-600 block">
        所有工作区
      </Link>
    </div>
  );
}
```

```
git add src/app/\(auth\)/platform/
git commit -m "feat(app): /platform super-admin pages (users + organizations)"
```

---

## Task 17 — 删除 canAccessAdmin / adminMiddleware / ADMIN_ORGANIZATION_ID

**Files:**

- Delete: `src/lib/server/auth-roles.ts`
- Delete: `src/server/middlewares/admin.ts`
- Modify: `src/server/routes/studio/route.ts` — 删 `.use("*", ..., adminMiddleware, ...)` 里的 adminMiddleware
- Modify: `.env.example` — 删 `ADMIN_ORGANIZATION_ID` 行

- [ ] **Step 1: 全局 grep + 删**

```
grep -rln "canAccessAdmin\|ADMIN_ORGANIZATION_ID\|adminMiddleware" src/
```

每个引用点:删去引用,如果上下文需要替代,改为 PermissionGate / requirePermission。

```
git rm src/lib/server/auth-roles.ts src/server/middlewares/admin.ts
```

`src/server/routes/studio/route.ts`:

```ts
.use("*", authMiddleware, workspaceMiddleware)  // 删 adminMiddleware
```

`.env.example`:删 ADMIN_ORGANIZATION_ID 那一行。

- [ ] **Step 2: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -5
git add -u
git commit -m "chore: drop legacy canAccessAdmin + adminMiddleware + ADMIN_ORGANIZATION_ID env"
```

---

## Task 18 — 删除 user.organizationId / organizationName 旧列

**Files:**

- Modify: `src/lib/shared/db/schema.ts` — 删 user 表的 organizationId / organizationName
- Modify: `src/lib/server/auth.ts` — 删 user.additionalFields 的 organizationId / organizationName
- Modify: `src/server/routes/studio/routes/users/dao.ts` 若还存在 — 已在 Task 15 删
- Generate migration

- [ ] **Step 1: 确认无引用**

```
grep -rn "user.organizationId\|organizationName" src/ --include="*.ts" --include="*.tsx" | grep -v "schema.ts\|auth.ts\|feishuTenantKey\|feishuTenantName\|.test\."
```

应只剩 schema.ts / auth.ts 的本期要删的。如果还有,先把它们改为读 feishuTenantKey / feishuTenantName。

- [ ] **Step 2: 改 schema.ts**

```ts
export const user = pgTable("user", {
  banExpires: timestamp("ban_expires"),
  banReason: text("ban_reason"),
  banned: boolean("banned").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  feishuTenantKey: text("feishu_tenant_key"),
  feishuTenantName: text("feishu_tenant_name"),
  id: text("id").primaryKey(),
  image: text("image"),
  // 删除 organizationId / organizationName
  name: text("name").notNull(),
  role: text("role").default("user").notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
```

- [ ] **Step 3: 改 auth.ts**

`user.additionalFields` 删 organizationId / organizationName 两个条目,保留 feishuTenantKey / feishuTenantName。
也修改 Feishu OAuth handler `getUserInfo`:把返回的 `organizationId` / `organizationName` 改为 `feishuTenantKey` / `feishuTenantName`(对应 db 列)。

- [ ] **Step 4: generate + apply migration**

```
pnpm db:generate
```

预期:

```sql
ALTER TABLE "user" DROP COLUMN "organization_id";
ALTER TABLE "user" DROP COLUMN "organization_name";
```

```
pnpm db:migrate
```

- [ ] **Step 5: typecheck + commit**

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -10
git add -A
git commit -m "feat(db): drop legacy user.organizationId/organizationName columns"
```

---

## Task 19 — 业务表 ALTER NOT NULL

**Goal:** 既然所有 INSERT 路径都打戳了,业务表的 organization_id 可以 NOT NULL 锁死。

**Files:**

- Generate new migration

- [ ] **Step 1: 改 schema.ts 把所有打戳过的业务表的 organizationId 加 .notNull()**

对以下 18 张表(17 业务 + 1 global_config),把 `.references(() => organization.id, ...)` 改为 `.notNull().references(() => organization.id, ...)`:

studio_interview / department / interviewer / job_description / candidate_form_template / interview_question_template / chat_conversation / chat_attachment / feishu_thread_state / interview_conversation / interview_conversation_turn / interview_audit_log / interview_notification / studio_interview_schedule / candidate_form_submission / interview_question_template_binding / chat_message / global_config

- [ ] **Step 2: 验证没有遗留 NULL**

```
psql "$DATABASE_URL" -c "
  SELECT 'studio_interview' t, COUNT(*) c FROM studio_interview WHERE organization_id IS NULL
  UNION ALL SELECT 'department', COUNT(*) FROM department WHERE organization_id IS NULL
  UNION ALL SELECT 'interviewer', COUNT(*) FROM interviewer WHERE organization_id IS NULL
  UNION ALL SELECT 'job_description', COUNT(*) FROM job_description WHERE organization_id IS NULL
  UNION ALL SELECT 'candidate_form_template', COUNT(*) FROM candidate_form_template WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_question_template', COUNT(*) FROM interview_question_template WHERE organization_id IS NULL
  UNION ALL SELECT 'chat_conversation', COUNT(*) FROM chat_conversation WHERE organization_id IS NULL
  UNION ALL SELECT 'chat_attachment', COUNT(*) FROM chat_attachment WHERE organization_id IS NULL
  UNION ALL SELECT 'feishu_thread_state', COUNT(*) FROM feishu_thread_state WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_conversation', COUNT(*) FROM interview_conversation WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_conversation_turn', COUNT(*) FROM interview_conversation_turn WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_audit_log', COUNT(*) FROM interview_audit_log WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_notification', COUNT(*) FROM interview_notification WHERE organization_id IS NULL
  UNION ALL SELECT 'studio_interview_schedule', COUNT(*) FROM studio_interview_schedule WHERE organization_id IS NULL
  UNION ALL SELECT 'candidate_form_submission', COUNT(*) FROM candidate_form_submission WHERE organization_id IS NULL
  UNION ALL SELECT 'interview_question_template_binding', COUNT(*) FROM interview_question_template_binding WHERE organization_id IS NULL
  UNION ALL SELECT 'chat_message', COUNT(*) FROM chat_message WHERE organization_id IS NULL
  UNION ALL SELECT 'global_config', COUNT(*) FROM global_config WHERE organization_id IS NULL;
"
```

如有任何 c > 0,**停下来**,排查后续 INSERT 写法漏了哪里。

- [ ] **Step 3: generate + apply**

```
pnpm db:generate
```

预期一堆 `ALTER TABLE ... ALTER COLUMN organization_id SET NOT NULL`。

```
pnpm db:migrate
```

如果 migrate 失败 (DB 里还有 NULL),回到 Step 2 排查。

- [ ] **Step 4: typecheck + commit**

drizzle 类型现在变成 not-nullable,可能解锁 dao 里很多原本 `?: string | null` 的类型简化(可选)。

```
pnpm typecheck 2>&1 | grep "error TS" | grep -v "bot.ts" | head -10
git add -A
git commit -m "feat(db): ALTER organization_id SET NOT NULL on all tenant-scoped tables"
```

---

## Task 20 — 修 bot.ts chat workspace 包版本漂移

**Goal:** 长期遗留的 `chat@4.27.0 vs 4.28.1` 类型不兼容噪音,清理掉。

**Files:**

- Modify: `pnpm-lock.yaml` (通过 pnpm 命令重锁)
- Modify: `packages/adapter-feishu/package.json` 或根 `package.json` 让两端 chat 包对齐

- [ ] **Step 1: 检查版本不一致来源**

```
pnpm why chat
```

输出会显示根 + adapter-feishu 各自拉的版本。

- [ ] **Step 2: 升级低版本端到一致**

```
pnpm --filter @repo/adapter-feishu up chat@latest
pnpm install --frozen-lockfile=false
```

或反向:把根 package.json 的 chat 锁到 adapter-feishu 用的版本。

- [ ] **Step 3: typecheck**

```
pnpm typecheck 2>&1 | head -20
```

期望:**zero 错误**,bot.ts 也通过。

- [ ] **Step 4: commit**

```
git add package.json pnpm-lock.yaml packages/adapter-feishu/package.json
git commit -m "chore(deps): align chat package version across workspace"
```

---

## Task 21 — 双 mount 清理

**Goal:** P3 上线一段时间后,旧 `/api/studio/*` 路径无人再调,删掉。

**Files:**

- Modify: `src/app.ts` 删除 `app.route("/studio", studioRouter)`

- [ ] **Step 1: 确认无引用**

```
grep -rn "/api/studio\|rpc.api.studio\b" src/ | grep -v "rpc.api.w" | head -10
```

如果还有调用点漏改 Task 7,先回去补。

- [ ] **Step 2: 删 mount + commit**

```ts
// src/app.ts
app.route("/w/:slug/studio", studioRouter);
// 删除旧的 app.route("/studio", studioRouter);
```

```
git add src/app.ts
git commit -m "chore(server): remove legacy /api/studio mount (use /api/w/:slug/studio)"
```

---

## Task 22 — Full verify + push

- [ ] **Step 1: full verify**

```
pnpm typecheck 2>&1 | head -10
pnpm test 2>&1 | tail -5
pnpm check 2>&1 | tail -5
```

Expected: 全 PASS,无 bot.ts 噪音(Task 20 已修)。

- [ ] **Step 2: dev server 手测关键路径**

```
pnpm dev
```

手测:

1. 旧 session 登录 → 自动跳 `/w/default/studio/interviews` → 数据加载正常
2. 点 AI 面试详情 → 不再"暂无可展示候选人详情"
3. WorkspaceSwitcher 下拉显示当前 workspace
4. 创建新 workspace → 跳到新 slug
5. 邀请成员 → 复制邀请链接 → 另一账号粘贴 → 成功加入
6. viewer 角色登录 → 看不到"创建 JD"按钮 → POST /api/.../jd 也返 403
7. super-admin (`user.role="admin"`) 登录 → 进 `/platform` → 看到所有 org

- [ ] **Step 3: push**

```
git push
```

- [ ] **Step 4: 简报**

P3 完成,多租户改造全套上线。

---

## 验证清单 (done 标准)

- ☐ Task 1-22 全部勾完
- ☐ `pnpm typecheck` PASS (含 bot.ts,Task 20 修了)
- ☐ `pnpm test` PASS
- ☐ `pnpm check` PASS
- ☐ 7 个 E2E 手测路径通过
- ☐ DB 所有业务表 organization_id NOT NULL 生效
- ☐ branch 推到 origin

多租户改造 P0+P1+P2+P3 完整闭环。
