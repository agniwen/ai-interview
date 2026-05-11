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

async function pickDefaultOrgId(userId: string): Promise<string> {
  const rows = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return rows[0]?.organizationId ?? FALLBACK_ORG_ID;
}

export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const { user } = c.var;
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const activeOrgId =
    (c.var.session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId ??
    (await pickDefaultOrgId(user.id));

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

  const [row] = result;
  if (!row) {
    return c.json({ message: "Forbidden: not a member of this workspace" }, 403);
  }

  c.set("activeOrg", row.organization);
  c.set("member", row.member);
  return next();
});
