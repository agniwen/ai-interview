import type { JsonValue } from "@arc/db-schema/json";
import { statement } from "@arc/shared/permissions";
import { z } from "zod";

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
  return allowed.some((allowedAction) => allowedAction === action);
}

const permissionStatementsInputSchema = z.record(z.string(), z.json());

/**
 * Normalize role / DB permission blobs into a plain statements map.
 * Drops unknown keys and non-array values so callers can trust the shape.
 */
export function normalizePermissionStatements(value: JsonValue): WorkspacePermissionStatements {
  const parsed = permissionStatementsInputSchema.safeParse(value);
  if (!parsed.success) {
    return {};
  }

  const entries: [PermissionResource, string[]][] = [];
  for (const [resource, actions] of Object.entries(parsed.data)) {
    if (!(resource in statement)) {
      continue;
    }
    const parsedActions = z.array(z.json()).safeParse(actions);
    if (!parsedActions.success || parsedActions.data.length === 0) {
      continue;
    }
    // SAFETY: The `resource in statement` check narrows this runtime key to the permission catalog.
    const permissionResource = resource as PermissionResource;
    const allowedActions: readonly string[] = statement[permissionResource];
    const validActions = parsedActions.data.flatMap((action) => {
      const parsedAction = z.string().safeParse(action);
      return parsedAction.success && allowedActions.includes(parsedAction.data)
        ? [parsedAction.data]
        : [];
    });
    if (validActions.length > 0) {
      entries.push([permissionResource, validActions]);
    }
  }
  // SAFETY: Every key and action was checked against the matching `statement` catalog entry.
  return Object.fromEntries(entries) as WorkspacePermissionStatements;
}

export function clonePermissionStatements(
  statements: WorkspacePermissionStatements,
): WorkspacePermissionStatements {
  const entries = Object.entries(statements).flatMap(([resource, actions]) =>
    actions && actions.length > 0 ? [[resource, [...actions]]] : [],
  );
  // SAFETY: The source is already a validated WorkspacePermissionStatements map and cloning preserves keys/actions.
  return Object.fromEntries(entries) as WorkspacePermissionStatements;
}
