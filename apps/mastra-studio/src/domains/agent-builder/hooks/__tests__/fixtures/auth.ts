import type { AuthCapabilities, CurrentUser } from "@/domains/auth/types";

/** The signed-in user used by hooks that scope reads to the caller. */
export const currentUser = {
  email: "user-1@example.com",
  id: "user-1",
} satisfies CurrentUser;

/** Auth enabled → new entities default to `private` (owned by creator). */
export const authEnabledCapabilities = {
  access: {
    permissions: [],
    roles: ["editor"],
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

/** Auth disabled → everything is `public` (no ownership concept). */
export const authDisabledCapabilities = {
  enabled: false,
  login: null,
} satisfies AuthCapabilities;

/**
 * Builds RBAC-enabled capabilities granting an explicit permission set, so
 * `usePermissions` resolves real `hasPermission`/`hasAnyPermission` checks.
 */
export const rbacCapabilities = (permissions: string[], roles: string[] = ["member"]) =>
  ({
    access: {
      permissions,
      roles,
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
  }) satisfies AuthCapabilities;

/**
 * Auth enabled with full permissions → new entities default to `private` and
 * `hasPermission('workspaces:write')` is true (workspace writes run).
 */
export const authEnabledWritableCapabilities = {
  access: {
    permissions: ["*"],
    roles: ["admin"],
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
