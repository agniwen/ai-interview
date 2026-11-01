import { and, eq } from "drizzle-orm";
import {
  clonePermissionStatements,
  normalizePermissionStatements,
} from "@app/shared/permission-statements";
import type { WorkspacePermissionStatements } from "@app/shared/permission-statements";
import { roles } from "@app/shared/permissions";
import { z } from "zod";
import { organizationRole } from "@app/db-schema/schema";
import { isNoAccessWorkspaceRole } from "./workspace-roles";

export interface WorkspacePermissionSnapshot {
  role: string;
  statements: WorkspacePermissionStatements;
}

type BuiltInRole = keyof typeof roles;
const permissionJsonSchema = z.json();

interface WorkspacePermissionSnapshotDependencies {
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
  const { db } = await import("@app/database/context");
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
  loadDynamicRolePermission,
};

function isBuiltInRole(role: string): role is BuiltInRole {
  return Object.hasOwn(roles, role);
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
 * - otherwise → role statements (built-in matrix or dynamic organizationRole JSON)
 */
export async function computeWorkspacePermissionSnapshot(
  {
    memberRole,
    organizationId,
  }: {
    memberRole: string;
    organizationId: string;
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

  return {
    role: memberRole,
    statements: clonePermissionStatements(roleStatements),
  };
}
