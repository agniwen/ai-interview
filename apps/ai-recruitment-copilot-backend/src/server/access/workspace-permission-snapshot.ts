import { and, eq } from "drizzle-orm";
import {
  clonePermissionStatements,
  normalizePermissionStatements,
} from "@arc/shared/permission-statements";
import type { WorkspacePermissionStatements } from "@arc/shared/permission-statements";
import { roles, statement } from "@arc/shared/permissions";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { organizationRole } from "@arc/db-schema/schema";
import {
  listRecruitingGroupRoles,
  RECRUITING_GROUP_RESOURCES,
  statementsFromRecruitingGroupRoles,
} from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-group-access";
import { isNoAccessWorkspaceRole } from "@arc/ai-recruitment-copilot-backend/server/access/workspace-roles";

export interface WorkspacePermissionSnapshot {
  role: string;
  statements: WorkspacePermissionStatements;
}

type BuiltInRole = keyof typeof roles;

function isBuiltInRole(role: string): role is BuiltInRole {
  return Object.hasOwn(roles, role);
}

async function loadRoleStatements({
  organizationId,
  role,
}: {
  organizationId: string;
  role: string;
}): Promise<WorkspacePermissionStatements> {
  if (isBuiltInRole(role)) {
    return normalizePermissionStatements(roles[role].statements);
  }

  const [row] = await db
    .select({ permission: organizationRole.permission })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)),
    )
    .limit(1);

  if (!row) {
    return {};
  }

  try {
    return normalizePermissionStatements(JSON.parse(row.permission) as unknown);
  } catch {
    return {};
  }
}

/**
 * Single source of truth for effective workspace permissions (UI + API).
 *
 * Rules:
 * - noAccess → empty
 * - member + recruiting-group resources → group membership only
 * - otherwise → role statements (built-in matrix or dynamic organizationRole JSON)
 */
export async function computeWorkspacePermissionSnapshot({
  memberRole,
  organizationId,
  userId,
}: {
  memberRole: string;
  organizationId: string;
  userId: string;
}): Promise<WorkspacePermissionSnapshot> {
  if (isNoAccessWorkspaceRole(memberRole)) {
    return { role: memberRole, statements: {} };
  }

  const roleStatements = await loadRoleStatements({
    organizationId,
    role: memberRole,
  });

  if (memberRole !== "member") {
    return {
      role: memberRole,
      statements: clonePermissionStatements(roleStatements),
    };
  }

  const groupRoles = await listRecruitingGroupRoles({ organizationId, userId });
  const groupStatements = statementsFromRecruitingGroupRoles(groupRoles);
  const statements = clonePermissionStatements(roleStatements);

  // member + recruiting resources ignore the role matrix and use group grants only.
  for (const resource of RECRUITING_GROUP_RESOURCES) {
    const groupActions = groupStatements[resource];
    if (groupActions && groupActions.length > 0) {
      (statements as Record<string, string[]>)[resource] = [...groupActions];
    } else {
      delete (statements as Record<string, unknown>)[resource];
    }
  }

  // Ensure we never invent actions outside the catalog when merging.
  for (const resource of Object.keys(statements) as (keyof typeof statement)[]) {
    const allowedCatalog = statement[resource] as readonly string[] | undefined;
    const actions = statements[resource];
    if (!allowedCatalog || !actions) {
      continue;
    }
    (statements as Record<string, string[]>)[resource] = actions.filter((action) =>
      allowedCatalog.includes(action),
    );
  }

  return { role: memberRole, statements };
}
