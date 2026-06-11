"use client";
import { authClient } from "@/lib/client/auth-client";
import { useOptionalWorkspaceMemberRole } from "@/lib/client/workspace-context";
import type { AppRole, statement } from "@arc/shared/permissions";

const APP_ROLES = new Set<string>(["admin", "member", "owner"]);

/**
 * 客户端权限校验：通过 better-auth 官方 checkRolePermission 同步本地解析
 * 当前用户在活跃 workspace 中的角色对 (resource, action) 是否被允许。
 * 不发请求，仅在浏览器内解析 ac/roles 矩阵。
 */
export function useHasPermission<R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
): boolean {
  const workspaceMemberRole = useOptionalWorkspaceMemberRole();
  const { data: org } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();

  const memberRole =
    workspaceMemberRole ??
    org?.members?.find((member) => member.userId === session?.user?.id)?.role;
  if (!memberRole || !APP_ROLES.has(memberRole)) {
    return false;
  }

  return authClient.organization.checkRolePermission({
    permissions: { [resource]: [action] } as Record<string, string[]>,
    role: memberRole as AppRole,
  });
}
