"use client";
import { authClient } from "@/lib/client/auth-client";
import type { statement } from "@arc/shared/permissions";

/**
 * 客户端权限校验：通过 better-auth 官方 checkRolePermission 同步本地解析
 * 当前用户在活跃 workspace 中的角色对 (resource, action) 是否被允许。
 * 不发请求，仅在浏览器内解析 ac/roles 矩阵。
 */
export function useHasPermission<R extends keyof typeof statement>(
  resource: R,
  action: (typeof statement)[R][number],
): boolean {
  const { data: org } = authClient.useActiveOrganization();
  const { data: session } = authClient.useSession();

  if (!org || !session?.user) {
    return false;
  }

  // Find current user's role in the active organization
  const member = org.members?.find((m) => m.userId === session.user.id);
  if (!member?.role) {
    return false;
  }

  return authClient.organization.checkRolePermission({
    permissions: { [resource]: [action] } as Record<string, string[]>,
    role: member.role,
  });
}
