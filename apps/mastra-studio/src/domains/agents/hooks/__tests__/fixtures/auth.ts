import type { AuthCapabilities } from "@/domains/auth/types";

/**
 * RBAC disabled → `usePermissions` allows everything, so
 * `hasPermission('workspaces:write')` is true and workspace writes run.
 */
export const writeAllowedCapabilities = {
  enabled: false,
  login: null,
} satisfies AuthCapabilities;

/**
 * RBAC enabled with no granted permissions → `hasPermission('workspaces:write')`
 * is false, so the workspace-write step is skipped.
 */
export const writeDeniedCapabilities = {
  access: {
    permissions: [],
    roles: ["viewer"],
  },
  capabilities: {
    acl: false,
    rbac: true,
    session: true,
    sso: false,
    user: true,
  },
  enabled: true,
  login: null,
  user: { id: "user-1" },
} satisfies AuthCapabilities;
