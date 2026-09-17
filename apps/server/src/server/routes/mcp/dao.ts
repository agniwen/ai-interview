import { and, desc, eq, isNull } from "drizzle-orm";
import {
  mcpGrant,
  member,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  organization,
  user,
} from "@app/db-schema/schema";
import { db } from "../../../lib/server/db";

export async function loadMcpGrant(id: string): Promise<typeof mcpGrant.$inferSelect | null> {
  const [grant] = await db.select().from(mcpGrant).where(eq(mcpGrant.id, id)).limit(1);
  return grant ?? null;
}

export async function loadMcpMember(
  userId: string,
  organizationId: string,
): Promise<{ role: string; banned: boolean } | null> {
  const [row] = await db
    .select({ banned: user.banned, role: member.role })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function listMcpWorkspaces(userId: string) {
  const rows = await db
    .select({ id: organization.id, name: organization.name, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, userId))
    .orderBy(organization.name);
  return rows;
}

export async function loadMcpClient(
  clientId: string,
): Promise<{ clientId: string; name: string | null; disabled: boolean | null } | null> {
  const [client] = await db
    .select({
      clientId: oauthClient.clientId,
      disabled: oauthClient.disabled,
      name: oauthClient.name,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1);
  return client ?? null;
}

export async function createMcpGrant(input: typeof mcpGrant.$inferInsert) {
  await db.insert(mcpGrant).values(input);
}

export async function listMcpGrants(userId: string) {
  const rows = await db
    .select({
      clientId: mcpGrant.clientId,
      clientName: oauthClient.name,
      createdAt: mcpGrant.createdAt,
      id: mcpGrant.id,
      scopes: mcpGrant.scopes,
      workspaceName: organization.name,
    })
    .from(mcpGrant)
    .innerJoin(organization, eq(mcpGrant.organizationId, organization.id))
    .innerJoin(oauthClient, eq(mcpGrant.clientId, oauthClient.clientId))
    .where(and(eq(mcpGrant.userId, userId), isNull(mcpGrant.revokedAt)))
    .orderBy(desc(mcpGrant.createdAt));
  return rows;
}

export function revokeMcpGrant(id: string, userId: string) {
  return db.transaction(async (tx) => {
    const [grant] = await tx
      .update(mcpGrant)
      .set({ revokedAt: new Date() })
      .where(and(eq(mcpGrant.id, id), eq(mcpGrant.userId, userId)))
      .returning({ id: mcpGrant.id });
    if (!grant) {
      return false;
    }
    await tx
      .update(oauthRefreshToken)
      .set({ revoked: new Date() })
      .where(and(eq(oauthRefreshToken.referenceId, id), eq(oauthRefreshToken.userId, userId)));
    await tx
      .delete(oauthConsent)
      .where(and(eq(oauthConsent.referenceId, id), eq(oauthConsent.userId, userId)));
    return true;
  });
}
