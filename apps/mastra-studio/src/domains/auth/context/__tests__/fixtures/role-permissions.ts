import type { RouteResponse } from "@mastra/client-js";

type RolePermissionsResponse = RouteResponse<"GET /auth/roles/:roleId/permissions">;

export const adminPermissions: RolePermissionsResponse = {
  permissions: ["*"],
  roleId: "admin",
};

export const viewerPermissions: RolePermissionsResponse = {
  permissions: ["stored-agents:read", "stored-skills:read"],
  roleId: "viewer",
};
