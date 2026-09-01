import { and, eq } from "drizzle-orm";
import { db } from "../../lib/server/db/index";
import { organizationRole } from "@arc/db-schema/schema";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";

type BuiltInWorkspaceRole = "owner" | "admin" | "member" | typeof NO_ACCESS_WORKSPACE_ROLE;

const WORKSPACE_ROLE_RANK = {
  admin: 2,
  member: 1,
  noAccess: 0,
  owner: 3,
} satisfies Record<BuiltInWorkspaceRole, number>;

export function isNoAccessWorkspaceRole(role: string | null | undefined): boolean {
  return role === NO_ACCESS_WORKSPACE_ROLE;
}

function isBuiltInWorkspaceRole(role: string): role is BuiltInWorkspaceRole {
  return Object.hasOwn(WORKSPACE_ROLE_RANK, role);
}

export async function dynamicWorkspaceRoleExists(
  organizationId: string,
  role: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: organizationRole.id })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)),
    )
    .limit(1);
  return Boolean(row);
}

export async function canAssignWorkspaceRole({
  invokerRole,
  organizationId,
  targetRole,
}: {
  invokerRole: string;
  organizationId: string;
  targetRole: string;
}): Promise<boolean> {
  if (isBuiltInWorkspaceRole(targetRole)) {
    if (!isBuiltInWorkspaceRole(invokerRole)) {
      return false;
    }
    return WORKSPACE_ROLE_RANK[invokerRole] > WORKSPACE_ROLE_RANK[targetRole];
  }
  const targetRoleExists = await dynamicWorkspaceRoleExists(organizationId, targetRole);
  if (!targetRoleExists) {
    return false;
  }
  if (invokerRole === "owner" || invokerRole === "admin") {
    return true;
  }
  if (isBuiltInWorkspaceRole(invokerRole)) {
    return false;
  }
  return await dynamicWorkspaceRoleExists(organizationId, invokerRole);
}
