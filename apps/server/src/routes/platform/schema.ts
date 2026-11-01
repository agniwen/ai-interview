import { PLATFORM_INITIAL_WORKSPACE_ROLES } from "@app/shared/permissions";
import { z } from "zod";

// 角色只接受白名单，不信任前端传入的任意值（例如 owner 或工作区自定义角色）。
// Only whitelisted roles are accepted; arbitrary client values such as owner are rejected.
export const addUserWorkspaceSchema = z.object({
  organizationId: z.string().trim().min(1),
  role: z.enum(PLATFORM_INITIAL_WORKSPACE_ROLES, { error: "工作区角色无效" }),
});
