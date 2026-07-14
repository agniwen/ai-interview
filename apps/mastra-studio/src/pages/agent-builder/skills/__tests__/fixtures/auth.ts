import type { AuthCapabilities, CurrentUser } from "@/domains/auth/types";

/** The signed-in user returned by `GET /api/auth/me`. */
export const currentUser = {
  email: "user-1@example.com",
  id: "user-1",
} satisfies CurrentUser;

/** Auth disabled → RBAC is off, so every `hasPermission` check passes. */
export const authDisabledCapabilities = {
  enabled: false,
  login: null,
} satisfies AuthCapabilities;

/**
 * Builds RBAC-enabled capabilities granting an explicit permission set, so
 * `usePermissions` resolves real `hasPermission` checks against it.
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
