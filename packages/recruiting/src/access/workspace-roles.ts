import { and, eq } from "drizzle-orm";
import { db } from "@app/database/context";
import { organizationRole } from "@app/db-schema/schema";
import { NO_ACCESS_WORKSPACE_ROLE } from "@app/shared/permissions";
import type { AppRole } from "@app/shared/permissions";

type BuiltInWorkspaceRole = AppRole;

// 拥有者 > 管理员 > 招聘主管 > 招聘专员 > 面试官 > 待分配；只能邀请或指派低于自己的内置角色。
// Built-in roles can only grant built-in roles ranked below the invoker.
const WORKSPACE_ROLE_RANK = {
  admin: 4,
  interviewer: 1,
  member: 2,
  noAccess: 0,
  owner: 5,
  recruitingSupervisor: 3,
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
