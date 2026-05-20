# 工作区共享邀请链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现共享邀请链接：admin/owner 可生成/禁用永不过期的多用途链接，匿名访客经 OAuth 登录后进入确认页加入工作区，已是成员则静默跳转。

**Architecture:** 新增 `workspace_invite_link` 表 + `member.invite_link_id` 关联列；新建顶层 `/api/join/*` 路由处理 preview/accept，在 workspace 子树下挂 `invite-links/*` 管理路由。前端新增 `/join/[code]` Server Component 页面与成员页 Dialog，复用现有 `rpc` + `rpcFetch` + TanStack Query 模式。

**Tech Stack:** Drizzle ORM (rc-1)、Hono、Better Auth `organization` 插件、Next.js 16 App Router、React 19、TanStack Query、nanoid v5、vitest（真实 DB）。

参考设计稿：`docs/superpowers/specs/2026-05-21-workspace-invite-links-design.md`。

---

## 文件清单

**Schema 包**

- 修改 `packages/db-schema/src/schema.ts` — 新增 `workspaceInviteLink` 表，给 `member` 加 `inviteLinkId` 列
- 修改 `packages/db-schema/src/relations.ts` — 加 `workspaceInviteLink` ↔ `organization`/`member` 关系
- 新建迁移文件 `apps/ai-recruitment-copilot/drizzle/<timestamp>_<name>.sql`

**Server 路由 — 工作区子树**

- 新建 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/route.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/dao.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/schema.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts`
- 修改 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/route.ts` — 挂载子路由

**Server 路由 — 顶层 join**

- 新建 `apps/ai-recruitment-copilot/src/server/routes/join/route.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/join/dao.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/join/schema.ts`
- 新建 `apps/ai-recruitment-copilot/src/server/routes/join/__tests__/route.test.ts`
- 修改 `apps/ai-recruitment-copilot/src/server/app.ts` — 把 `joinRouter` 挂到 `apiRoutes`

**前端**

- 新建 `apps/ai-recruitment-copilot/src/app/join/[code]/page.tsx`（Server Component）
- 新建 `apps/ai-recruitment-copilot/src/app/join/[code]/_components/invalid-join-link.tsx`
- 新建 `apps/ai-recruitment-copilot/src/app/join/[code]/_components/join-client.tsx`
- 新建 `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/members/_components/invite-links-dialog.tsx`
- 修改 `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/members/_components/members-management-page.tsx` — 在 `<InviteDialog>` 旁加 `<InviteLinksDialog>`

---

## Task 1: Schema — 新增表 + member 加列

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Modify: `packages/db-schema/src/relations.ts`

- [ ] **Step 1: 在 schema.ts 新增 `workspaceInviteLink` 表**

在 `member` 表定义之后、`invitation` 表之前，新增以下定义（与现有表风格一致，alphabetic 字段顺序）：

```ts
export const workspaceInviteLink = pgTable(
  "workspace_invite_link",
  {
    code: text("code").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    disabledAt: timestamp("disabled_at"),
    disabledBy: text("disabled_by").references(() => user.id, { onDelete: "set null" }),
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
  },
  (table) => [index("workspace_invite_link_org_idx").on(table.organizationId, table.disabledAt)],
);
```

- [ ] **Step 2: 给 `member` 表加 `inviteLinkId` 列**

在 `member` pgTable 的字段对象中，**新增**一行（保持 alphabetic 顺序，放在 `id` 之后或就近）：

```ts
inviteLinkId: text("invite_link_id").references(
  () => workspaceInviteLink.id,
  { onDelete: "set null" },
),
```

> 注意：由于 drizzle 解析引用是 lazy 的，`member` 引用了 `workspaceInviteLink`、`workspaceInviteLink` 又引用了 `user` —— 不会循环错。如果 oxlint 报 `no-use-before-define`，参考 `studioInterview.jobDescriptionId` 的写法在该行上方加 `// oxlint-disable-next-line no-use-before-define -- drizzle-orm resolves refs lazily at runtime`。

- [ ] **Step 3: relations.ts 新增 inviteLink 关系**

在 `relations.ts` 的 `defineRelations` 块中，按字母序找到位置插入：

```ts
workspaceInviteLink: {
  creator: r.one.user({
    from: r.workspaceInviteLink.createdBy,
    to: r.user.id,
  }),
  disabler: r.one.user({
    from: r.workspaceInviteLink.disabledBy,
    to: r.user.id,
  }),
  members: r.many.member(),
  organization: r.one.organization({
    from: r.workspaceInviteLink.organizationId,
    to: r.organization.id,
  }),
},
```

并在 `member` 关系块中追加：

```ts
inviteLink: r.one.workspaceInviteLink({
  from: r.member.inviteLinkId,
  to: r.workspaceInviteLink.id,
}),
```

- [ ] **Step 4: typecheck 通过**

```
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: PASS。如有未导出引用错误，确认 `workspaceInviteLink` 命名与 schema 一致。

- [ ] **Step 5: Commit**

```
git add packages/db-schema/src/schema.ts packages/db-schema/src/relations.ts
git commit -m "feat(db): add workspace_invite_link table and member.invite_link_id"
```

---

## Task 2: 生成并应用迁移

**Files:**

- Create: `apps/ai-recruitment-copilot/drizzle/<timestamp>_<name>.sql`（由 drizzle-kit 自动生成）

- [ ] **Step 1: 生成 SQL**

```
pnpm db:generate
```

Expected: drizzle 在 `apps/ai-recruitment-copilot/drizzle/` 下新增一份 SQL，包含 `CREATE TABLE workspace_invite_link`、`ALTER TABLE member ADD COLUMN invite_link_id`、相关索引和外键。

- [ ] **Step 2: 检查 SQL 内容合理**

```
ls -lt apps/ai-recruitment-copilot/drizzle/ | head -5
```

打开最新的 .sql 文件确认：含 CREATE TABLE workspace_invite_link、ALTER TABLE member、`workspace_invite_link_code_unique` unique 索引、`workspace_invite_link_org_idx`、外键 `member_invite_link_id_workspace_invite_link_id_fk`。如内容明显不对（漏列、表名错），回 Task 1 修 schema 再重新生成。

- [ ] **Step 3: 跑迁移**

```
pnpm db:migrate
```

Expected: 无错误，表/列生效。

- [ ] **Step 4: 验证 DB**

```
pnpm --filter @arc/ai-recruitment-copilot exec psql "$DATABASE_URL" -c "\d workspace_invite_link"
```

Expected: 看到 7 列（code/created_at/created_by/disabled_at/disabled_by/id/organization_id）+ unique on code + 索引。

- [ ] **Step 5: Commit**

```
git add apps/ai-recruitment-copilot/drizzle/
git commit -m "feat(db): migration for workspace invite links"
```

---

## Task 3: invite-links DAO + 测试

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/dao.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts`

- [ ] **Step 1: 先写测试**

```ts
// apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, user, workspaceInviteLink } from "@arc/db-schema/schema";
import {
  createInviteLink,
  disableInviteLink,
  findActiveLinkByCode,
  listInviteLinks,
  listLinkMembers,
} from "../dao";

const ORG = "test_invite_link_org";
const ADMIN = "test_invite_link_admin";
const JOINER = "test_invite_link_joiner";

async function clean() {
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, ADMIN));
  await db.delete(user).where(eq(user.id, JOINER));
}

describe("invite-links dao", () => {
  beforeAll(async () => {
    await clean();
  });

  beforeEach(async () => {
    await db.insert(user).values([
      {
        createdAt: new Date(),
        email: "admin@test.local",
        emailVerified: true,
        id: ADMIN,
        name: "Admin",
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        email: "joiner@test.local",
        emailVerified: true,
        id: JOINER,
        name: "Joiner",
        updatedAt: new Date(),
      },
    ]);
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORG,
      name: "Test Org",
      slug: "test-invite-org",
    });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_admin",
      organizationId: ORG,
      role: "owner",
      userId: ADMIN,
    });
  });

  afterEach(clean);

  it("creates a link with a 16-char base62 code", async () => {
    const link = await createInviteLink({ organizationId: ORG, createdBy: ADMIN });
    expect(link.code).toMatch(/^[0-9A-Za-z]{16}$/);
    expect(link.disabledAt).toBeNull();
    expect(link.organizationId).toBe(ORG);
  });

  it("finds active link by code, returns null for disabled", async () => {
    const link = await createInviteLink({ organizationId: ORG, createdBy: ADMIN });
    const hit = await findActiveLinkByCode(link.code);
    expect(hit?.id).toBe(link.id);
    await disableInviteLink({ id: link.id, organizationId: ORG, disabledBy: ADMIN });
    expect(await findActiveLinkByCode(link.code)).toBeNull();
  });

  it("disable is idempotent — second call doesn't change disabledAt", async () => {
    const link = await createInviteLink({ organizationId: ORG, createdBy: ADMIN });
    const first = await disableInviteLink({ id: link.id, organizationId: ORG, disabledBy: ADMIN });
    const second = await disableInviteLink({ id: link.id, organizationId: ORG, disabledBy: ADMIN });
    expect(first?.disabledAt?.getTime()).toBe(second?.disabledAt?.getTime());
  });

  it("listInviteLinks returns joinedCount", async () => {
    const link = await createInviteLink({ organizationId: ORG, createdBy: ADMIN });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_joiner",
      inviteLinkId: link.id,
      organizationId: ORG,
      role: "hr",
      userId: JOINER,
    });
    const list = await listInviteLinks(ORG);
    expect(list).toHaveLength(1);
    expect(list[0]?.joinedCount).toBe(1);
  });

  it("listLinkMembers returns joined users", async () => {
    const link = await createInviteLink({ organizationId: ORG, createdBy: ADMIN });
    await db.insert(member).values({
      createdAt: new Date(),
      id: "m_joiner",
      inviteLinkId: link.id,
      organizationId: ORG,
      role: "hr",
      userId: JOINER,
    });
    const rows = await listLinkMembers({ id: link.id, organizationId: ORG });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("joiner@test.local");
  });
});
```

- [ ] **Step 2: 跑测试，确认全部 fail**

```
pnpm --filter @arc/ai-recruitment-copilot test src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts
```

Expected: 5 个 case 全部 FAIL，错误为模块不存在 `Cannot find module '../dao'`。

- [ ] **Step 3: 实现 DAO**

```ts
// apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/dao.ts
import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { db } from "@/lib/server/db";
import { member, user, workspaceInviteLink } from "@arc/db-schema/schema";

// 16 字符 base62 ≈ 95 bit 熵，碰撞概率忽略不计。
const generateCode = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  16,
);

export interface InviteLinkRow {
  id: string;
  code: string;
  organizationId: string;
  createdBy: string | null;
  createdAt: Date;
  disabledAt: Date | null;
  disabledBy: string | null;
}

export interface InviteLinkListRow extends InviteLinkRow {
  creatorName: string | null;
  joinedCount: number;
}

export interface CreateInviteLinkInput {
  organizationId: string;
  createdBy: string;
}

export async function createInviteLink(input: CreateInviteLinkInput): Promise<InviteLinkRow> {
  // 唯一冲突极不可能，但仍然重试一次兜底。
  for (let attempt = 0; attempt < 2; attempt++) {
    const id = `wil_${generateCode()}`;
    const code = generateCode();
    try {
      const [row] = await db
        .insert(workspaceInviteLink)
        .values({
          code,
          createdBy: input.createdBy,
          id,
          organizationId: input.organizationId,
        })
        .returning();
      if (row) return row;
    } catch (err) {
      if (attempt === 1) throw err;
    }
  }
  throw new Error("Failed to allocate invite link code after retry");
}

export async function findActiveLinkByCode(code: string): Promise<InviteLinkRow | null> {
  const row = await db.query.workspaceInviteLink.findFirst({
    where: { code, disabledAt: { isNull: true } },
  });
  return row ?? null;
}

export interface DisableInviteLinkInput {
  id: string;
  organizationId: string;
  disabledBy: string;
}

export async function disableInviteLink(
  input: DisableInviteLinkInput,
): Promise<InviteLinkRow | null> {
  // 幂等：已禁用直接读出来返回，不更新。
  const existing = await db.query.workspaceInviteLink.findFirst({
    where: { id: input.id, organizationId: input.organizationId },
  });
  if (!existing) return null;
  if (existing.disabledAt) return existing;
  const [row] = await db
    .update(workspaceInviteLink)
    .set({ disabledAt: new Date(), disabledBy: input.disabledBy })
    .where(
      and(
        eq(workspaceInviteLink.id, input.id),
        eq(workspaceInviteLink.organizationId, input.organizationId),
        isNull(workspaceInviteLink.disabledAt),
      ),
    )
    .returning();
  return row ?? existing;
}

export async function listInviteLinks(organizationId: string): Promise<InviteLinkListRow[]> {
  // 一次 SQL：LEFT JOIN member 上聚合 joinedCount + creator 名字。
  const rows = await db
    .select({
      code: workspaceInviteLink.code,
      createdAt: workspaceInviteLink.createdAt,
      createdBy: workspaceInviteLink.createdBy,
      creatorName: user.name,
      disabledAt: workspaceInviteLink.disabledAt,
      disabledBy: workspaceInviteLink.disabledBy,
      id: workspaceInviteLink.id,
      joinedCount: sql<number>`COUNT(${member.id})::int`.as("joined_count"),
      organizationId: workspaceInviteLink.organizationId,
    })
    .from(workspaceInviteLink)
    .leftJoin(member, eq(member.inviteLinkId, workspaceInviteLink.id))
    .leftJoin(user, eq(user.id, workspaceInviteLink.createdBy))
    .where(eq(workspaceInviteLink.organizationId, organizationId))
    .groupBy(workspaceInviteLink.id, user.name)
    .orderBy(desc(workspaceInviteLink.createdAt));
  return rows;
}

export interface LinkMemberRow {
  userId: string;
  name: string;
  email: string;
  joinedAt: Date;
}

export async function listLinkMembers(input: {
  id: string;
  organizationId: string;
}): Promise<LinkMemberRow[]> {
  const rows = await db
    .select({
      email: user.email,
      joinedAt: member.createdAt,
      name: user.name,
      userId: user.id,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, input.organizationId), eq(member.inviteLinkId, input.id)))
    .orderBy(desc(member.createdAt));
  return rows;
}
```

- [ ] **Step 4: 跑测试，确认全部 pass**

```
pnpm --filter @arc/ai-recruitment-copilot test src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts
```

Expected: 5/5 PASS。

- [ ] **Step 5: Commit**

```
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/dao.ts \
        apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/__tests__/dao.test.ts
git commit -m "feat(server): invite-links dao with create/disable/list"
```

---

## Task 4: invite-links 路由 + 挂载

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/schema.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/route.ts`
- Modify: `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/route.ts`

- [ ] **Step 1: schema.ts**

```ts
// apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/schema.ts
import { z } from "zod";

export const inviteLinkIdParamsSchema = z.object({
  id: z.string().min(1, "缺少链接 id。"),
});
```

- [ ] **Step 2: route.ts**

```ts
// apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/route.ts
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { createInviteLink, disableInviteLink, listInviteLinks, listLinkMembers } from "./dao";
import { inviteLinkIdParamsSchema } from "./schema";

export const inviteLinksRouter = factory
  .createApp()
  .use("*", requirePermission("invitation", "create"))
  .get("/", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await listInviteLinks(activeOrg.id);
    return c.json(
      {
        links: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          disabledAt: r.disabledAt?.toISOString() ?? null,
        })),
      },
      200,
    );
  })
  .post("/", async (c) => {
    const { activeOrg, user } = c.var;
    if (!(activeOrg && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const link = await createInviteLink({
      createdBy: user.id,
      organizationId: activeOrg.id,
    });
    return c.json(
      {
        ...link,
        createdAt: link.createdAt.toISOString(),
        disabledAt: link.disabledAt?.toISOString() ?? null,
      },
      200,
    );
  })
  .patch(
    "/:id/disable",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const link = await disableInviteLink({
        disabledBy: user.id,
        id,
        organizationId: activeOrg.id,
      });
      if (!link) {
        return c.json({ error: "链接不存在或不属于当前工作区。" }, 404);
      }
      return c.json(
        {
          ...link,
          createdAt: link.createdAt.toISOString(),
          disabledAt: link.disabledAt?.toISOString() ?? null,
        },
        200,
      );
    },
  )
  .get(
    "/:id/members",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const rows = await listLinkMembers({ id, organizationId: activeOrg.id });
      return c.json(
        {
          members: rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() })),
        },
        200,
      );
    },
  );
```

> 注意：`c.var.activeOrg` 和 `c.var.user` 由 `workspaceMiddleware` 与 `betterAuthMiddleware` 注入（已在 `studioRouter` 与 `app.ts` 配齐），子路由无需重复声明。

- [ ] **Step 3: 挂到 workspace router**

修改 `apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/route.ts`，在文件顶部 import 区加：

```ts
import { inviteLinksRouter } from "./routes/invite-links/route";
```

并把现有 `workspaceRouter` 链式调用改为：

```ts
export const workspaceRouter = factory
  .createApp()
  .route("/invite-links", inviteLinksRouter)
  .get("/member-last-actives", async (c) => {
    /* 原代码 */
  })
  .patch(
    "/",
    /* 原代码 */
  );
```

> `.route()` 必须在其他 `.get/.patch` 链调用之前，否则 hc 类型推断会缺少子路由。

- [ ] **Step 4: typecheck**

```
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: PASS。

- [ ] **Step 5: Commit**

```
git add apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/route.ts \
        apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/routes/invite-links/schema.ts \
        apps/ai-recruitment-copilot/src/server/routes/studio/routes/workspace/route.ts
git commit -m "feat(server): invite-links router under workspace"
```

---

## Task 5: join DAO + 测试

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/join/dao.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/join/__tests__/dao.test.ts`

- [ ] **Step 1: 先写测试**

```ts
// apps/ai-recruitment-copilot/src/server/routes/join/__tests__/dao.test.ts
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, user, workspaceInviteLink } from "@arc/db-schema/schema";
import { acceptInviteLink, getJoinPreview } from "../dao";

const ORG = "test_join_org";
const OWNER = "test_join_owner";
const JOINER = "test_join_joiner";

async function clean() {
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, OWNER));
  await db.delete(user).where(eq(user.id, JOINER));
}

async function seedLink(opts: { disabled?: boolean } = {}) {
  await db.insert(user).values([
    {
      createdAt: new Date(),
      email: "owner@test.local",
      emailVerified: true,
      id: OWNER,
      name: "Owner",
      updatedAt: new Date(),
    },
    {
      createdAt: new Date(),
      email: "joiner@test.local",
      emailVerified: true,
      id: JOINER,
      name: "Joiner",
      updatedAt: new Date(),
    },
  ]);
  await db.insert(organization).values({
    createdAt: new Date(),
    id: ORG,
    logo: null,
    name: "Test Org",
    slug: "test-join-org",
  });
  await db.insert(member).values({
    createdAt: new Date(),
    id: "m_owner",
    organizationId: ORG,
    role: "owner",
    userId: OWNER,
  });
  await db.insert(workspaceInviteLink).values({
    code: "TESTCODE12345678",
    createdBy: OWNER,
    disabledAt: opts.disabled ? new Date() : null,
    id: "wil_test",
    organizationId: ORG,
  });
}

describe("join dao", () => {
  beforeEach(clean);
  afterEach(clean);

  it("getJoinPreview returns valid + workspace info for active link", async () => {
    await seedLink();
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: null });
    expect(preview.valid).toBe(true);
    expect(preview.workspace?.slug).toBe("test-join-org");
    expect(preview.alreadyMember).toBe(false);
  });

  it("getJoinPreview returns invalid for disabled link", async () => {
    await seedLink({ disabled: true });
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: null });
    expect(preview.valid).toBe(false);
    expect(preview.workspace).toBeUndefined();
  });

  it("getJoinPreview returns alreadyMember=true for existing member", async () => {
    await seedLink();
    // owner 已经是 member 了
    const preview = await getJoinPreview({ code: "TESTCODE12345678", userId: OWNER });
    expect(preview.valid).toBe(true);
    expect(preview.alreadyMember).toBe(true);
  });

  it("acceptInviteLink inserts member with role=hr and inviteLinkId", async () => {
    await seedLink();
    const result = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    expect(result.status).toBe("joined");
    expect(result.organizationId).toBe(ORG);
    const row = await db.query.member.findFirst({
      where: { userId: JOINER, organizationId: ORG },
    });
    expect(row?.role).toBe("hr");
    expect(row?.inviteLinkId).toBe("wil_test");
  });

  it("acceptInviteLink is idempotent for existing member", async () => {
    await seedLink();
    const first = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    const second = await acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER });
    expect(first.status).toBe("joined");
    expect(second.status).toBe("already_member");
    expect(second.organizationId).toBe(ORG);
  });

  it("acceptInviteLink rejects disabled link", async () => {
    await seedLink({ disabled: true });
    await expect(
      acceptInviteLink({ code: "TESTCODE12345678", userId: JOINER }),
    ).rejects.toMatchObject({ code: "link_invalid" });
  });
});
```

- [ ] **Step 2: 跑测试确认 fail**

```
pnpm --filter @arc/ai-recruitment-copilot test src/server/routes/join/__tests__/dao.test.ts
```

Expected: FAIL — `Cannot find module '../dao'`.

- [ ] **Step 3: 实现 DAO**

```ts
// apps/ai-recruitment-copilot/src/server/routes/join/dao.ts
import "server-only";

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/lib/server/db";
import { member, organization, workspaceInviteLink } from "@arc/db-schema/schema";

export interface JoinPreview {
  valid: boolean;
  workspace?: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  };
  alreadyMember?: boolean;
}

export async function getJoinPreview(input: {
  code: string;
  userId: string | null;
}): Promise<JoinPreview> {
  const link = await db.query.workspaceInviteLink.findFirst({
    where: { code: input.code, disabledAt: { isNull: true } },
  });
  if (!link) return { valid: false };
  const org = await db.query.organization.findFirst({
    where: { id: link.organizationId },
  });
  if (!org) return { valid: false };
  let alreadyMember = false;
  if (input.userId) {
    const m = await db.query.member.findFirst({
      where: { userId: input.userId, organizationId: org.id },
    });
    alreadyMember = Boolean(m);
  }
  return {
    alreadyMember,
    valid: true,
    workspace: { id: org.id, logo: org.logo, name: org.name, slug: org.slug },
  };
}

export class JoinError extends Error {
  constructor(public code: "link_invalid") {
    super(code);
  }
}

export interface AcceptResult {
  status: "joined" | "already_member";
  organizationId: string;
  organizationSlug: string;
}

export async function acceptInviteLink(input: {
  code: string;
  userId: string;
}): Promise<AcceptResult> {
  return await db.transaction(async (tx) => {
    const link = await tx.query.workspaceInviteLink.findFirst({
      where: { code: input.code, disabledAt: { isNull: true } },
    });
    if (!link) throw new JoinError("link_invalid");

    const org = await tx.query.organization.findFirst({
      where: { id: link.organizationId },
    });
    if (!org) throw new JoinError("link_invalid");

    const existing = await tx.query.member.findFirst({
      where: { userId: input.userId, organizationId: org.id },
    });
    if (existing) {
      return {
        organizationId: org.id,
        organizationSlug: org.slug,
        status: "already_member" as const,
      };
    }

    try {
      await tx.insert(member).values({
        createdAt: new Date(),
        id: `mem_${nanoid(16)}`,
        inviteLinkId: link.id,
        organizationId: org.id,
        role: "hr",
        userId: input.userId,
      });
    } catch (err) {
      // member_user_org_uq 兜底：并发场景下另一个请求已插入。
      const again = await tx.query.member.findFirst({
        where: { userId: input.userId, organizationId: org.id },
      });
      if (again) {
        return {
          organizationId: org.id,
          organizationSlug: org.slug,
          status: "already_member" as const,
        };
      }
      throw err;
    }
    return {
      organizationId: org.id,
      organizationSlug: org.slug,
      status: "joined" as const,
    };
  });
}
```

- [ ] **Step 4: 跑测试确认 pass**

```
pnpm --filter @arc/ai-recruitment-copilot test src/server/routes/join/__tests__/dao.test.ts
```

Expected: 6/6 PASS。

- [ ] **Step 5: Commit**

```
git add apps/ai-recruitment-copilot/src/server/routes/join/dao.ts \
        apps/ai-recruitment-copilot/src/server/routes/join/__tests__/dao.test.ts
git commit -m "feat(server): join dao with preview and accept"
```

---

## Task 6: join 路由 + 挂载

**Files:**

- Create: `apps/ai-recruitment-copilot/src/server/routes/join/schema.ts`
- Create: `apps/ai-recruitment-copilot/src/server/routes/join/route.ts`
- Modify: `apps/ai-recruitment-copilot/src/server/app.ts`

- [ ] **Step 1: schema.ts**

```ts
// apps/ai-recruitment-copilot/src/server/routes/join/schema.ts
import { z } from "zod";

export const codeParamsSchema = z.object({
  code: z.string().regex(/^[0-9A-Za-z]{16}$/u, "邀请码格式不正确。"),
});
```

- [ ] **Step 2: route.ts**

```ts
// apps/ai-recruitment-copilot/src/server/routes/join/route.ts
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@/server/factory";
import { acceptInviteLink, getJoinPreview, JoinError } from "./dao";
import { codeParamsSchema } from "./schema";

export const joinRouter = factory
  .createApp()
  .get(
    "/:code/preview",
    zValidator("param", codeParamsSchema, jsonValidatorError("邀请码格式不正确。")),
    async (c) => {
      const { code } = c.req.valid("param");
      const userId = c.var.user?.id ?? null;
      const preview = await getJoinPreview({ code, userId });
      return c.json(preview, 200);
    },
  )
  .post(
    "/:code/accept",
    zValidator("param", codeParamsSchema, jsonValidatorError("邀请码格式不正确。")),
    async (c) => {
      const { user } = c.var;
      if (!user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { code } = c.req.valid("param");
      try {
        const result = await acceptInviteLink({ code, userId: user.id });
        return c.json(result, 200);
      } catch (err) {
        if (err instanceof JoinError) {
          return c.json({ error: "邀请链接已失效或不存在。" }, 410);
        }
        throw err;
      }
    },
  );
```

- [ ] **Step 3: 在 app.ts 挂载**

修改 `apps/ai-recruitment-copilot/src/server/app.ts`，在 imports 加：

```ts
import { joinRouter } from "./routes/join/route";
```

在 `apiRoutes` 链上加 `.route("/join", joinRouter)`（紧跟其它 route 即可）：

```ts
const apiRoutes = factory
  .createApp()
  .route("/", feishuRouter)
  .route("/agent", agentRouter)
  .route("/livekit", livekitRouter)
  .route("/resume", resumeRouter)
  .route("/interview", interviewRouter)
  .route("/platform", platformRouter)
  .route("/join", joinRouter)
  .route("/w/:slug/studio", studioRouter)
  .route("/w/:slug/chat", chatRouter);
```

- [ ] **Step 4: 写 route 集成测试（可选但推荐）**

```ts
// apps/ai-recruitment-copilot/src/server/routes/join/__tests__/route.test.ts
import { testClient } from "hono/testing";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, user, workspaceInviteLink } from "@arc/db-schema/schema";
import { factory } from "@/server/factory";
import { joinRouter } from "../route";

const app = factory.createApp().route("/join", joinRouter);
const client = testClient(app);

const ORG = "test_join_route_org";

async function clean() {
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(workspaceInviteLink).where(eq(workspaceInviteLink.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
}

describe("/join route", () => {
  beforeEach(async () => {
    await clean();
    await db.insert(organization).values({
      createdAt: new Date(),
      id: ORG,
      name: "Test",
      slug: "test-join-route",
    });
    await db.insert(workspaceInviteLink).values({
      code: "ROUTECODE1234567",
      createdBy: null,
      id: "wil_route",
      organizationId: ORG,
    });
  });
  afterEach(clean);

  it("GET /:code/preview returns valid=true for active link", async () => {
    const res = await client.join[":code"].preview.$get({
      param: { code: "ROUTECODE1234567" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
  });

  it("GET /:code/preview returns valid=false for unknown code", async () => {
    const res = await client.join[":code"].preview.$get({
      param: { code: "UNKNOWNCODE12345" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(false);
  });

  it("POST /:code/accept returns 401 when not authenticated", async () => {
    const res = await client.join[":code"].accept.$post({
      param: { code: "ROUTECODE1234567" },
    });
    expect(res.status).toBe(401);
  });
});
```

> 注意：accept 的"已登录加入"路径已在 dao.test.ts 全覆盖，这里只 smoke-test 路由布线。`c.var.user` 在裸路由测试里为 undefined，所以 accept 必然 401，符合预期。

- [ ] **Step 5: 跑测试 + typecheck**

```
pnpm --filter @arc/ai-recruitment-copilot test src/server/routes/join/
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: 3/3 PASS + typecheck PASS。

- [ ] **Step 6: Commit**

```
git add apps/ai-recruitment-copilot/src/server/routes/join/ \
        apps/ai-recruitment-copilot/src/server/app.ts
git commit -m "feat(server): mount /api/join router"
```

---

## Task 7: 前端 — join 页（Server Component）+ 失效组件 + Client 确认

**Files:**

- Create: `apps/ai-recruitment-copilot/src/app/join/[code]/page.tsx`
- Create: `apps/ai-recruitment-copilot/src/app/join/[code]/_components/invalid-join-link.tsx`
- Create: `apps/ai-recruitment-copilot/src/app/join/[code]/_components/join-client.tsx`

- [ ] **Step 1: 失效组件**

```tsx
// apps/ai-recruitment-copilot/src/app/join/[code]/_components/invalid-join-link.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function InvalidJoinLink() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">邀请链接已失效</h1>
      <p className="mb-6 text-muted-foreground">
        该邀请链接不存在或已被工作区管理员禁用。请联系邀请人确认。
      </p>
      <Button asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 页面 (Server Component)**

```tsx
// apps/ai-recruitment-copilot/src/app/join/[code]/page.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";
import { getJoinPreview } from "@/server/routes/join/dao";
import { InvalidJoinLink } from "./_components/invalid-join-link";
import { JoinClient } from "./_components/join-client";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { code } = await params;
  // 16 字符 base62 校验，避免奇怪输入打 DB。
  if (!/^[0-9A-Za-z]{16}$/u.test(code)) {
    return <InvalidJoinLink />;
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id ?? null;
  const preview = await getJoinPreview({ code, userId });

  if (!preview.valid || !preview.workspace) {
    return <InvalidJoinLink />;
  }

  if (!userId) {
    // 未登录:跳 OAuth,登录后回 /join/<code>
    redirect(`/login?returnTo=${encodeURIComponent(`/join/${code}`)}`);
  }

  if (preview.alreadyMember) {
    // 已是成员:把 active org 切到该工作区然后跳到 chat
    await auth.api.setActiveOrganization({
      body: { organizationId: preview.workspace.id },
      headers: await headers(),
    });
    redirect("/?goto=chat");
  }

  return <JoinClient code={code} workspace={preview.workspace} />;
}
```

> Server-side `setActiveOrganization`：Better Auth `organization` 插件提供该方法，与 client-side `authClient.organization.setActive` 等价；在 RSC 中改 active org 必须用这个 API（headers 必须传以便写回 cookie）。如果 typecheck 报方法不存在，看下 better-auth 文档或 `auth.api` 上是否叫别的名字（例如 `setActiveOrganization` 的具体路径）。

- [ ] **Step 3: Client 确认组件**

```tsx
// apps/ai-recruitment-copilot/src/app/join/[code]/_components/join-client.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { authClient } from "@/lib/shared/auth-client";

interface JoinClientProps {
  code: string;
  workspace: { id: string; name: string; slug: string; logo: string | null };
}

export function JoinClient({ code, workspace }: JoinClientProps) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);

  async function onAccept() {
    setAccepting(true);
    try {
      const result = await rpcFetch<{
        organizationId: string;
        organizationSlug: string;
        status: "joined" | "already_member";
      }>(rpc.api.join[":code"].accept.$post({ param: { code } }), "加入工作区失败");
      await authClient.organization.setActive({ organizationId: result.organizationId });
      router.push("/?goto=chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "加入工作区失败");
      setAccepting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="mb-4 text-2xl font-semibold">加入工作区</h1>
      <p className="mb-6 text-muted-foreground">
        你被邀请加入工作区「{workspace.name}」。加入后默认为 HR 角色，可由管理员调整。
      </p>
      <div className="flex gap-2">
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "处理中..." : "加入工作区"}
        </Button>
        <Button disabled={accepting} onClick={() => router.push("/")} variant="outline">
          取消
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: typecheck + 启动 dev 手动验证 SSR 路径**

```
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot dev
```

在浏览器手动访问 `http://localhost:3000/join/AAAAAAAAAAAAAAAA`（不存在的 code）：应渲染 "邀请链接已失效"。`auth.api.setActiveOrganization` 的具体方法名若不存在编译会报错——按报错调整为 better-auth 实际暴露的方法路径（如 `auth.api.organization.setActive` 之类，参考 `apps/.../src/lib/server/auth.ts` 里现有 `auth.api.*` 使用）。

- [ ] **Step 5: Commit**

```
git add apps/ai-recruitment-copilot/src/app/join/
git commit -m "feat(web): add /join/[code] page with confirm UI and invalid fallback"
```

---

## Task 8: 前端 — InviteLinksDialog 组件

**Files:**

- Create: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/members/_components/invite-links-dialog.tsx`

- [ ] **Step 1: 写组件**

```tsx
// apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/members/_components/invite-links-dialog.tsx
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon, LinkIcon, PowerOffIcon, UsersIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { TimeDisplay } from "@/components/time-display";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface InviteLinkDto {
  id: string;
  code: string;
  createdAt: string;
  createdBy: string | null;
  creatorName: string | null;
  disabledAt: string | null;
  joinedCount: number;
}

interface LinkMemberDto {
  userId: string;
  name: string;
  email: string;
  joinedAt: string;
}

const QUERY_KEY = (slug: string) => ["invite-links", slug] as const;

export function InviteLinksDialog() {
  const [open, setOpen] = useState(false);
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: linksData, isPending } = useQuery({
    enabled: open,
    queryFn: () =>
      rpcFetch<{ links: InviteLinkDto[] }>(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$get({ param: { slug } }),
        "加载邀请链接失败",
      ),
    queryKey: QUERY_KEY(slug),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"].$post({ param: { slug } }),
        "生成邀请链接失败",
      ),
    onSuccess: async (link) => {
      const url = `${window.location.origin}/join/${link.code}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success(`邀请链接已生成并复制：${url}`);
      } catch {
        toast.success(`邀请链接已生成：${url}`);
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "生成失败"),
  });

  const disableMutation = useMutation({
    mutationFn: (id: string) =>
      rpcFetch<InviteLinkDto>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].disable.$patch({
          param: { id, slug },
        }),
        "禁用失败",
      ),
    onSuccess: () => {
      toast.success("已禁用");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY(slug) });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "禁用失败"),
  });

  async function copyUrl(code: string) {
    const url = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("已复制链接");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LinkIcon /> 邀请链接
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>共享邀请链接</DialogTitle>
          <DialogDescription>
            生成的链接可重复使用、永不过期；任何打开链接的用户登录后会以 HR 角色加入工作区。
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button disabled={createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? <Spinner /> : null}
            生成新链接
          </Button>
        </div>

        {isPending ? (
          <div className="py-8 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="space-y-2">
            {(linksData?.links ?? []).length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">还没有邀请链接</div>
            ) : (
              (linksData?.links ?? []).map((link) => (
                <LinkRow
                  key={link.id}
                  expanded={expandedId === link.id}
                  link={link}
                  onCopy={() => copyUrl(link.code)}
                  onDisable={() => disableMutation.mutate(link.id)}
                  onToggleExpand={() => setExpandedId((cur) => (cur === link.id ? null : link.id))}
                  slug={slug}
                />
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface LinkRowProps {
  link: InviteLinkDto;
  expanded: boolean;
  slug: string;
  onCopy: () => void;
  onDisable: () => void;
  onToggleExpand: () => void;
}

function LinkRow({ link, expanded, slug, onCopy, onDisable, onToggleExpand }: LinkRowProps) {
  const url =
    typeof window === "undefined"
      ? `/join/${link.code}`
      : `${window.location.origin}/join/${link.code}`;
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-sm">{url}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {link.creatorName ?? "已删除用户"} · <TimeDisplay value={link.createdAt} />
            {link.disabledAt ? " · 已禁用" : ""}
          </div>
        </div>
        <Button onClick={onCopy} size="sm" variant="ghost">
          <CopyIcon />
        </Button>
        <Button onClick={onToggleExpand} size="sm" variant="ghost">
          <UsersIcon /> {link.joinedCount}
        </Button>
        {link.disabledAt ? null : (
          <Button onClick={onDisable} size="sm" variant="ghost">
            <PowerOffIcon />
          </Button>
        )}
      </div>
      {expanded ? <LinkMembers id={link.id} slug={slug} /> : null}
    </div>
  );
}

function LinkMembers({ id, slug }: { id: string; slug: string }) {
  const { data, isPending } = useQuery({
    queryFn: () =>
      rpcFetch<{ members: LinkMemberDto[] }>(
        rpc.api.w[":slug"].studio.workspace["invite-links"][":id"].members.$get({
          param: { id, slug },
        }),
        "加载成员失败",
      ),
    queryKey: ["invite-link-members", slug, id],
  });

  if (isPending) {
    return <div className="mt-3 text-xs text-muted-foreground">加载中...</div>;
  }
  const members = data?.members ?? [];
  if (members.length === 0) {
    return <div className="mt-3 text-xs text-muted-foreground">尚无成员通过此链接加入</div>;
  }
  return (
    <ul className="mt-3 space-y-1 text-xs">
      {members.map((m) => (
        <li className="flex justify-between" key={m.userId}>
          <span>
            {m.name} <span className="text-muted-foreground">({m.email})</span>
          </span>
          <TimeDisplay value={m.joinedAt} />
        </li>
      ))}
    </ul>
  );
}
```

> 如果 hc 推断不出 `rpc.api.w[":slug"].studio.workspace["invite-links"]` 路径，回 Task 4 step 3 确认 `.route("/invite-links", inviteLinksRouter)` 写在了其它 `.get`/`.patch` **之前**。

- [ ] **Step 2: typecheck**

```
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

Expected: PASS。

- [ ] **Step 3: Commit**

```
git add apps/ai-recruitment-copilot/src/app/\(auth\)/w/\[slug\]/studio/members/_components/invite-links-dialog.tsx
git commit -m "feat(web): InviteLinksDialog with create/list/disable/expand"
```

---

## Task 9: 把 InviteLinksDialog 接入成员页

**Files:**

- Modify: `apps/ai-recruitment-copilot/src/app/(auth)/w/[slug]/studio/members/_components/members-management-page.tsx`

- [ ] **Step 1: 导入并放在 InviteDialog 旁**

在 `members-management-page.tsx` 顶部 import 区加：

```ts
import { InviteLinksDialog } from "./invite-links-dialog";
```

在 JSX 中找到现 `<InviteDialog />` 的位置（搜 `InviteDialog`），在其周围（同一 `<PermissionGate>` 内部，紧邻该组件）加一个 `<InviteLinksDialog />`。例如：

```tsx
<PermissionGate resource="invitation" action="create">
  <InviteDialog />
  <InviteLinksDialog />
</PermissionGate>
```

（若 `<InviteDialog />` 没在 `PermissionGate` 内部，按现有结构紧贴它放就行；hr 永远不会渲染到这里，因为父结构已经 gate 了"邀请"按钮区域。如果不确定父结构，看 grep 结果按现有写法对齐。）

- [ ] **Step 2: typecheck + dev server 验证**

```
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot dev
```

打开 `http://localhost:3000/w/<your-slug>/studio/members`：

- 用 owner 账号登录：应看到"邀请成员"按钮旁多一个"邀请链接"按钮。
- 点"邀请链接" → Dialog 打开，列表空。
- 点"生成新链接" → toast 显示已复制 + 列表新增一行。
- 拷贝得到的 URL，匿名浏览器打开 → 跳 OAuth 登录 → 登录后回到 `/join/<code>` → 显示加入确认页 → 点加入 → 跳到 chat。
- 回 owner 浏览器，刷新 Dialog → "已加入人数" 应为 1，展开看到该用户。
- 点"禁用" → 列表状态变"已禁用"。
- 匿名浏览器再开同一链接 → 显示"邀请链接已失效"。

- [ ] **Step 3: Commit**

```
git add apps/ai-recruitment-copilot/src/app/\(auth\)/w/\[slug\]/studio/members/_components/members-management-page.tsx
git commit -m "feat(web): expose InviteLinksDialog in members page"
```

---

## Task 10: 收尾 — lint/format + 全量 typecheck + 跑测试

- [ ] **Step 1: ultracite fix**

```
pnpm fix
```

Expected: 无 error，最多有 warning。如有 unsafe lint 报错，按提示修；若涉及上面的代码片段（如 oxlint 对 `for` 循环、`{}` 解构等的偏好），用对应 rule 的 `// oxlint-disable-next-line` 注释而不是改业务逻辑。

- [ ] **Step 2: 全量 typecheck**

```
pnpm typecheck
```

Expected: PASS。

- [ ] **Step 3: 全量测试**

```
pnpm --filter @arc/ai-recruitment-copilot test
```

Expected: 全部 PASS，包括 invite-links/dao、join/dao、join/route 新测试。

- [ ] **Step 4: 提交收尾**

```
git status
```

如果 `pnpm fix` 改了任何文件：

```
git add -u
git commit -m "chore: ultracite fix for invite links"
```

否则跳过 commit。

---

## 验收复核

回到设计稿 `docs/superpowers/specs/2026-05-21-workspace-invite-links-design.md`，对照「验收清单」逐条手动走一遍。全部勾上，则功能完工。
