import type { AuthCapabilities } from "@/domains/auth/types";

export const readOnlyAuthCapabilities = {
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
