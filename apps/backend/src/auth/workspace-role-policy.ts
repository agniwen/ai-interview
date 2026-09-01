import { and, eq } from "drizzle-orm";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import { organizationRole } from "@arc/db-schema/schema";
import type { Database } from "../infrastructure/database/database.tokens.js";

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
  database: Database,
  organizationId: string,
  role: string,
): Promise<boolean> {
  const [row] = await database
    .select({ id: organizationRole.id })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)),
    )
    .limit(1);
  return Boolean(row);
}

export async function canAssignWorkspaceRole(
  database: Database,
  input: {
    invokerRole: string;
    organizationId: string;
    targetRole: string;
  },
): Promise<boolean> {
  if (isBuiltInWorkspaceRole(input.targetRole)) {
    if (!isBuiltInWorkspaceRole(input.invokerRole)) {
      return false;
    }
    return WORKSPACE_ROLE_RANK[input.invokerRole] > WORKSPACE_ROLE_RANK[input.targetRole];
  }
  if (!(await dynamicWorkspaceRoleExists(database, input.organizationId, input.targetRole))) {
    return false;
  }
  if (input.invokerRole === "owner" || input.invokerRole === "admin") {
    return true;
  }
  if (isBuiltInWorkspaceRole(input.invokerRole)) {
    return false;
  }
  return dynamicWorkspaceRoleExists(database, input.organizationId, input.invokerRole);
}

export async function canAdminSetRole(
  database: Database,
  organizationId: string,
  role: string,
): Promise<boolean> {
  return (
    role === "member" ||
    isNoAccessWorkspaceRole(role) ||
    (await dynamicWorkspaceRoleExists(database, organizationId, role))
  );
}

export async function canOwnerSetRole(
  database: Database,
  organizationId: string,
  role: string,
): Promise<boolean> {
  return role === "admin" || (await canAdminSetRole(database, organizationId, role));
}
