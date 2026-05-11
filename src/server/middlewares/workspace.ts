import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { member, organization, session as sessionTable } from "@/lib/shared/db/schema";
import { factory } from "@/server/factory";

const FALLBACK_ORG_ID = "org_default";

async function pickDefaultOrgId(userId: string): Promise<string> {
  const [row] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt))
    .limit(1);
  return row?.organizationId ?? FALLBACK_ORG_ID;
}

export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const { user } = c.var;
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  // 解析顺序：
  // 1. URL slug (/w/:slug/* — P3 主入口)
  // 2. session.activeOrganizationId (P3 之前的入口，后兼)
  // 3. 用户最早加入的 member 行 fallback
  const slug = c.req.param("slug");
  let activeOrgId: string;
  if (slug) {
    const [bySlug] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, slug))
      .limit(1);
    if (!bySlug) {
      return c.json({ message: "Workspace not found" }, 404);
    }
    activeOrgId = bySlug.id;
  } else {
    activeOrgId = c.var.session?.activeOrganizationId ?? (await pickDefaultOrgId(user.id));
  }

  const [row] = await db
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

  if (!row) {
    return c.json({ message: "Forbidden: not a member of this workspace" }, 403);
  }

  // 如果 session 的 active_organization_id 与本次解析不一致 (例如用户走 slug 切换了 org),
  // 写回 session 让后续 auth.api.hasPermission 用同一个 org。
  if (c.var.session?.activeOrganizationId !== activeOrgId && c.var.session?.id) {
    await db
      .update(sessionTable)
      .set({ activeOrganizationId: activeOrgId })
      .where(eq(sessionTable.id, c.var.session.id));
  }

  c.set("activeOrg", row.organization);
  c.set("member", row.member);
  return next();
});
