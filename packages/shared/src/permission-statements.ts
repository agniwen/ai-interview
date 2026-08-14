import type { statement } from "@arc/shared/permissions";

/**
 * Wire-friendly effective permission matrix for one user in one workspace.
 * Values are the allowed actions for each resource (subset of `statement`).
 */
export type WorkspacePermissionStatements = {
  [K in keyof typeof statement]?: (typeof statement)[K][number][];
};

export type PermissionResource = keyof typeof statement;
export type PermissionAction<R extends PermissionResource = PermissionResource> =
  (typeof statement)[R][number];

export function hasPermissionInStatements<R extends PermissionResource>(
  statements: WorkspacePermissionStatements | null | undefined,
  resource: R,
  action: PermissionAction<R>,
): boolean {
  const allowed = statements?.[resource];
  if (!allowed || allowed.length === 0) {
    return false;
  }
  return (allowed as readonly string[]).includes(action);
}

/**
 * Normalize role / DB permission blobs into a plain statements map.
 * Drops unknown keys and non-array values so callers can trust the shape.
 */
export function normalizePermissionStatements(value: unknown): WorkspacePermissionStatements {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: WorkspacePermissionStatements = {};
  for (const [resource, actions] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(actions)) {
      continue;
    }
    const normalized = actions.filter((action): action is string => typeof action === "string");
    if (normalized.length === 0) {
      continue;
    }
    (result as Record<string, string[]>)[resource] = normalized;
  }
  return result;
}

export function clonePermissionStatements(
  statements: WorkspacePermissionStatements,
): WorkspacePermissionStatements {
  const result: WorkspacePermissionStatements = {};
  for (const [resource, actions] of Object.entries(statements)) {
    if (!actions || actions.length === 0) {
      continue;
    }
    (result as Record<string, string[]>)[resource] = [...actions];
  }
  return result;
}
