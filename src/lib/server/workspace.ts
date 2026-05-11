import "server-only";

import { asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/server/db";
import { member, organization } from "@/lib/shared/db/schema";
import { getCurrentSession } from "./auth-session";

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

/**
 * 解析当前请求的活跃 workspace。
 * 与 workspaceMiddleware 使用相同的解析顺序：
 *   1. session.activeOrganizationId
 *   2. 用户最早加入的 member 行
 *   3. 兜底 'org_default'
 *
 * React cache() 保证单请求内只查一次。
 */
export const getActiveOrg = cache(async () => {
  const session = await getCurrentSession();
  if (!session?.user) {
    return null;
  }

  const activeOrgId =
    (session.session as { activeOrganizationId?: string | null } | null)?.activeOrganizationId ??
    (await pickDefaultOrgId(session.user.id));

  const [row] = await db
    .select({
      createdAt: organization.createdAt,
      id: organization.id,
      logo: organization.logo,
      metadata: organization.metadata,
      name: organization.name,
      slug: organization.slug,
    })
    .from(organization)
    .where(eq(organization.id, activeOrgId))
    .limit(1);

  return row ?? null;
});
