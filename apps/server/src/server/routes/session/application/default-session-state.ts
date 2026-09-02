import type { SessionStateDependencies } from "./session-state";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { auth } from "@server/lib/server/auth";
import { db } from "@server/lib/server/db";
import {
  member as memberTable,
  organization as organizationTable,
  user as userTable,
} from "@app/db-schema/schema";
import { computeWorkspacePermissionSnapshot } from "../../../access/workspace-permission-snapshot";
import { isNoAccessWorkspaceRole } from "../../../access/workspace-roles";

export const defaultSessionStateDependencies: SessionStateDependencies = {
  async computePermissionSnapshot(input) {
    const snapshot = await computeWorkspacePermissionSnapshot(input);
    return snapshot.statements;
  },
  isNoAccessWorkspaceRole,
  async listMemberships(userId) {
    return await db
      .select({ organizationId: memberTable.organizationId, role: memberTable.role })
      .from(memberTable)
      .where(eq(memberTable.userId, userId));
  },
  async listOrganizations(headers) {
    const organizations = await auth.api.listOrganizations({ headers });
    return organizations.map((organization) => ({
      id: organization.id,
      logo: organization.logo ?? null,
      name: organization.name,
      slug: organization.slug,
    }));
  },
  async listWaitingWorkspaces(userId) {
    return await db
      .select({
        id: organizationTable.id,
        logo: organizationTable.logo,
        name: organizationTable.name,
        organizationId: organizationTable.id,
        role: memberTable.role,
        slug: organizationTable.slug,
      })
      .from(memberTable)
      .innerJoin(organizationTable, eq(organizationTable.id, memberTable.organizationId))
      .where(eq(memberTable.userId, userId))
      .orderBy(asc(memberTable.createdAt));
  },
  async loadLastActiveOrganizationId(userId) {
    const [preference] = await db
      .select({ organizationId: userTable.lastActiveOrganizationId })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    return preference?.organizationId ?? null;
  },
  async loadMemberRole({ organizationId, userId }) {
    const currentMember = await db.query.member.findFirst({
      columns: { role: true },
      where: { organizationId, userId },
    });
    return currentMember?.role ?? null;
  },
  async updateLastActiveOrganizationId({ organizationId, userId }) {
    await db
      .update(userTable)
      .set({ lastActiveOrganizationId: organizationId })
      .where(
        and(
          eq(userTable.id, userId),
          or(
            isNull(userTable.lastActiveOrganizationId),
            ne(userTable.lastActiveOrganizationId, organizationId),
          ),
        ),
      );
  },
};
