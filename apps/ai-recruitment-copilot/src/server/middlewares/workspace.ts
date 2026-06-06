import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { session as sessionTable } from "@arc/db-schema/schema";
import { factory } from "@/server/factory";

const ACTIVE_ORG_COLUMNS = {
  createdAt: true,
  id: true,
  logo: true,
  metadata: true,
  name: true,
  slug: true,
} as const;

const ACTIVE_MEMBER_COLUMNS = {
  createdAt: true,
  id: true,
  inviteLinkId: true,
  organizationId: true,
  role: true,
  userId: true,
} as const;

async function pickDefaultOrgId(userId: string): Promise<string | null> {
  const row = await db.query.member.findFirst({
    columns: { organizationId: true },
    orderBy: (m) => asc(m.createdAt),
    where: { userId },
  });
  return row?.organizationId ?? null;
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
  let activeOrgId: string | null;
  if (slug) {
    const bySlug = await db.query.organization.findFirst({
      columns: { id: true },
      where: { slug },
    });
    if (!bySlug) {
      return c.json({ message: "Workspace not found" }, 404);
    }
    activeOrgId = bySlug.id;
  } else {
    activeOrgId = c.var.session?.activeOrganizationId ?? (await pickDefaultOrgId(user.id));
  }

  if (!activeOrgId) {
    return c.json({ message: "Forbidden: no active workspace" }, 403);
  }

  const row = await db.query.member.findFirst({
    columns: ACTIVE_MEMBER_COLUMNS,
    where: { organizationId: activeOrgId, userId: user.id },
    with: {
      organization: {
        columns: ACTIVE_ORG_COLUMNS,
      },
    },
  });

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

  const { organization: activeOrg, ...activeMember } = row;
  c.set("activeOrg", activeOrg);
  c.set("member", activeMember);
  return next();
});
