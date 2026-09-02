import { db } from "@server/lib/server/db/index";
import { isNoAccessWorkspaceRole } from "../access/workspace-roles";
import { factory } from "../factory";

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

export const workspaceMiddleware = factory.createMiddleware(async (c, next) => {
  const { user } = c.var;
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const slug = c.req.param("slug");
  if (!slug) {
    return c.json({ message: "Workspace slug is required" }, 400);
  }

  const bySlug = await db.query.organization.findFirst({
    columns: { id: true },
    where: { slug },
  });
  if (!bySlug) {
    return c.json({ message: "Workspace not found" }, 404);
  }

  const row = await db.query.member.findFirst({
    columns: ACTIVE_MEMBER_COLUMNS,
    where: { organizationId: bySlug.id, userId: user.id },
    with: {
      organization: {
        columns: ACTIVE_ORG_COLUMNS,
      },
    },
  });

  if (!row) {
    return c.json({ message: "Forbidden: not a member of this workspace" }, 403);
  }

  const { organization: activeOrg, ...activeMember } = row;
  if (isNoAccessWorkspaceRole(activeMember.role)) {
    return c.json({ message: "Forbidden" }, 403);
  }
  c.set("activeOrg", activeOrg);
  c.set("member", activeMember);
  return next();
});
