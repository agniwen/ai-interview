import { and, eq } from "drizzle-orm";
import {
  clonePermissionStatements,
  normalizePermissionStatements,
} from "@app/shared/permission-statements";
import type { WorkspacePermissionStatements } from "@app/shared/permission-statements";
import { roles, statement } from "@app/shared/permissions";
import { z } from "zod";
import { organizationRole } from "@app/db-schema/schema";
import {
  listRecruitingGroupRoles,
  RECRUITING_GROUP_RESOURCES,
  statementsFromRecruitingGroupRoles,
} from "./recruiting-group-access";
import { isNoAccessWorkspaceRole } from "./workspace-roles";

export interface WorkspacePermissionSnapshot {
  role: string;
  statements: WorkspacePermissionStatements;
}

type BuiltInRole = keyof typeof roles;
type WorkspaceResource = keyof typeof statement;
const permissionJsonSchema = z.json();

interface WorkspacePermissionSnapshotDependencies {
  listGroupRoles: typeof listRecruitingGroupRoles;
  loadDynamicRolePermission: (input: {
    organizationId: string;
    role: string;
  }) => Promise<string | null>;
}

async function loadDynamicRolePermission({
  organizationId,
  role,
}: {
  organizationId: string;
  role: string;
}): Promise<string | null> {
  const { db } = await import("@server/lib/server/db/index");
  const [row] = await db
    .select({ permission: organizationRole.permission })
    .from(organizationRole)
    .where(
      and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)),
    )
    .limit(1);
  return row?.permission ?? null;
}

const defaultDependencies: WorkspacePermissionSnapshotDependencies = {
  listGroupRoles: listRecruitingGroupRoles,
  loadDynamicRolePermission,
};

function isBuiltInRole(role: string): role is BuiltInRole {
  return Object.hasOwn(roles, role);
}

function isWorkspaceResource(resource: string): resource is WorkspaceResource {
  return Object.hasOwn(statement, resource);
}

async function loadRoleStatements({
  dependencies,
  organizationId,
  role,
}: {
  dependencies: WorkspacePermissionSnapshotDependencies;
  organizationId: string;
  role: string;
}): Promise<WorkspacePermissionStatements> {
  if (isBuiltInRole(role)) {
    return normalizePermissionStatements(permissionJsonSchema.parse(roles[role].statements));
  }

  const permission = await dependencies.loadDynamicRolePermission({ organizationId, role });
  if (!permission) {
    return {};
  }

  try {
    return normalizePermissionStatements(permissionJsonSchema.parse(JSON.parse(permission)));
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
export async function computeWorkspacePermissionSnapshot(
  {
    memberRole,
    organizationId,
    userId,
  }: {
    memberRole: string;
    organizationId: string;
    userId: string;
  },
  dependencies: WorkspacePermissionSnapshotDependencies = defaultDependencies,
): Promise<WorkspacePermissionSnapshot> {
  if (isNoAccessWorkspaceRole(memberRole)) {
    return { role: memberRole, statements: {} };
  }

  const roleStatements = await loadRoleStatements({
    dependencies,
    organizationId,
    role: memberRole,
  });

  if (memberRole !== "member") {
    return {
      role: memberRole,
      statements: clonePermissionStatements(roleStatements),
    };
  }

  const groupRoles = await dependencies.listGroupRoles({ organizationId, userId });
  const groupStatements = statementsFromRecruitingGroupRoles(groupRoles);
  const roleClone = clonePermissionStatements(roleStatements);
  const statements: WorkspacePermissionStatements = {};

  // Keep non-recruiting role grants. Recruiting resources come from group membership only.
  for (const [resource, actions] of Object.entries(roleClone)) {
    if (!isWorkspaceResource(resource)) {
      continue;
    }
    if (RECRUITING_GROUP_RESOURCES.has(resource)) {
      continue;
    }
    if (actions) {
      Object.assign(statements, { [resource]: [...actions] });
    }
  }
  for (const resource of RECRUITING_GROUP_RESOURCES) {
    const groupActions = groupStatements[resource];
    if (groupActions && groupActions.length > 0) {
      Object.assign(statements, { [resource]: [...groupActions] });
    }
  }

  // Ensure we never invent actions outside the catalog when merging.
  for (const [resource, actions] of Object.entries(statements)) {
    if (!isWorkspaceResource(resource) || !actions) {
      continue;
    }
    Object.assign(statements, {
      [resource]: actions.filter((action) => [...statement[resource]].includes(action)),
    });
  }

  return { role: memberRole, statements };
}
