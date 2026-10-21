import { and, eq } from "drizzle-orm";
import { member, organization, user } from "@app/db-schema/schema";
import { db } from "../../infrastructure/db/index";

export async function platformUserExists(userId: string): Promise<boolean> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  return Boolean(row);
}

export async function findPlatformWorkspace(organizationId: string) {
  const [row] = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return row ?? null;
}

export async function isPlatformWorkspaceMember({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}
